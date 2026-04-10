/**
 * One-time fix: correct postdate year/month mismatches in DynamoDB.
 *
 * For each photo post where postdate year/month differs from the year/month
 * encoded in the `dir` field, this script:
 *   1. Locates the original photos under MEDIA_ROOT
 *   2. Reads EXIF DateTimeOriginal from every image in that directory
 *   3. Uses the most-common date (mode) as the new postdate
 *   4. Falls back to YYYY-MM-01 derived from dir if no EXIF dates are found
 *   5. Updates DynamoDB (postdate + monthday GSI key) and writes a CSV log
 *
 * Usage:
 *   DYNAMODB_TABLE=bot-posts node scripts/fix-postdates-dynamo.js
 *
 * Optional env vars:
 *   DB_PATH    path to bunchotaylors.db  (default: see below)
 *   MEDIA_ROOT path to local photo root  (default: D:\Media\Family)
 *   LOG_PATH   path for CSV output       (default: see below)
 */

import initSqlJs from 'sql.js';
import { DynamoDBClient }                    from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { readdir }                        from 'fs/promises';
import { existsSync, createWriteStream, readFileSync } from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';
import exifr             from 'exifr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TABLE_NAME = process.env.DYNAMODB_TABLE;
const DB_PATH    = process.env.DB_PATH
  || path.resolve(__dirname, '../../../bunchotaylors-admin/docs/bunchotaylors.db');
const MEDIA_ROOT = process.env.MEDIA_ROOT || 'D:\\Media\\Family';
const LOG_PATH   = process.env.LOG_PATH
  || path.resolve(__dirname, '../../../bunchotaylors-admin/docs/date-fix-results.csv');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.heic']);

if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE env var required'); process.exit(1); }
if (!existsSync(DB_PATH)) { console.error(`ERROR: DB not found at ${DB_PATH}`); process.exit(1); }

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── SQLite: load all photo posts ──────────────────────────────────────────────

