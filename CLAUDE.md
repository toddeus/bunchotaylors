# Bunch-O-Taylors: System Specification

## Overview

Bunch-O-Taylors is a private family photo and video gallery website. It is a static website backed by a serverless API. All content is protected by authentication — users must sign in before viewing any content.

The site focuses on a photo gallery for browsing, searching, viewing photo albums and videos organized by date and tags. The default landing page is a "this day in history" showing all posts for the current day. There is also a random feature to display photos/videos from 10 random posts.

---


## Tech Stack

- Cost effective AWS solution
- Hosting: Static S3 website 
- AWS Lambda to perform API calls to send/receive dynamodb data, retrieve S3 media entities. node.js is preferred.
- Database: dynamodb
- User Interface: HTML and bootstrap (solutions that are supported on static s3 websites)
- Media Hosting: No changes to the S3 hosting of media files
- User Authentication: AWS JWT

---

## Source Files

- The website front end is located @frontend
- Claude's generated website front end is located @frontend_claude. This is being used as a reference but not used in production.
- The lambda API is located @api
- Temp files at @temp

## Domain Models

### Post

A Post represents a single album or media event. It is the central entity of the system.

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique identifier |
| `postdate` | string (YYYY-MM-DD) | Date of the post |
| `title` | string | Display title shown in the gallery |
| `dir` | string | S3 directory prefix for this post's media files |
| `thumb` | string | Filename of the thumbnail image (used for videos) |
| `video` | string (nullable) | Filename of the video file; null/empty if this is a photo post |
| `tag1` | string (nullable) | Primary tag |
| `tag2` | string (nullable) | Secondary tag |
| `tag3` | string (nullable) | Tertiary tag |
| `items` | list of strings | Resolved list of media filenames (populated at read time from S3) |

**Business Rules:**
- A Post is a **video post** if its `video` field is non-null and non-empty. Otherwise it is a **photo post**.
- Photo posts have an `items` list populated by listing objects in S3 under the post's `dir` prefix.
- Video posts use `dir` + `thumb` for the thumbnail and `video` for the playable file.
- A post can have up to three tags (tag1, tag2, tag3). Tags are stored denormalized.
- `postdate` is stored as `YYYY-MM-DD` and must also be presentable as a human-readable string (e.g., "May 14, 2021").

#### Recommendations

Before creation, recommend improved data model.

### PostResponse (API envelope)

All post-returning endpoints wrap results in this envelope:

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total number of records matching the query (for pagination) |
| `offset` | integer | The offset of the current result set |
| `tag` | string | The tag filter applied, if any |
| `posts` | list of Post | The result records |

---

## API Specification

### Base URL
`https://api.bunch-o-taylors.com/`

### Authentication
All endpoints require a valid JWT token issued by AWS Cognito, passed as:
```
Authorization: <jwt_token>
```
The API must validate this token on every request. Requests without a valid token must be rejected with HTTP 401.

> **Implementation Note:** The current system validates the token only on the client side — the backend API is unauthenticated. The new system must enforce token validation server-side on all routes.

---

### Gallery Endpoints

#### GET `/bot/tags`
Returns all unique tags across all posts.

**Response:** JSON array of strings
```json
["video", "birthday", "family", "event"]
```

**Rules:**
- Tags are sourced from the tag1, tag2, and tag3 fields across all posts.
- Null, empty, and the literal string `"NULL"` must be excluded.
- No duplicates.
- No guaranteed sort order required, but consistent ordering is preferred.

---

#### GET `/bot/posts`
Returns a paginated list of posts, sorted by date descending (most recent first).

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Pagination offset |
| `tag` | string | (none) | Filter posts by tag (matches tag1, tag2, or tag3) |
| `random` | boolean | false | If true, return 10 random posts regardless of other params |

**Rules:**
- Page size is always **10**.
- When `random=true`, ignore all other parameters and return 10 randomly selected posts.
- When `tag` is provided, filter to posts where tag1, tag2, or tag3 matches the tag (case-insensitive).
- Special case: when `tag=video`, return **20** randomly ordered video posts (posts where the video field is non-null).
- `total` in the response must reflect the full count of matching records, not just the current page.

---

#### GET `/bot/posts/{id}`
Returns a single post by its ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Post ID |

**Response:** PostResponse with a single-item `posts` array.

---

#### GET `/bot/search/{searchterm}`
Returns posts whose title contains the search term (case-insensitive partial match).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `searchterm` | string | Search string |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Pagination offset |

**Rules:**
- Match is partial and case-insensitive (equivalent to SQL `LIKE '%term%'`).
- Page size is 10.
- `total` reflects the full count of matching records.

---

