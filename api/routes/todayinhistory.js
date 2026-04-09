import { queryByMonthDay } from '../lib/db.js';
import { listPhotoItems } from '../lib/s3.js';

const PAGE_SIZE = 10;

/**
 * Get the current date in America/New_York timezone as MM-DD.
 * @returns {string} e.g. "04-02"
 */
function getTodayMonthDay() {
  const now = new Date();
  const nyDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // nyDate is in format MM/DD
  const [month, day] = nyDate.split('/');
  return `${month}-${day}`;
}

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
 * GET /bot/todayinhistory?month&day&offset
 * Returns posts from this month+day across all years, ascending by date.
 * Defaults to today in America/New_York if month/day not provided.
 */
export async function handler(queryParams) {
  const offset = parseInt(queryParams.offset || '0', 10);

  let monthday;
  if (queryParams.month && queryParams.day) {
    const month = queryParams.month.padStart(2, '0');
    const day = queryParams.day.padStart(2, '0');
    monthday = `${month}-${day}`;
  } else {
    monthday = getTodayMonthDay();
  }

  // queryByMonthDay returns results ascending by postdate
  const allItems = await queryByMonthDay(monthday);

  const page = allItems.slice(offset, offset + PAGE_SIZE);
  const populated = await Promise.all(page.map(populateItems));

  return {
    total: allItems.length,
    offset,
    tag: null,
    posts: populated,
  };
}
