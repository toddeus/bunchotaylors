import { scanAll } from '../lib/db.js';

/**
 * GET /bot/tags
 * Returns a sorted, deduplicated array of all tag values across all posts.
 */
export async function handler() {
  const items = await scanAll();

  const tagSet = new Set();

  for (const item of items) {
    for (const field of ['tag1', 'tag2', 'tag3']) {
      const val = item[field];
      if (val && typeof val === 'string' && val.trim() !== '' && val.toUpperCase() !== 'NULL') {
        tagSet.add(val.trim());
      }
    }
  }

  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  return tags;
}
