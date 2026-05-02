The home page is the main page where users can create folders for classes and start new recordings. It serves as the page where all recordings can be found. 

 The home page has these features:

A profile button on the top right. For now, all it needs to do is have a dropdown with a logout button.
The top left has a new button with a dropdown to start a new recording session or add a new folder. 
Adding a new folder creates a new folder with a blank name, which is already selected for editing. If the user clicks off, the folder will just be named "untitled". After users confirm the name (either by clicking enter or clicking off), the front end should send a POST request with the folder name and creation date to the backend for the database. All folders and notes have their latest edited date below their title. 
Clicking the new recording page takes the user to the active recording page and starts a new recording.
The home page has a search bar that filters by non-case-sensitive text in the current directory.
The filter button has a dropdown to sort by name and last edited, and creation date.
Each file and folder should have a directory field in the database. The home page starts with the root directory for the user, which is userId/. A note for chapter 3 of physics might be in userId/physics/chapter3/ for example.
Keep track of the current directory and present all folders and notes in that directory
clicking a note will take you to the view page for that note
clicking a folder will take you into that directory
Clicking a selection checkbox on the top left will begin a selection mode where users can select as many notes and folders as they want. A dialog option will appear on screen in the top right to generate a summary of these notes, or to delete them. If only one item is selected, users can also rename the item. Clicking anywhere besides an item will deselect all, clicking one item will deselect it. 
Clicking generate when multiple items are selected generates a summary of all notes selected and notes in folders selected and places it in the current directory. This works by using all of the original text fields associated with these notes. The summary item opens the viewing page. 

