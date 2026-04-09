import { getById } from '../lib/db.js';

/**
 * GET /bot/posts/{id}
 * Returns a PostResponse with a single post, or null posts array if not found.
 * post.items is stored in DynamoDB and requires no S3 population at read time.
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

  return {
    total: 1,
    offset: 0,
    tag: null,
    posts: [item],
  };
}
