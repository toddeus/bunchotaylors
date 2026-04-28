import { nextPostId, createPost } from '../lib/db.js';

/**
 * POST /bot/posts
 * Creates a new post. Derives the next sequential id and monthday from postdate.
 */
export async function handler(body) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;

  const { title, postdate, dir, tag1, tag2, tag3, thumb, video, items, location } = data;

  if (!title || !postdate || !dir) {
    const err = new Error('Missing required fields: title, postdate, dir');
    err.statusCode = 400;
    throw err;
  }

  const id = await nextPostId();
  const monthday = postdate.substring(5, 10); // MM-DD

  const post = {
    id,
    _type: 'POST',
    title,
    postdate,
    monthday,
    dir,
    tag1: tag1 || null,
    tag2: tag2 || null,
    tag3: tag3 || null,
    thumb: thumb || null,
    video: video || null,
    items: Array.isArray(items) ? items : [],
  };

  if (location && (location.lat !== null || location.lon !== null)) {
    post.location = {
      lat: location.lat !== null && location.lat !== '' ? Number(location.lat) : null,
      lon: location.lon !== null && location.lon !== '' ? Number(location.lon) : null,
    };
  }

  await createPost(post);
  return { total: 1, offset: 0, tag: null, posts: [post] };
}
