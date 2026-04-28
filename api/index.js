import { verifyToken } from './lib/auth.js';
import { handler as tagsHandler } from './routes/tags.js';
import { handler as postsHandler } from './routes/posts.js';
import { handler as postHandler } from './routes/post.js';
import { handler as postUpdateHandler } from './routes/post-update.js';
import { handler as postCreateHandler } from './routes/post-create.js';
import { handler as presignHandler } from './routes/presign.js';
import { handler as searchHandler } from './routes/search.js';
import { handler as todayHandler } from './routes/todayinhistory.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const rawPath = event.rawPath || event.path || '/';
  const queryParams = event.queryStringParameters || {};

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
      },
      body: '',
    };
  }

  // Verify JWT on all non-OPTIONS requests
  try {
    await verifyToken(event.headers?.authorization || event.headers?.Authorization);
  } catch (err) {
    console.warn('Auth failure:', err.message);
    return response(401, { error: 'Unauthorized' });
  }

  // Route matching
  try {
    // GET /bot/tags
    if (rawPath === '/bot/tags') {
      const tags = await tagsHandler();
      return response(200, tags);
    }

    // GET /bot/todayinhistory
    if (rawPath === '/bot/todayinhistory') {
      const result = await todayHandler(queryParams);
      return response(200, result);
    }

    // GET or PUT /bot/posts/{id}  (must come before /bot/posts)
    const postMatch = rawPath.match(/^\/bot\/posts\/(.+)$/);
    if (postMatch) {
      const id = decodeURIComponent(postMatch[1]);
      if (method === 'PUT') {
        const result = await postUpdateHandler(id, event.body);
        return response(200, result);
      }
      const result = await postHandler(id);
      return response(200, result);
    }

    // POST /bot/posts (create) or GET /bot/posts (list)
    if (rawPath === '/bot/posts') {
      if (method === 'POST') {
        const result = await postCreateHandler(event.body);
        return response(201, result);
      }
      const result = await postsHandler(queryParams);
      return response(200, result);
    }

    // POST /bot/presign
    if (rawPath === '/bot/presign' && method === 'POST') {
      const result = await presignHandler(event.body);
      return response(200, result);
    }

    // GET /bot/search/{term}
    const searchMatch = rawPath.match(/^\/bot\/search\/(.+)$/);
    if (searchMatch) {
      const term = decodeURIComponent(searchMatch[1]);
      const result = await searchHandler(term, queryParams);
      return response(200, result);
    }

    // Unknown path
    return response(404, { error: 'Not found' });
  } catch (err) {
    console.error('Handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};
