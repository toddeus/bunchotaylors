# Backlog

## Next

### Ability to add a post

- Add a link to add a post on the menu.html page, above the "sign out" link and below the generated tags.
- When the link is clicked, display a picklist option for "Post Type" with options "Photo" or "Video".
- After the "Post Type" is selected, display a form similar to "edit.html" with specific rules identified below for photos versus videos.
- Default the "Date" to today for both post types; ensure the date is in the correct format ie 2026-01-31" when submitting to API.

#### Photo Post Rules

- For a photo post, set "Directory" to "photo/[year]/[MM]_[post_title]". For example for 2026-03-01 and Post Title "Florida Vacation" to "photo/2026/03_Florida_Vacation".
- Display an upload to allow multiple photos to be added, including iPhone and Windows devices.

#### Video Post Rules

- Default "Tag 1" to "video".
- Set "Directory" to "video/[year]". For example a video post with date 2026-07-16 would go to "video/2026". Note that directory is solely used for the thumbnail on video.
- Set the "Thumbnail" to "yyyy_MM_dd_[post_title]" ie "2026_01_31_Beer_Spa_Drive.png".
- Set "Video" to "video/[year]/yyyy_MM_dd_[post_title]" upon upload. For example a video post with date 2026-07-16 would go to "video/2026/2026_01_31_Beer_Spa_Drive.mp4". 
- Both the video and thumbnail file names should match. This is primarily for S3 organization.
- Allow upload of one thumbnail and one video.

#### API

- Modify the API to add posts.
- The API should perform an insert into the dynamo db database in the proper, existing format.
- S3 should be populated with the uploaded photos or video/thumbnail based on the "Directory" input. This should go the existing bucket "bunch-o-taylors".

#### Photo Resizing

- Photos should be resized when populating S3. Use the resizing rules located at `C:\dev\eclipse_workspaces\sts5\bunchotaylors-admin`.

## Later

### Edit Post for Videos

- Display the thumbnail in a similar approach as photos are displayed. This should allow removal/replacement for ONE thumbnail. For example, if the Directory is "video/2025" and the "Thumbnail is "2025_07_16_Beer_Spa_Drive.png", this should display "bunch-taylors/video/2025/2025_07_16_Beer_Spa_Drive.png" and allow a new one to be added.
- Display the video based on the and "Video" values ("video/2025/2025_07_16_Beer_Spa_Drive.mp4"). 
- Allow a new video to be added.

### Add Post Location

- Detect the photo/video location by reading the content's metadata and set the "Location" property when adding.
- Use the closet location for multiple photos. Or use the first location found if unable to calculate closest.
- There is existing logic for this in the local admin upload tool located at `C:\dev\eclipse_workspaces\sts5\bunchotaylors-admin`
- I'd also like to add this to the Edit post for existing. Perhaps a button can be added to detect location? I would like to brainstorm how to do this with you.

### Individual post viewer for video

- Need a video player icon. This is hidden because the title is hidden for individual posts. Display a centered play icon ONLY for individual posts.

### Location Viewer

### Add post

### Tag cloud


### Optimize video storage
`{
  "id": {
    "S": "2958"
  },
  "dir": {
    "S": "video/2026"
  },
  "items": {
    "L": []
  },
  "monthday": {
    "S": "04-28"
  },
  "postdate": {
    "S": "2026-04-28"
  },
  "tag1": {
    "S": "video"
  },
  "tag2": {
    "NULL": true
  },
  "tag3": {
    "NULL": true
  },
  "thumb": {
    "S": "2026_04_28_Sunset_Boat_Cruise.jpeg"
  },
  "title": {
    "S": "Sunset Boat Cruise"
  },
  "video": {
    "S": "video/2026/2026_04_28_Sunset_Boat_Cruise.mov"
  },
  "_type": {
    "S": "POST"
  }
}`

