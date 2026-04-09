import { getById } from '../lib/db.js';
import { listPhotoItems } from '../lib/s3.js';

/**
 * Populate post.items from S3 for photo posts (non-video).
 * @param {object} post
 * @returns {Promise<object>}
 */
async function populateItems(post) {
  if (!post.video) {
    post.items = await listPhotoItems(post.dir);
  }
  return post;
}

/**
 * GET /bot/posts/{id}
 * Returns a PostResponse with a single post, or null posts array if not found.
 */
export async function handler(id) {
  const item = await getById(id);

  if (!item) {
    return {
      total: 0,
      offset: 0,
      tag: null,
      posts: [],
    };
  }

  const populated = await populateItems(item);

  return {
    total: 1,
    offset: 0,
    tag: null,
    posts: [populated],
  };
}
