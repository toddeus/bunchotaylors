import { queryByDate } from '../lib/db.js';

const PAGE_SIZE = 10;

/**
 * GET /bot/search/{term}?offset
 * Case-insensitive partial match on post title.
 * Does NOT populate items (search is a list view only).
 */
export async function handler(term, queryParams) {
  const offset = parseInt(queryParams.offset || '0', 10);
  const termLower = term.toLowerCase();

  const allItems = await queryByDate(false);

  const filtered = allItems.filter((item) => {
    return item.title && item.title.toLowerCase().includes(termLower);
  });

  const page = filtered.slice(offset, offset + PAGE_SIZE);

  return {
    total: filtered.length,
    offset,
    tag: null,
    posts: page,
  };
}
