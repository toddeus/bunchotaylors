/**
 * migrate.js — SQLite → DynamoDB migration
 *
 * Reads all rows from the SQLite `post` table and writes them to the
 * DynamoDB `bot-posts` table, adding the two GSI attributes required
 * by the new data model:
 *   _type   = "POST"            (partition key for DateIndex)
 *   monthday = "MM-DD"          (partition key for MonthDayIndex)
 *
 * Usage:
 *   npm install          (installs better-sqlite3 + AWS SDK)
 *   node migrate.js [--db path/to/bunchotaylors.db] [--table bot-posts] [--dry-run]
 *
 * AWS credentials must be configured in the environment (aws configure,
 * env vars, or EC2/Lambda instance role).  The target region is read
 * from AWS_REGION or defaults to us-east-1.
 *
 * DynamoDB BatchWriteItem is limited to 25 items per call; this script
 * chunks automatically and retries any unprocessed items.
 */

'use strict';

const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}
const DRY_RUN   = args.includes('--dry-run');
const DB_PATH   = getArg('--db',    path.join(__dirname, '../temp/bunchotaylors.db'));
const TABLE     = getArg('--table', 'bot-posts');
const REGION    = process.env.AWS_REGION || 'us-east-1';
const CHUNK     = 25;   // DynamoDB BatchWriteItem max
const MAX_RETRY = 4;    // retries for unprocessed items

// ── DynamoDB client ─────────────────────────────────────────────────────────
const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
);

// ── SQLite reader ───────────────────────────────────────────────────────────
function loadRows(dbPath) {
  // Lazy-require so the error message is clear if the package is missing
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error(
      '\nERROR: better-sqlite3 not found.\n' +
      'Run:  npm install  inside the infra/ directory first.\n'
    );
    process.exit(1);
  }

  const db   = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT * FROM post ORDER BY id ASC').all();
  db.close();
  return rows;
}

// ── Transform one SQLite row → DynamoDB item ────────────────────────────────
function transform(row) {
  // Derive monthday from postdate (YYYY-MM-DD → MM-DD)
  let monthday = null;
  if (row.postdate && /^\d{4}-\d{2}-\d{2}$/.test(row.postdate)) {
    monthday = row.postdate.slice(5); // "MM-DD"
  }

  const item = {
    id:       String(row.id),   // DynamoDB PK is String; preserve original int value
    _type:    'POST',           // constant — used by DateIndex GSI
    ...(monthday ? { monthday } : {}),  // omit when null — DynamoDB index key cannot be null
    postdate: row.postdate || null,
    title:    row.title    || null,
    dir:      row.dir      || null,
    thumb:    row.thumb    || null,
    // video: only include when non-null / non-empty so photo posts omit the key entirely
    ...(row.video && row.video.trim() ? { video: row.video.trim() } : {}),
    // tags: exclude NULL string and empty values
    ...normalizeTag('tag1', row.tag1),
    ...normalizeTag('tag2', row.tag2),
    ...normalizeTag('tag3', row.tag3),
  };

  return item;
}

function normalizeTag(key, val) {
  if (!val || val.trim() === '' || val.toUpperCase() === 'NULL') return {};
  return { [key]: val.trim().toLowerCase() };
}

// ── DynamoDB batch writer ───────────────────────────────────────────────────
async function batchWrite(items) {
  const requests = items.map(item => ({ PutRequest: { Item: item } }));

  let remaining = requests;
  let attempt   = 0;

  while (remaining.length > 0 && attempt < MAX_RETRY) {
    attempt++;
    const params = { RequestItems: { [TABLE]: remaining } };

    try {
      const result = await dynamo.send(new BatchWriteCommand(params));
      const unprocessed = result.UnprocessedItems?.[TABLE];
      if (unprocessed && unprocessed.length > 0) {
        console.warn(`  ⚠ ${unprocessed.length} unprocessed items — retrying (attempt ${attempt})…`);
        await sleep(200 * attempt); // back off
        remaining = unprocessed;
      } else {
        remaining = [];
      }
    } catch (err) {
      if (attempt >= MAX_RETRY) throw err;
      console.warn(`  ⚠ Batch error (attempt ${attempt}): ${err.message} — retrying…`);
      await sleep(300 * attempt);
    }
  }

  if (remaining.length > 0) {
    throw new Error(`Failed to write ${remaining.length} items after ${MAX_RETRY} attempts.`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nBunch-o-Taylors — SQLite → DynamoDB migration`);
  console.log(`  Source : ${DB_PATH}`);
  console.log(`  Target : ${TABLE} (${REGION})`);
  if (DRY_RUN) console.log(`  Mode   : DRY RUN — no writes to DynamoDB\n`);
  else          console.log(`  Mode   : LIVE — writing to DynamoDB\n`);

  // 1. Read SQLite
  console.log('Reading SQLite database…');
  const rows = loadRows(DB_PATH);
  console.log(`  Found ${rows.length} rows in post table.\n`);

  if (rows.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // 2. Transform
  console.log('Transforming rows…');
  const items = rows.map(transform);

  // Validation summary
  const missingPostdate = items.filter(i => !i.postdate).length;
  const missingMonthday = items.filter(i => !i.monthday).length;
  const videoCount      = items.filter(i => i.video).length;
  console.log(`  ${items.length} items ready`);
  console.log(`  ${videoCount} video posts`);
  if (missingPostdate) console.warn(`  ⚠ ${missingPostdate} items have no postdate`);
  if (missingMonthday) console.warn(`  ⚠ ${missingMonthday} items have no monthday (will not appear in Today-in-History)`);
  console.log();

  // 3. Preview first 3 items
  console.log('Sample items:');
  items.slice(0, 3).forEach(item => {
    console.log(' ', JSON.stringify(item));
  });
  console.log();

  if (DRY_RUN) {
    console.log('Dry run complete. Re-run without --dry-run to write to DynamoDB.');
    return;
  }

  // 4. Write in batches of 25
  const batches = chunk(items, CHUNK);
  console.log(`Writing ${items.length} items in ${batches.length} batch${batches.length !== 1 ? 'es' : ''}…`);

  let written = 0;
  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`  Batch ${i + 1}/${batches.length} (${batches[i].length} items)… `);
    await batchWrite(batches[i]);
    written += batches[i].length;
    process.stdout.write(`done (${written}/${items.length} total)\n`);
  }

  console.log(`\n✓ Migration complete — ${written} items written to ${TABLE}.\n`);
}

main().catch(err => {
  console.error('\n✗ Migration failed:', err.message);
  process.exit(1);
});
