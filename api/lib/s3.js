import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.S3_BUCKET;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

const s3 = new S3Client({});

/**
 * List photo filenames under a given S3 prefix (dir).
 * Returns only image files, excludes dot-files and non-image extensions.
 * @param {string} dir - S3 prefix, e.g. "2021/05-14-birthday/"
 * @returns {Promise<string[]>} array of filenames (not full keys)
 */
export async function listPhotoItems(dir) {
  const filenames = [];
  let continuationToken;

  // Normalize dir to end with a slash
  const prefix = dir.endsWith('/') ? dir : dir + '/';

  do {
    const params = {
      Bucket: BUCKET,
      Prefix: prefix,
      Delimiter: '/',
    };
    if (continuationToken) {
      params.ContinuationToken = continuationToken;
    }

    const result = await s3.send(new ListObjectsV2Command(params));

    if (result.Contents) {
      for (const obj of result.Contents) {
        const key = obj.Key;
        // Get just the filename (strip the prefix)
        const filename = key.slice(prefix.length);

        // Skip empty strings (the prefix itself if listed)
        if (!filename) continue;

        // Skip dot-files
        if (filename.startsWith('.')) continue;

        // Check extension
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) continue;
        const ext = filename.slice(lastDot).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        filenames.push(filename);
      }
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return filenames;
}

/**
 * List all image keys recursively under a given S3 prefix.
 * Unlike listPhotoItems, this uses no Delimiter so it traverses all subdirectories.
 * @param {string} prefix - e.g. "photo/"
 * @returns {Promise<string[]>} array of full S3 keys
 */
export async function listAllPhotoKeys(prefix) {
  const keys = [];
  let continuationToken;

  const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';

  do {
    const params = {
      Bucket: BUCKET,
      Prefix: normalizedPrefix,
    };
    if (continuationToken) {
      params.ContinuationToken = continuationToken;
    }

    const result = await s3.send(new ListObjectsV2Command(params));

    if (result.Contents) {
      for (const obj of result.Contents) {
        const key = obj.Key;
        const lastSlash = key.lastIndexOf('/');
        const filename = key.slice(lastSlash + 1);

        if (!filename) continue;
        if (filename.startsWith('.')) continue;

        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) continue;
        const ext = filename.slice(lastDot).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        keys.push(key);
      }
    }

    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Generate a presigned PUT URL for uploading a file directly to S3 from the browser.
 * @param {string} key - full S3 key (path + filename)
 * @param {string} contentType - MIME type of the file
 * @param {number} expiresIn - seconds until URL expires (default 300)
 * @returns {Promise<string>} presigned URL
 */
export async function getPresignedPutUrl(key, contentType, expiresIn = 300) {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn });
}
