import { queryByMonthDay } from '../lib/db.js';

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
 * GET /bot/todayinhistory?month&day&offset
 * Returns posts from this month+day across all years, ascending by date.
 * Defaults to today in America/New_York if month/day not provided.
 * post.items is stored in DynamoDB and requires no S3 population at read time.
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

  const allItems = await queryByMonthDay(monthday);

  return {
    total: allItems.length,
    offset,
    tag: null,
    posts: allItems.slice(offset, offset + PAGE_SIZE),
  };
}
