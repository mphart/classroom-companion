# Home Page Overview

The home page is the main page where users can create folders for classes and start new recordings. It serves as the page where all recordings can be found.

## Features

### 🔐 Profile
- A profile button is located in the top right.
- It contains a dropdown with a logout button.

### ➕ New Button
- Located in the top left.
- Dropdown options:
  - Start a new recording session
  - Add a new folder

### 📁 Folder Creation
- Creates a new folder with a blank name that is immediately editable.
- If the user clicks away without entering a name, the folder defaults to `"untitled"`.
- After the user confirms the name (pressing Enter or clicking away):
  - A `POST` request is sent to the backend with:
    - Folder name
    - Creation date
- All folders and notes display their **latest edited date** below their title.

### 🎙️ Recording
- Clicking "New Recording" navigates to the active recording page.
- A new recording session starts immediately.

### 🔍 Search
- A search bar filters items in the **current directory**.
- Filtering is **case-insensitive**.

### 🔃 Filter / Sort
- A filter button provides sorting options:
  - Name
  - Last edited date
  - Creation date

### 📂 Directory Structure
- Each file and folder has a `directory` field in the database.
- The root directory is: userId/
- Example structure: userId/physics/chapter3/
- The app tracks the **current directory** and displays all items within it.

### 📄 Navigation
- Clicking a **note** opens its viewing page.
- Clicking a **folder** navigates into that folder.

### ✅ Selection Mode
- Activated by clicking a selection checkbox in the top left.
- Allows selecting multiple notes and folders.

#### Actions Available:
- Generate summary
- Delete items
- Rename (only when one item is selected)

#### Behavior:
- Clicking outside items deselects all.
- Clicking a selected item will deselect it.

### 🧠 Summary Generation
- When multiple items are selected:
- A summary is generated using all original text from:
  - Selected notes
  - Notes inside selected folders
- The summary is saved as a new item in the **current directory**.
- The summary automatically opens in the viewing page.


## 🌐 Homepage APIs (MVP)

These APIs support the core functionality of the home page: displaying items, creating folders, managing notes, and performing bulk actions.

---

### 📂 Get Items in Current Directory
```http
GET /items?directory=userId/physics/

[
  {
    "id": 1,
    "type": "folder",
    "name": "Physics",
    "directory": "userId/",
    "createdDate": "...",
    "lastEditedDate": "..."
  },
  {
    "id": 2,
    "type": "note",
    "title": "Chapter 3 Lecture",
    "directory": "userId/physics/",
    "createdDate": "...",
    "lastEditedDate": "..."
  }
]


POST /folders

{
  "name": "Physics",
  "directory": "userId/",
  "createdDate": "2026-05-02T12:00:00Z"
}

POST /notes

{
  "title": "Lecture Recording",
  "directory": "userId/physics/",
  "originalText": "...",
  "createdDate": "...",
  "lastEditedDate": "..."
}

PUT /items/{itemId}/rename

{
  "newName": "Chapter 3"
}

DELETE /items

{
  "itemIds": [1, 2, 3]
}

POST /ai/summarize

{
  "noteIds": [1, 2],
  "folderIds": [3],
  "outputDirectory": "userId/physics/"
}
