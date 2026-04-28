import { getPresignedPutUrl } from '../lib/s3.js';

/**
 * POST /bot/presign
 * Accepts an array of { key, contentType } objects and returns presigned S3 PUT URLs.
 * URLs expire in 5 minutes.
 */
export async function handler(body) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  const files = data.files;

  if (!Array.isArray(files) || files.length === 0) {
    const err = new Error('files array is required');
    err.statusCode = 400;
    throw err;
  }

  const urls = await Promise.all(
    files.map(async ({ key, contentType }) => ({
      key,
      url: await getPresignedPutUrl(key, contentType),
    }))
  );

  return { urls };
}
