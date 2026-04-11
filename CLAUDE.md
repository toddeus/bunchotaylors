# Bunch-O-Taylors: System Specification (v1.0)

## Overview

Bunch-O-Taylors is a private family photo and video gallery website. All content is protected by authentication — users must sign in before viewing any content.

The site supports browsing by random posts, "this day in history" (the default/PWA landing), most recent, by tag, by search, and single post. The primary gallery viewer shows all images from the posts returned by a query as a flat masonry grid (e.g. "this day in history" may return 10 posts averaging 5 images each — all 50 display on screen).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Static S3 website at S3 bucket `bunch-o-taylors.com` |
| API | AWS Lambda (Node.js 24, ESM) via SAM |
| API Gateway | AWS HTTP API (API Gateway v2) |
| Database | DynamoDB (`bot-posts` table) |
| Media | S3 bucket `bunch-o-taylors` |
| Auth | AWS Cognito (User Pool) + `aws-jwt-verify` |
| Frontend | HTML, Bootstrap 5.3.3, jQuery 3.7.1, Masonry, FancyBox 5 |
| IaC | AWS SAM (`infra/template.yaml`) |

---

## Source Layout

```
api/          Lambda source (Node.js ESM)
  index.js    Entry point: auth gate + router
  lib/
    auth.js   JWT verification via aws-jwt-verify
    db.js     DynamoDB access (scanAll, getById, queryByDate, queryByMonthDay)
    s3.js     S3 listing utilities (used by migration scripts only)
  routes/
    tags.js
    posts.js
    post.js
    search.js
    todayinhistory.js
frontend/     Static website (S3-hosted)
  index.html  Gallery page
  menu.html   Navigation hub
  signin.html Sign-in form
  js/
    config.js   Runtime config (Cognito, S3, API URLs) — not committed with real values
    auth.js     Cognito auth + apiFetch wrapper
    bot.js      Gallery rendering logic
  style.css
  manifest.json
infra/        SAM template + build artifacts
  template.yaml
```

---

## Domain Models

### Post

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Partition key |
| `_type` | string | Always `"POST"` — used as GSI partition key on DateIndex |
| `postdate` | string (YYYY-MM-DD) | Date of the post; sort key on DateIndex |
| `monthday` | string (MM-DD) | Derived from postdate; partition key on MonthDayIndex |
| `title` | string | Display title |
| `dir` | string | S3 directory prefix for this post's media |
| `thumb` | string | Thumbnail filename (used for video posts) |
| `video` | string (nullable) | Video filename; null/empty means photo post |
| `tag1` | string (nullable) | Primary tag |
| `tag2` | string (nullable) | Secondary tag |
| `tag3` | string (nullable) | Tertiary tag |
| `items` | list of strings | Photo filenames — stored in DynamoDB (populated at migration time, not read time) |
| `location` | Map `{ lat, lon }` (nullable) | GPS coordinates of the post; both values are numbers |

**Business rules:**
- A post is a **video post** if `video` is non-null and non-empty; otherwise it is a **photo post**.
- Photo posts render all filenames in `items`. Video posts render `dir/thumb` as thumbnail and `video` as the playable file.
- A post can carry up to three tags (tag1, tag2, tag3), stored denormalized.
- `monthday` must be kept in sync with `postdate` (MM-DD format).

### PostResponse (API envelope)

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total matching records (for pagination) |
| `offset` | integer | Current page offset |
| `tag` | string\|null | Tag filter applied, if any |
| `posts` | Post[] | Result records |

---

## DynamoDB Schema

**Table:** `bot-posts`  
**Partition key:** `id` (string)

**Global Secondary Indexes:**

| GSI | Partition Key | Sort Key | Used by |
|-----|--------------|----------|---------|
| `DateIndex` | `_type` (string) | `postdate` (string) | posts (date-ordered), search |
| `MonthDayIndex` | `monthday` (string) | `postdate` (string) | todayinhistory |