#### GET `/bot/todayinhistory`
Returns posts from the same calendar day (month + day) across all years.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `month` | integer | current month | Month (1–12) |
| `day` | integer | current day | Day (1–31) |
| `offset` | integer | 0 | Pagination offset |

**Rules:**
- If `month` and `day` are omitted, use the current date in the **America/New_York** timezone.
- Matches posts where the date's month and day equal the given values, across all years.
- Results sorted by date ascending (chronological order, oldest first).
- Page size is 10.

---

## Media Storage

All media files (photos and videos) are hosted in the S3 bucket `bunch-o-taylors`.

**Photo URL pattern:**
```
https://bunch-o-taylors.s3.amazonaws.com/{filename}
```

**Video URL pattern:**
```
https://bunch-o-taylors.s3.amazonaws.com/{dir}/{video_filename}
```

**Thumbnail URL pattern (videos):**
```
https://bunch-o-taylors.s3.amazonaws.com/{dir}/{thumb_filename}
```

The API populates a photo post's `items` list at read time by listing all objects in S3 under the post's `dir` prefix. The implementor must replicate this behavior — either at read time via S3 listing, or by storing the items list in the database at write time. No changes to S3 media hosting are required.

---

## Authentication & Authorization

### Mechanism
Use **AWS Cognito** with a User Pool for authentication.

**Recommended Cognito setup:**
- User Pool with email as username
- App client (no client secret, for browser-based access)
- Identity Pool for federated access if S3 direct access is needed
- JWT ID tokens used for API authorization
- Token auto-refresh on expiration (Cognito handles this via the refresh token)

**Configuration values to carry forward:**
- Region: `us-east-1`
- Existing User Pool, App Client, and Identity Pool IDs are already configured in the frontend — preserve these unless rebuilding auth from scratch.

### Flow
1. User visits the site and is redirected to `/signin.html` if not authenticated.
2. User submits email and password; Cognito authenticates and issues a JWT.
3. JWT is stored in memory (not localStorage) and attached as `Authorization` header to every API request.
4. If a token is expired, it is silently refreshed using the Cognito refresh token before the API call is retried.
5. If authentication fails entirely, the user is redirected to `/signin.html` with a `?ref=` parameter indicating where to return after login.

### Authorization Rules
- All gallery API endpoints require a valid Cognito JWT.
- Gallery content (posts, tags, media) is shared and accessible to all authenticated users.

---

## Frontend: Page Structure & Features

The frontend is a **static website** hosted on S3. It must be buildable with no server-side rendering — all dynamic content is fetched from the API at runtime.

> **Key Improvement:** The current frontend builds HTML via string concatenation and `innerHTML`. The new implementation should use a proper templating approach — either HTML `<template>` elements, a lightweight client-side templating library, or a component framework compatible with static S3 hosting. This will improve security (avoids XSS risks from string injection), maintainability, and readability.

### Pages

#### `/index.html` — Gallery
The main page. Displays a responsive grid of photo and video cards.

**URL Parameters:**

| Parameter | Values | Behavior |
|-----------|--------|----------|
| `nav` | `posts` | Load most recent posts |
| `nav` | `memories` | Load "this day in history" posts |
| (none) | — | Load random posts (default) |
| `tag` | tag name | Filter by tag |
| `offset` | integer | Pagination offset |
| `post` | post id | Show single post (expanded, single-column layout) |
| `search` | search term | Search posts by title |
| `month` | 1–12 | Month override for memories mode |
| `day` | 1–31 | Day override for memories mode |

**Layout:**
- Responsive Masonry grid
  - Mobile: 1 column
  - Tablet (md): 2 columns
  - Desktop (xxl): 4 columns
- Full-screen spinner overlay blocks interaction while content loads
- Random loading message displayed during load (sourced from a static JSON file)

**Post Cards:**
- Bootstrap card, no border
- Image fills card width
- Overlay at card bottom shows post title (bold, white, 14px) and formatted date (italic, white, 11px) on a semi-transparent dark background
- Clicking opens a lightbox gallery (see Lightbox section)
- Video cards show a play button icon overlay on the thumbnail

**Pagination:**
- Previous / Next buttons in the footer
- "Next" is hidden when `offset + 10 >= total`
- Step size is always 10
- If a "memories" query returns no results, display a friendly message ("No memories today; go make some!") and fall back to loading random posts

#### `/menu.html` — Navigation Menu
Central hub for browsing modes.

**Static navigation links:**
- "memories (this day in history)" → `index.html?nav=memories`
- "random posts" → `index.html`
- "most recent" → `index.html?nav=posts`

**Search bar:**
- Text input, no autocomplete
- On submit: redirect to `index.html?search={term}`

**Dynamic tag links:**
- Fetched from `/bot/tags` on page load
- Each tag rendered as a link: `index.html?nav=posts&tag={tag}`
- Appended below the static navigation links

