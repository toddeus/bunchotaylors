import { scanAll, queryByDate } from '../lib/db.js';
import { listPhotoItems } from '../lib/s3.js';

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
 * Populate post.items from S3 for photo posts (non-video).
 * Video posts use thumb instead.
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
 * GET /bot/posts
 * Handles three modes:
 *   - random=true: 10 random posts (all types), with items populated for photo posts
 *   - tag=video: 20 random video posts (no item population)
 *   - tag={other}: paginated posts filtered by tag, items populated for photo posts
 *   - default: paginated posts by date descending, items populated for photo posts
 */
export async function handler(queryParams) {
  const offset = parseInt(queryParams.offset || '0', 10);
  const tag = queryParams.tag || null;
  const random = queryParams.random === 'true';

  // Mode 1: random=true
  if (random) {
    const allItems = await scanAll();
    shuffle(allItems);
    const page = allItems.slice(0, PAGE_SIZE);
    const populated = await Promise.all(page.map(populateItems));
    return {
      total: allItems.length,
      offset: 0,
      tag: null,
      posts: populated,
    };
  }

  // Mode 2: tag=video
  if (tag === 'video') {
    const allItems = await scanAll();
    const videoItems = allItems.filter(
      (item) => item.video && typeof item.video === 'string' && item.video.trim() !== ''
    );
    shuffle(videoItems);
    const page = videoItems.slice(0, VIDEO_PAGE_SIZE);
    // No item population for video posts — they use thumb
    return {
      total: videoItems.length,
      offset: 0,
      tag: 'video',
      posts: page,
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
    const page = filtered.slice(offset, offset + PAGE_SIZE);
    const populated = await Promise.all(page.map(populateItems));
    return {
      total: filtered.length,
      offset,
      tag,
      posts: populated,
    };
  }

  // Mode 4: default — all posts by date descending, paginated
  const allItems = await queryByDate(false);
  const page = allItems.slice(offset, offset + PAGE_SIZE);
  const populated = await Promise.all(page.map(populateItems));
  return {
    total: allItems.length,
    offset,
    tag: null,
    posts: populated,
  };
}
