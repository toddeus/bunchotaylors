# Bunch-o-Taylors API

Base URL: `https://s0grh0hsx0.execute-api.us-east-1.amazonaws.com`
Custom domain (production): `https://bunch-o-taylors.com/api`

All requests require a Cognito access token:
```
Authorization: Bearer <access_token>
```

---

## Endpoints

### GET /bot/posts

Returns a paginated list of posts. Behavior varies by query parameters.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `random` | `true` | Return 10 random posts (all types). Ignores offset. |
| `tag` | string | Filter by tag. Use `video` for video posts (returns 20, random order). Other values filter by tag1/tag2/tag3. |
| `offset` | number | Pagination offset (default `0`). |

**Modes**

| Request | Behavior |
|---|---|
| `?random=true` | 10 random posts, all types |
| `?tag=video` | 20 random video posts |
| `?tag=birthday` | Posts tagged `birthday`, paginated, date descending |
| _(no params)_ | All posts, paginated, date descending |

**Response**
```json
{
  "total": 847,
  "offset": 0,
  "tag": null,
  "posts": [ ...post objects... ]
}
```

---

### GET /bot/posts/{id}

Returns a single post by its primary key.

**Path parameters**

| Parameter | Description |
|---|---|
| `id` | Post ID (string) |

**Response**
```json
{
  "total": 1,
  "offset": 0,
  "tag": null,
  "posts": [ ...post object... ]
}
```

Returns `total: 0` and an empty `posts` array if not found.

---

### GET /bot/search/{term}

Case-insensitive partial match on post title.

**Path parameters**

| Parameter | Description |
|---|---|
| `term` | Search string (URL-encoded) |

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `offset` | number | Pagination offset (default `0`) |

**Response**
```json
{
  "total": 12,
  "offset": 0,
  "tag": null,
  "posts": [ ...post objects... ]
}
```

---

### GET /bot/todayinhistory

Returns posts from this same month and day across all years, sorted ascending by date. Defaults to today in the `America/New_York` timezone.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `month` | number | Month (1–12). Must be used with `day`. |
| `day` | number | Day (1–31). Must be used with `month`. |
| `offset` | number | Pagination offset (default `0`) |

**Response**
```json
{
  "total": 5,
  "offset": 0,
  "tag": null,
  "posts": [ ...post objects... ]
}
```

---

### GET /bot/tags

Returns a sorted, deduplicated list of all tag values across all posts.

**Response**
```json
["birthday", "holiday", "vacation", ...]
```

---

## Example responses

### GET /bot/posts

```json
{
  "total": 847,
  "offset": 0,
  "tag": null,
  "posts": [
    {
      "id": "a1b2c3d4",
      "title": "Christmas Morning 2023",
      "postdate": "2023-12-25",
      "monthday": "12-25",
      "dir": "photo/2023-12-25-christmas",
      "thumb": "thumb.jpg",
      "tag1": "holiday",
      "tag2": "",
      "tag3": "",
      "items": ["img1.jpg", "img2.jpg", "img3.jpg"]
    },
    {
      "id": "e5f6g7h8",
      "title": "Summer Vacation",
      "postdate": "2023-07-04",
      "monthday": "07-04",
      "dir": "photo/2023-07-04-vacation",
      "thumb": "thumb.jpg",
      "tag1": "vacation",
      "tag2": "",
      "tag3": "",
      "items": ["img1.jpg"]
    }
  ]
}
```

### GET /bot/posts/{id}

```json
{
  "total": 1,
  "offset": 0,
  "tag": null,
  "posts": [
    {
      "id": "a1b2c3d4",
      "title": "Christmas Morning 2023",
      "postdate": "2023-12-25",
      "monthday": "12-25",
      "dir": "photo/2023-12-25-christmas",
      "thumb": "thumb.jpg",
      "tag1": "holiday",
      "tag2": "",
      "tag3": "",
      "items": ["img1.jpg", "img2.jpg", "img3.jpg"]
    }
  ]
}
```

### GET /bot/posts/{id} — not found

```json
{
  "total": 0,
  "offset": 0,
  "tag": null,
  "posts": []
}
```

### GET /bot/posts?tag=video

```json
{
  "total": 34,
  "offset": 0,
  "tag": "video",
  "posts": [
    {
      "id": "z9y8x7w6",
      "title": "Taylor Family Reunion 2022",
      "postdate": "2022-08-14",
      "monthday": "08-14",
      "dir": "photo/2022-08-14-reunion",
      "thumb": "thumb.jpg",
      "video": "reunion.mp4",
      "tag1": "family",
      "tag2": "",
      "tag3": ""
    }
  ]
}
```

### GET /bot/search/christmas

```json
{
  "total": 3,
  "offset": 0,
  "tag": null,
  "posts": [
    {
      "id": "a1b2c3d4",
      "title": "Christmas Morning 2023",
      "postdate": "2023-12-25",
      "monthday": "12-25",
      "dir": "photo/2023-12-25-christmas",
      "thumb": "thumb.jpg",
      "tag1": "holiday",
      "tag2": "",
      "tag3": ""
    }
  ]
}
```

### GET /bot/todayinhistory?month=12&day=25

```json
{
  "total": 4,
  "offset": 0,
  "tag": null,
  "posts": [
    {
      "id": "p1q2r3s4",
      "title": "Christmas 2019",
      "postdate": "2019-12-25",
      "monthday": "12-25",
      "dir": "photo/2019-12-25-christmas",
      "thumb": "thumb.jpg",
      "tag1": "holiday",
      "tag2": "",
      "tag3": "",
      "items": ["img1.jpg", "img2.jpg"]
    }
  ]
}
```

### GET /bot/tags

```json
["birthday", "family", "holiday", "vacation"]
```

## Post object

| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `title` | string | Post title |
| `postdate` | string | ISO date (`YYYY-MM-DD`) |
| `dir` | string | S3 directory path for this post's assets |
| `thumb` | string | Thumbnail filename within `dir` |
| `video` | string | Video filename within `dir` (absent or empty for photo posts) |
| `tag1` | string | Tag (optional) |
| `tag2` | string | Tag (optional) |
| `tag3` | string | Tag (optional) |
| `monthday` | string | `MM-DD` derived from `postdate`, used for Today in History |
| `items` | string[] | Photo filenames within `dir` (populated for photo posts, absent for video) |

---

## Page size

| Endpoint | Page size |
|---|---|
| `/bot/posts` (default, tag filter, random) | 10 |
| `/bot/posts?tag=video` | 20 |
| `/bot/search/{term}` | 10 |
| `/bot/todayinhistory` | 10 |