async function loadPostsFromSqlite() {
  const SQL = await initSqlJs();
  const buf = readFileSync(DB_PATH);
  const db  = new SQL.Database(buf);

  const result = db.exec(`
    SELECT id, postdate, dir, title
    FROM   post
    WHERE  (tag1 IS NULL OR tag1 != 'video')
      AND  dir IS NOT NULL
      AND  dir LIKE 'photo/%'
  `);
  db.close();

  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

// ── Dir parsing ───────────────────────────────────────────────────────────────
// "photo/2018/12_Flying_to_Vermont" → { year:'2018', month:'12', name:'Flying to Vermont' }

function parseDir(dir) {
  const parts = dir.split('/');
  if (parts.length < 3) return null;

  const year    = parts[1];
  const segment = parts[2];                          // "12_Flying_to_Vermont"
  const sep     = segment.indexOf('_');
  if (sep === -1) return null;

  const month = segment.slice(0, sep).padStart(2, '0');
  const name  = segment.slice(sep + 1).replace(/_/g, ' ');
  return { year, month, name };
}

// ── Mismatch detection ────────────────────────────────────────────────────────
// Returns true only when year OR month in postdate disagrees with dir.
// Same year+month with a different day is ignored per spec.

function hasMismatch(postdate, parsed) {
  if (!parsed || !postdate) return false;
  const [pdYear, pdMonth] = postdate.split('-');
  return pdYear !== parsed.year || pdMonth !== parsed.month;
}

// ── Local directory lookup ────────────────────────────────────────────────────
// Scans MEDIA_ROOT/<year>/ for a subdirectory starting with "<MM> " (e.g. "12 December"),
// then confirms the post name subdirectory exists inside it.

async function findLocalDir(year, month, name) {
  const yearDir = path.join(MEDIA_ROOT, year);
  if (!existsSync(yearDir)) return null;

  let entries;
  try {
    entries = await readdir(yearDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const monthEntry = entries.find(
    (e) => e.isDirectory() && e.name.startsWith(month + ' ')
  );
  if (!monthEntry) return null;

  const postDir = path.join(yearDir, monthEntry.name, name);
  return existsSync(postDir) ? postDir : null;
}

// ── EXIF date extraction ──────────────────────────────────────────────────────
// Returns an array of "YYYY-MM-DD" strings, one per readable image.

async function readExifDates(dirPath) {
  let files;
  try {
    files = await readdir(dirPath);
  } catch {
    return [];
  }

  const dates = [];

  for (const file of files) {
    if (file.startsWith('.')) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;

    try {
      const data = await exifr.parse(
        path.join(dirPath, file),
        ['DateTimeOriginal', 'DateTime']
      );
      const raw = data?.DateTimeOriginal ?? data?.DateTime;
      if (!raw) continue;

      const d = raw instanceof Date ? raw : new Date(raw);
      if (isNaN(d.getTime())) continue;

      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    } catch {
      // unreadable file — skip silently
    }
  }

  return dates;
}

// ── Month difference between two "YYYY-MM-DD" strings ────────────────────────
// Returns absolute number of months apart, accounting for year boundaries.

function monthDiff(dateA, dateB) {
  const [yearA, monthA] = dateA.split('-').map(Number);
  const [yearB, monthB] = dateB.split('-').map(Number);
  return Math.abs((yearA - yearB) * 12 + (monthA - monthB));
}

// ── Mode of a string array ────────────────────────────────────────────────────
// Ties broken by earliest date.

function modeDate(dates) {
  const counts = {};
  for (const d of dates) counts[d] = (counts[d] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

// ── DynamoDB update ───────────────────────────────────────────────────────────
// Updates both postdate and monthday (MonthDayIndex GSI partition key).

async function updatePostdate(id, newPostdate) {
  const monthday = newPostdate.slice(5); // "MM-DD"
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id: String(id) },
    UpdateExpression: 'SET postdate = :pd, monthday = :md',
    ExpressionAttributeValues: { ':pd': newPostdate, ':md': monthday },
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Table     : ${TABLE_NAME}`);
  console.log(`DB        : ${DB_PATH}`);
  console.log(`Media root: ${MEDIA_ROOT}`);
  console.log(`Log       : ${LOG_PATH}\n`);

  const posts      = await loadPostsFromSqlite();
  console.log(`Loaded ${posts.length} photo posts from SQLite.`);

  const candidates = posts.filter((p) => hasMismatch(p.postdate, parseDir(p.dir)));
  console.log(`Found ${candidates.length} posts with year/month mismatch.\n`);

  const log = createWriteStream(LOG_PATH, { encoding: 'utf8' });
  log.write('id,original_postdate,new_postdate,dir,source,result\n');

  let updated      = 0;
  let noDir        = 0;
  let skippedClose = 0;

  for (const post of candidates) {
    const parsed = parseDir(post.dir);
    const { year, month, name } = parsed;
    const label = `[${post.id}] "${post.title}" dir=${post.dir} was=${post.postdate}`;

    const localDir = await findLocalDir(year, month, name);
    if (!localDir) {
      console.warn(`  NO LOCAL DIR  ${label}`);
      log.write(`${post.id},${post.postdate},,${post.dir},,no_local_dir\n`);
      noDir++;
      continue;
    }

    const dates = await readExifDates(localDir);
    let newPostdate, source;

    if (dates.length > 0) {
      newPostdate = modeDate(dates);
      source = 'exif';
    } else {
      newPostdate = `${year}-${month}-01`;
      source = 'fallback';
    }

    // Skip if new date is within 2 months of the existing postdate (both sources)
    if (monthDiff(newPostdate, post.postdate) <= 2) {
      console.log(`  SKIP (close)  ${label} → ${newPostdate} (${source})`);
      log.write(`${post.id},${post.postdate},${newPostdate},${post.dir},${source},skipped_within_2_months\n`);
      skippedClose++;
      continue;
    }

    await updatePostdate(post.id, newPostdate);
    console.log(`  UPDATED       ${label} → ${newPostdate} (${source})`);
    log.write(`${post.id},${post.postdate},${newPostdate},${post.dir},${source},updated\n`);
    updated++;
  }

  log.end();

  console.log('\n═══════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Candidates       : ${candidates.length}`);
  console.log(`Updated          : ${updated}`);
  console.log(`Skipped (≤2 mo)  : ${skippedClose}`);
  console.log(`No local dir     : ${noDir}`);
  console.log(`Log written to   : ${LOG_PATH}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