All queries are sorted ascending or descending via `ScanIndexForward`. Full table scans (`scanAll`) are used for random, tag=video, and tags endpoints since DynamoDB has no native random or multi-field filter.

---

## API Specification

**Base URL:** `https://api.bunch-o-taylors.com/`

**Authentication:** All endpoints require a valid Cognito access token:
```
Authorization: Bearer <access_token>
```
The Lambda verifies every request server-side via `aws-jwt-verify` before routing. Missing or invalid tokens return HTTP 401.

**Runtime config (Lambda env vars):**
- `DYNAMODB_TABLE` = `bot-posts`
- `S3_BUCKET` = `bunch-o-taylors`
- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`

---

### GET `/bot/tags`
Returns a sorted, deduplicated array of all tag values.

**Response:** `string[]`

**Rules:**
- Reads all posts via full table scan.
- Excludes null, empty, and the literal string `"NULL"` from tag1/tag2/tag3.
- Returns sorted alphabetically.

---

### GET `/bot/posts`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Pagination offset |
| `tag` | string | (none) | Filter by tag |
| `random` | boolean | false | Return 10 random posts |

**Modes (evaluated in order):**
1. `random=true` — full scan, Fisher-Yates shuffle, return first 10
2. `tag=video` — full scan filtered to video posts, shuffle, return first 20
3. `tag={other}` — `DateIndex` query filtered by tag match (case-insensitive), paginated (10)
4. default — `DateIndex` query descending by date, paginated (10)

---

### GET `/bot/posts/{id}`
Returns a single post by id. Returns an empty `posts` array if not found.

---

### GET `/bot/search/{searchterm}`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Pagination offset |

Case-insensitive partial match on `title` across all posts ordered by date descending. Page size 10.

---

### GET `/bot/todayinhistory`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `month` | integer | current month (ET) | Month 1–12 |
| `day` | integer | current day (ET) | Day 1–31 |
| `offset` | integer | 0 | Pagination offset |

Queries `MonthDayIndex` for all posts matching the given month+day across all years, sorted ascending (oldest first). Defaults to today in `America/New_York`. Page size 10.

---

## Media Storage

**Bucket:** `bunch-o-taylors`  
**Base URL:** `https://bunch-o-taylors.s3.amazonaws.com/`

| URL pattern | Usage |
|-------------|-------|
| `{s3url}{dir}/{item}` | Photo |
| `{s3url}{dir}/{thumb}` | Video thumbnail |
| `{s3url}{video}` | Video file (note: `video` field includes full path) |

Photo `items` lists are stored in DynamoDB and do not require S3 listing at read time.

---

## Authentication & Authorization

**Mechanism:** AWS Cognito User Pool (region `us-east-1`).  
**Token type:** Access token (JWT), verified server-side via `aws-jwt-verify`.

**Frontend auth flow (`js/auth.js`):**
1. On page load, `restoreSession()` checks for a valid Cognito session.
2. If no session, redirect to `signin.html?ref=<current url>`.
3. `getToken()` returns the access token from the current Cognito session.
4. `apiFetch(path)` wraps `fetch`: attaches `Authorization: Bearer <token>`, handles 401 by redirecting to sign-in.
5. Sign-out clears the Cognito session and redirects to `signin.html`.

Tokens are managed by the `amazon-cognito-identity-js` SDK and stored in browser session storage (SDK default). No manual localStorage writes.