#### `/signin.html` — Sign In
Email and password login form.

- On success: redirect to `/index.html` or `?ref` parameter if present
- On failure: display Cognito error message to user

---

## Lightbox / Media Viewer

All photos and videos are viewable in a full-screen lightbox overlay.

**Behavior:**
- Clicking any media card opens the lightbox
- All media on the page is grouped into a single navigable gallery
- Keyboard arrows and swipe gestures navigate between items
- Caption shows: `{post title} {formatted date}`
- Videos play inline within the lightbox
- Lightbox sits at highest z-index (above all other content)

**Recommended library:** FancyBox (currently in use) or any equivalent lightbox library that supports image galleries and inline video playback.

---

## Progressive Web App (PWA)

Gallery is an installable as PWAs.

**Gallery manifest:**
- Short name: `BoT`
- Full name: `Bunch-o-Taylors`
- Start URL: `/index.html?nav=memories`
- Display: standalone
- Orientation: portrait
- Theme color: `#1e88e5`

---

## Existing Visual Design & UX Conventions

- **Primary font:** Arial / Helvetica / Verdana (sans-serif)
- **Link color:** `#3f67c0` (no underline)
- **Card style:** Borderless Bootstrap cards; no drop shadows; clean and minimal
- **Overlay style:** `rgba(0,0,0,0.5)` dark semi-transparent overlay at card bottom for title/date
- **Loading:** Full-screen spinner overlay with a random whimsical loading message (messages should reference the family's dogs by name: Scotty and Milo)
- **Footer:** Three-column layout (prev | spacer | next); fixed height 75px; color bar matching brand palette
- **Navigation header:** Sticky top bar with banner image linking to `menu.html`

**Design philosophy:** Media-first, minimal chrome. The content (photos and videos) should dominate. UI elements are subtle and stay out of the way.

---

## Configuration

The frontend loads a single `js/config.js` file that exposes a global `window._config` object with the following shape:

```javascript
window._config = {
    cognito: {
        userPoolId: '...',
        userPoolClientId: '...',
        identityPoolId: '...',
        region: 'us-east-1'
    },
    s3: {
        bucket: 'bunch-o-taylors',
        url: 'https://bunch-o-taylors.s3.amazonaws.com/'
    },
    api: {
        url: 'https://api.bunch-o-taylors.com/'
    }
};
```

This file is the only place environment-specific values should exist. It must not be committed with real values if the project is public.

---

## Behaviors & Business Rules Summary

1. **All content is protected.** No page or API endpoint is accessible without a valid Cognito JWT.
2. Gallery data is shared across all users.
3. **Page size is always 10** for all paginated endpoints except random video (20).
4. **Random mode ignores all filters.** `random=true` always returns 10 random posts.
5. **Tag=video is special.** It returns 20 random video posts, not paginated tag results.
6. **Memories default to today** using America/New_York timezone when no month/day provided.
7. **Memories with no results** should fall back to random posts in the UI.
8. **Photo items list is resolved at read time** from S3 object listing under the post's `dir`.
9. **Dates always display in human-readable format** ("May 14, 2021") in the UI; stored as YYYY-MM-DD.
10. **Input must be sanitized server-side.** The current system has SQL injection vulnerabilities. The new system must use parameterized queries or equivalent safe data access patterns.

---

## What to Carry Forward

- **Browsing modes:** random, recent, by-tag, by-date, search, single-post — all are actively used
- **"This day in history"** is a featured and beloved browsing mode; surface it prominently
- **Tag system** (up to 3 per post) is flexible and works well; preserve it
- **Masonry grid layout** provides a clean, Pinterest-style gallery that works well for photos of varying dimensions
- **Responsive design** display 4 columns of photos on large monitors, scale to 1 column for phone
- **FancyBox lightbox** provides a polished full-screen media experience; preserve this pattern
- **Loading messages** featuring Scotty and Milo — this is a charming personality touch
- **Cognito authentication** is already configured and working; preserve the existing User Pool
- **PWA installability** users likely have these installed

## What to Improve

- **HTML rendering:** Replace all string concatenation and `innerHTML` with a proper templating approach (`<template>` elements, Handlebars, or equivalent)
- **API security:** Enforce JWT validation server-side on every endpoint; the current API is completely open
- **Input sanitization:** All user-supplied query parameters must be validated and passed safely to the database layer (parameterized queries, not string interpolation)
- **Config management:** Move all Cognito and API URLs out of hardcoded JavaScript and into the `config.js` pattern; never hardcode credentials
- **jQuery dependency:** jQuery 3.2.1 is outdated; consider replacing with vanilla JS or a modern lightweight library, since Bootstrap 5 no longer requires jQuery
