import { scanAll, queryByDate, queryByYear } from '../lib/db.js';

const PAGE_SIZE = 10;
const VIDEO_PAGE_SIZE = 20;

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * GET /bot/posts
 * Handles three modes:
 *   - random=true: 10 random posts (all types)
 *   - tag=video: 20 random video posts
 *   - tag={other}: paginated posts filtered by tag
 *   - default: paginated posts by date descending
 *
 * post.items is stored in DynamoDB and requires no S3 population at read time.
 */
export async function handler(queryParams) {
  const offset = parseInt(queryParams.offset || '0', 10);
  const tag    = queryParams.tag  || null;
  const random = queryParams.random === 'true';
  const year   = queryParams.year || null;

  // Mode 0: year={YYYY} — all posts for that calendar year, newest first
  if (year) {
    const items = await queryByYear(year);
    return {
      year:   parseInt(year, 10),
      total:  items.length,
      offset: 0,
      tag:    null,
      posts:  items,
    };
  }

  // Mode 1: random=true
  if (random) {
    const allItems = await scanAll();
    shuffle(allItems);
    return {
      total: allItems.length,
      offset: 0,
      tag: null,
      posts: allItems.slice(0, PAGE_SIZE),
    };
  }

  // Mode 2: tag=video
  if (tag === 'video') {
    const allItems = await scanAll();
    const videoItems = allItems.filter(
      (item) => item.video && typeof item.video === 'string' && item.video.trim() !== ''
    );
    shuffle(videoItems);
    return {
      total: videoItems.length,
      offset: 0,
      tag: 'video',
      posts: videoItems.slice(0, VIDEO_PAGE_SIZE),
    };
  }

  // Mode 3: tag={something else}
  if (tag) {
    const allItems = await queryByDate(false);
    const tagLower = tag.toLowerCase();
    const filtered = allItems.filter((item) => {
      return (
        (item.tag1 && item.tag1.toLowerCase() === tagLower) ||
        (item.tag2 && item.tag2.toLowerCase() === tagLower) ||
        (item.tag3 && item.tag3.toLowerCase() === tagLower)
      );
    });
    return {
      total: filtered.length,
      offset,
      tag,
      posts: filtered.slice(offset, offset + PAGE_SIZE),
    };
  }

  // Mode 4: default — all posts by date descending, paginated
  const allItems = await queryByDate(false);
  return {
    total: allItems.length,
    offset,
    tag: null,
    posts: allItems.slice(offset, offset + PAGE_SIZE),
  };
}