**Configuration** (in `js/config.js`):
```javascript
window._config = {
    cognito: {
        userPoolId: '...',
        userPoolClientId: '...',
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
This file is not committed with real values.

---

## Frontend

### Pages

#### `index.html` — Gallery
Main gallery view. URL parameters control what is loaded:

| Parameter | Behavior |
|-----------|----------|
| (none) | Random posts |
| `nav=posts` | Most recent posts, paginated |
| `nav=memories` | This day in history |
| `tag={name}` | Filter by tag (combined with `nav=posts`) |
| `offset={n}` | Pagination offset |
| `post={id}` | Single post view |
| `search={term}` | Search by title |
| `month={n}&day={n}` | Memories for a specific date |

**Layout:** Masonry grid via `masonry-layout` + `imagesloaded`.
- Mobile: 1 column (`row-cols-1`)
- Tablet: 2 columns (`row-cols-md-2`)
- Desktop: 4 columns (`row-cols-xxl-4`)
- Single post view: centered, max-width 600px

**Cards:** Bootstrap borderless cards. Each card has a gradient overlay at the bottom showing post title (bold, white, 12.5px) and date (muted white, 10.5px). Video cards include a play button icon.

**Lightbox:** FancyBox 5. All media on the page shares a single `gallery` group. Caption: `{title} {formatted date}`. Videos play inline.

**Pagination:** Previous/Next arrows in footer. Next hidden when `offset + 10 >= total`. Step size 10.

**Memories fallback:** If `todayinhistory` returns no posts, shows "No memories today; go make some!" and falls back to random posts.

**Loading overlay:** Full-screen spinner with random message from `js/loading-messages.json` (messages feature the family dogs Scotty and Milo).

#### `menu.html` — Navigation
Static links to memories, random, most recent. Search bar submits to `index.html?search={term}`. Dynamic tag links fetched from `/bot/tags` and appended below static links. Sign-out link appended after tags.

#### `signin.html` — Sign In
Email + password form. On success, redirects to `index.html` or `?ref` return URL. Displays Cognito error messages on failure.

### JavaScript Architecture

- **`js/config.js`** — global `window._config` (env-specific, not committed)
- **`js/auth.js`** — `window.Auth` object: `signIn`, `restoreSession`, `signOut`, `getToken`, `apiFetch`
- **`js/bot.js`** — gallery functions: `getPosts`, `getPost`, `searchPosts`, `getTags`, `addPhoto`, `addVideo`, `formatGrid`, `displayLoadingMessage`

HTML is rendered via template literal string injection with `$.append()` (jQuery). Cards are built in `addPhoto()` and `addVideo()`.

### CSS (`style.css`)

- Link color: `#3f67c0`
- Gallery overlay: gradient from `rgba(50,50,93,0.78)` at bottom to transparent
- Footer: 75px fixed height, three-column color bar (info-subtle / primary / info)
- Spinner: fixed full-screen overlay, flex-centered, z-index 50
- Video play button: `playbutton.png`, 25×25px, 70% opacity, bottom-right of card

### PWA (`manifest.json`)

- Short name: `BoT`
- Full name: `Bunch-o-Taylors`
- Start URL: `/index.html?nav=memories`
- Display: `standalone`
- Orientation: `portrait`
- Theme color: `#1e88e5`

---

## Infrastructure (`infra/template.yaml`)

Deployed via AWS SAM.

- **`BotHttpApi`** — AWS HTTP API (API Gateway v2), CORS handled in Lambda
- **`BotFunction`** — Lambda function `bunch-o-taylors-api`
  - Runtime: `nodejs24.x`
  - Memory: 256 MB, Timeout: 30s
  - Built via esbuild (ESM output, `.mjs` extension)
  - IAM policies: `DynamoDBReadPolicy` on `bot-posts`, `S3ReadPolicy` on `bunch-o-taylors`
  - Catches all routes via `/{proxy+}`

`Cognito​UserPoolId` and `CognitoClientId` are SAM parameters (not hardcoded).

---

## Business Rules Summary

1. All content is protected — no endpoint or page is accessible without a valid Cognito JWT.
2. JWT validation is enforced server-side on every Lambda request.
3. Page size is **10** for all paginated endpoints; `tag=video` returns **20**.
4. `random=true` ignores all filters and returns 10 randomly selected posts.
5. `tag=video` returns 20 randomly ordered video posts (not paginated).
6. Memories default to today in `America/New_York` when month/day are omitted.
7. Memories with no results falls back to random posts in the UI.
8. Photo `items` lists are stored in DynamoDB — no S3 listing occurs at read time.
9. Dates display as human-readable strings ("May 14, 2021") in the UI; stored as YYYY-MM-DD.
