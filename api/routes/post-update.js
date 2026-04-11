import { updatePost } from '../lib/db.js';

/**
 * PUT /bot/posts/{id}
 * Updates all provided metadata fields on a post. monthday is derived from postdate.
 */
export async function handler(id, body) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;

  const fields = {};

  // Simple text fields — empty string treated as null (will REMOVE the attribute)
  for (const f of ['title', 'dir', 'thumb', 'video', 'tag1', 'tag2', 'tag3']) {
    if (f in data) {
      fields[f] = data[f] || null;
    }
  }

  // postdate — derive monthday (MM-DD) from YYYY-MM-DD
  if ('postdate' in data) {
    fields.postdate = data.postdate || null;
    fields.monthday = data.postdate ? data.postdate.substring(5, 10) : null;
  }

  // items — always an array
  if ('items' in data) {
    fields.items = Array.isArray(data.items) ? data.items : [];
  }

  // location — null clears it; object with lat/lon sets it
  if ('location' in data) {
    if (data.location && (data.location.lat !== null || data.location.lon !== null)) {
      fields.location = {
        lat: data.location.lat !== '' && data.location.lat !== null ? Number(data.location.lat) : null,
        lon: data.location.lon !== '' && data.location.lon !== null ? Number(data.location.lon) : null,
      };
    } else {
      fields.location = null;
    }
  }

  const updated = await updatePost(id, fields);
  return { total: 1, offset: 0, tag: null, posts: [updated] };
}
