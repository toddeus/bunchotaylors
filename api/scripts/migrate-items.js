/**
 * One-time migration: populate the `items` field on all photo posts in DynamoDB.
 *
 * For each non-video post, lists S3 objects under post.dir and writes the
 * resulting filenames back to DynamoDB as post.items.
 *
 * Usage:
 *   DYNAMODB_TABLE=<table> S3_BUCKET=<bucket> node --experimental-vm-modules scripts/migrate-items.js
 *
 * Dry run (no writes):
 *   DRY_RUN=true DYNAMODB_TABLE=<table> S3_BUCKET=<bucket> node --experimental-vm-modules scripts/migrate-items.js
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const TABLE_NAME = process.env.DYNAMODB_TABLE;
const BUCKET = process.env.S3_BUCKET;
const DRY_RUN = process.env.DRY_RUN === 'true';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE env var required'); process.exit(1); }
if (!BUCKET)     { console.error('ERROR: S3_BUCKET env var required'); process.exit(1); }

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

// ── DynamoDB: full table scan ─────────────────────────────────────────────────

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await ddb.send(new ScanCommand(params));
    if (result.Items) items.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── S3: list image filenames under a dir prefix ───────────────────────────────

async function listPhotoItems(dir) {
  const filenames = [];
  let continuationToken;
  const prefix = dir.endsWith('/') ? dir : dir + '/';

  do {
    const params = { Bucket: BUCKET, Prefix: prefix, Delimiter: '/' };
    if (continuationToken) params.ContinuationToken = continuationToken;

    const result = await s3.send(new ListObjectsV2Command(params));

    if (result.Contents) {
      for (const obj of result.Contents) {
        const filename = obj.Key.slice(prefix.length);
        if (!filename || filename.startsWith('.')) continue;
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) continue;
        if (!IMAGE_EXTENSIONS.has(filename.slice(lastDot).toLowerCase())) continue;
        filenames.push(filename);
      }
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return filenames;
}

// ── DynamoDB: write items list back to a post ─────────────────────────────────

async function updateItems(id, items) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: 'SET #items = :items',
    ExpressionAttributeNames: { '#items': 'items' },
    ExpressionAttributeValues: { ':items': items },
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Table : ${TABLE_NAME}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Mode  : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  const allPosts = await scanAll();
  console.log(`Scanned ${allPosts.length} total records.\n`);

  const photoPosts = allPosts.filter(
    (p) => !p.video || p.video.trim() === ''
  );
  const videoPosts = allPosts.length - photoPosts.length;

  console.log(`Photo posts : ${photoPosts.length}`);
  console.log(`Video posts : ${videoPosts} (skipped)\n`);

  let updated = 0;
  let skipped = 0;
  const missing = []; // posts where S3 returned 0 items

  for (const post of photoPosts) {
    const label = `[${post.id}] "${post.title}" (${post.postdate}) dir=${post.dir}`;

    if (!post.dir) {
      console.warn(`  SKIP  ${label} — no dir field`);
      skipped++;
      continue;
    }

    const items = await listPhotoItems(post.dir);

    if (items.length === 0) {
      console.warn(`  MISSING ${label} — 0 images found in S3`);
      missing.push({ id: post.id, title: post.title, postdate: post.postdate, dir: post.dir });
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await updateItems(post.id, items);
      console.log(`  OK    ${label} — wrote ${items.length} items`);
    }
    updated++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════');
  console.log('MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total records  : ${allPosts.length}`);
  console.log(`Video (skipped): ${videoPosts}`);
  console.log(`Photo processed: ${photoPosts.length}`);
  console.log(`  Updated      : ${DRY_RUN ? `${updated} (dry run, no writes)` : updated}`);
  console.log(`  Skipped/err  : ${skipped}`);
  console.log(`  Missing in S3: ${missing.length}`);

  if (missing.length > 0) {
    console.log('\nPosts with no S3 images found:');
    console.log('  ID         | Date       | Title                          | Dir');
    console.log('  -----------|------------|--------------------------------|--------------------');
    for (const p of missing) {
      const id    = String(p.id).padEnd(10);
      const date  = String(p.postdate).padEnd(10);
      const title = String(p.title).slice(0, 30).padEnd(30);
      console.log(`  ${id} | ${date} | ${title} | ${p.dir}`);
    }
  }

  console.log('═══════════════════════════════════════\n');

  if (missing.length > 0) {
    process.exit(2); // non-zero to signal attention needed, but not a failure
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
