/**
 * S3 orphan audit: finds S3 content with no matching DynamoDB post.
 *
 * Photo logic : each album dir (photo/{year}/{album}/) must match a post's `dir`
 * Video logic : each video file (video/{year}/{file}.mp4) must match a post's `dir` + `video`
 *               Thumbnail images (.jpg/.png/etc) alongside videos are skipped.
 *
 * Usage:
 *   DYNAMODB_TABLE=<table> S3_BUCKET=<bucket> node scripts/audit-s3-orphans.js
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const TABLE_NAME = process.env.DYNAMODB_TABLE;
const BUCKET     = process.env.S3_BUCKET;

if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE env var required'); process.exit(1); }
if (!BUCKET)     { console.error('ERROR: S3_BUCKET env var required'); process.exit(1); }

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.m4v', '.mkv', '.wmv']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

function ext(filename) {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

function normalize(dir) {
  return dir.endsWith('/') ? dir : dir + '/';
}

// ── DynamoDB: build lookup sets ───────────────────────────────────────────────

async function getDynamoLookups() {
  const photoDirs  = new Set(); // normalized dir for photo posts
  const videoFiles = new Set(); // normalized dir + video filename for video posts

  let lastKey;
  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await ddb.send(new ScanCommand(params));
    for (const item of result.Items || []) {
      if (!item.dir) continue;
      const dir = normalize(item.dir);
      if (item.video && item.video.trim() !== '') {
        videoFiles.add(dir + item.video.trim());
      } else {
        photoDirs.add(dir);
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return { photoDirs, videoFiles };
}

// ── S3: list all keys under a prefix ─────────────────────────────────────────

async function listAllKeys(prefix) {
  const keys = [];
  let continuationToken;
  const normalizedPrefix = normalize(prefix);

  do {
    const params = { Bucket: BUCKET, Prefix: normalizedPrefix };
    if (continuationToken) params.ContinuationToken = continuationToken;
    const result = await s3.send(new ListObjectsV2Command(params));
    for (const obj of result.Contents || []) keys.push(obj.Key);
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

// ── Derive unique album dirs from photo keys ──────────────────────────────────
// photo/{year}/{album}/filename.jpg  →  photo/{year}/{album}/

function extractPhotoDirs(keys) {
  const dirs = new Set();
  for (const key of keys) {
    const parts = key.split('/');
    // Expect: photo / {year} / {album} / {filename}
    if (parts.length >= 4) {
      dirs.add(parts.slice(0, 3).join('/') + '/');
    }
  }
  return dirs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Table : ${TABLE_NAME}`);
  console.log(`Bucket: ${BUCKET}\n`);

  const [{ photoDirs, videoFiles }, photoKeys, videoKeys] = await Promise.all([
    getDynamoLookups(),
    listAllKeys('photo'),
    listAllKeys('video'),
  ]);

  // Photo orphans: album dirs with no matching DynamoDB post
  const s3PhotoDirs   = extractPhotoDirs(photoKeys);
  const photoOrphans  = [...s3PhotoDirs].filter((d) => !photoDirs.has(d)).sort();

  // Video orphans: video files with no matching DynamoDB post
  // Skip thumbnail images (same name, different extension — not a separate post)
  const videoOrphans = videoKeys
    .filter((key) => {
      const filename = key.split('/').pop();
      return VIDEO_EXTENSIONS.has(ext(filename));
    })
    .filter((key) => !videoFiles.has(key))
    .sort();

  // Stats
  console.log(`DynamoDB photo posts : ${photoDirs.size}`);
  console.log(`DynamoDB video posts : ${videoFiles.size}`);
  console.log(`S3 photo album dirs  : ${s3PhotoDirs.size}`);
  console.log(`S3 video files       : ${videoKeys.filter((k) => VIDEO_EXTENSIONS.has(ext(k.split('/').pop()))).length}`);

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('AUDIT SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Photo orphans (S3 album with no post): ${photoOrphans.length}`);
  console.log(`Video orphans (S3 file with no post) : ${videoOrphans.length}`);

  if (photoOrphans.length > 0) {
    console.log('\nOrphaned photo albums:');
    for (const d of photoOrphans) console.log(`  ${d}`);
  }

  if (videoOrphans.length > 0) {
    console.log('\nOrphaned video files:');
    for (const k of videoOrphans) console.log(`  ${k}`);
  }

  console.log('═══════════════════════════════════════\n');

  if (photoOrphans.length > 0 || videoOrphans.length > 0) process.exit(2);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
