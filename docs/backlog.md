# Backlog

## Next

## Later

### Edit Post for Videos

- Display the thumbnail in a similar approach as photos are displayed. This should allow removal/replacement for ONE thumbnail. For example, if the Directory is "video/2025" and the "Thumbnail is "2025_07_16_Beer_Spa_Drive.png", this should display "bunch-taylors/video/2025/2025_07_16_Beer_Spa_Drive.png" image and allow a new one to be added (replacing the existing thumbnail).
- Allow a new video to be added (ie replace the existing video).

### Edit Post for Photos

- Allow new photos to be added.

### Add Post Location

- Detect the photo/video location by reading the content's metadata and set the "Location" property when adding.
- Use the closet location for multiple photos. Or use the first location found if unable to calculate closest.
- There is existing logic for this in the local admin upload tool located at `C:\dev\eclipse_workspaces\sts5\bunchotaylors-admin`
- I'd also like to add this to the Edit post for existing. Perhaps a button can be added to detect location? I would like to brainstorm how to do this with you.

### Location Viewer

### Tag cloud

### Optimize video storage

Not sure if I want to do this - everything is working
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

