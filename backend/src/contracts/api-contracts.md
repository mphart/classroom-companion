# ClassroomCompanion MVP API Contracts

All protected routes require `Authorization: Bearer <jwt>`.

## Auth

- `POST /auth/signup`
  - Request: `{ "name": "Robin Lin", "username": "robin", "password": "password123" }`
  - Response `201`: `{ "token": "...", "user": { "id": 1, "name": "Robin Lin", "username": "robin" } }`
- `POST /auth/login`
  - Request: `{ "username": "robin", "password": "password123" }`
  - Response `200`: same as signup.
- `POST /auth/logout`
  - Response `204`
- `GET /auth/me`
  - Response `200`: `{ "user": { "id": 1, "name": "Robin Lin", "username": "robin" } }`

## Items + Folders

- `GET /items?directory=userId/physics/&q=chapter&sortBy=lastEditedDate&sortDir=desc`
  - Response `200`:
    - `{ "items": [{ "id": 9, "type": "note", "name": "Lecture 3", "directory": "userId/physics/", "createdDate": "...", "lastEditedDate": "...", "noteSourceType": "recording" }] }`
      - `noteSourceType` is only included for `note` items (`recording` vs `generated_summary`)
- `POST /folders`
  - Request: `{ "name": "Physics", "directory": "userId/" }`
  - Response `201`: `{ "item": { "id": 3, "type": "folder", "name": "Physics", "directory": "userId/", "createdDate": "...", "lastEditedDate": "..." } }`
- `PATCH /items/:itemId/rename`
  - Request: `{ "newName": "Chapter 3" }`
  - Response `200`: `{ "item": { ... } }`
- `DELETE /items`
  - Request: `{ "itemIds": [3, 12, 19] }`
  - Response `200`: `{ "deletedCount": 3 }`

## Notes (Recording Output)

- `POST /notes`
  - Request:
    - `{ "title": "Lecture-02-05", "directory": "userId/physics/", "rawText": "Today we covered...", "language": "English", "durationSeconds": 3120 }`
  - Response `201`: `{ "note": { "id": 22, "title": "Lecture-02-05", "directory": "userId/physics/", "rawText": "...", "aiSummary": null, "language": "English", "durationSeconds": 3120, "sourceType": "recording", "generatedFromCount": null, "createdDate": "...", "lastEditedDate": "..." } }`
- `GET /notes/:noteId`
  - Response `200`: `{ "note": { ...same shape... } }`
- `GET /notes?directory=userId/physics/`
  - Response `200`: `{ "notes": [{ ...noteShape }] }`

## AI Summaries

- `POST /ai/summarize/note/:noteId`
  - Response `200`: `{ "note": { ...with aiSummary populated... } }`
- `POST /ai/summarize/selection`
  - Request: `{ "noteIds": [1, 2], "folderIds": [3], "outputDirectory": "userId/physics/", "title": "Midterm Review Summary" }`
  - Response `201`: `{ "note": { ...sourceType: "generated_summary"... }, "sourceCount": 5 }`

## Error Envelope

- Validation: `400 { "error": "Validation failed.", "issues": [...] }`
- Unauthorized: `401 { "error": "Missing bearer token." }` or `401 { "error": "Invalid or expired token." }`
- Not Found: `404 { "error": "Route not found." }` or resource-specific not-found messages.
