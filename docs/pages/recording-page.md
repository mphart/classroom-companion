This page is the active recording page. It is the main feature of our app and should have the cleanest possible user experience. It is very important for this page to be performant, appealing to look at, and easy to use.

It has three main parts: a section for typing in notes, a section for setting the settings of the recording, and a section that displays the live text generation and has buttons to start/stop the audio recording.

Notes Section
This section should essentially be a very basic text editor. It should have a header for the section that says something like ‘Enter Notes’. Below this, users can input their notes there during the live text generation. A tiny bullet point should show up next to each line. When the user hits enter, a new bullet point should be created for that line, while the text should wrap to the next line without generating a bullet point.
If the user types enough notes to reach the bottom of the page, the notes should scroll down as the user types.

Settings Section
At the top of this section, there should be a subsection that contains the project name/logo. This should be a button that links back to the homepage of the app.
Below this, there should be a list of settings to configure the lecture recording.
This list should include the following:
-An editable text field so that users can enter in the name of the lecture. It should default to Lecture-<dd-mm>. For example, if today’s date is January 1st, the default name for the recording should be Lecture-01-01.
-A dropdown where the user can select which course to save to. At the bottom of this dropdown, the user can choose to create a new course. Clicking this will open up a popup which prompts the user to create a new course, a picture of this popup will be linked in docs/fragment. In short, the popup will have a field to input the new name for the course.
-A field that allows the user to select which language to display. This field can only be changed before the user clicks the start recording button for the first time and starts generating text. The default should be English.
-A button at the very bottom that also takes the user to the home page.
Recording Section
The site should have a recording section that displays the text live based on the audio recording. First, the user should configure the settings. Disable the Start button until a Course is selected, or prompt on Stop if no course was chosen. Next, upon the user clicking Start the site should request to record audio. Next, the live audio recording should be sent to the backend via websocket. The backend should use an api to translate the speech into the selected language. The backend then sends this back to the frontend. New text appends to the bottom, and the view auto-scrolls down to follow it. At the bottom, there should be a start and stop recording button, and there should be a timer that indicates how long the recording has occurred for. Upon pressing stop, the recording should be saved and the user should be brought over to the homepage. 

More Notes:
Page Overview
This is the Active Recording Page — the core feature of the app. It is a single-page view divided into three vertical panels rendered side by side on desktop:
Panel | Name | Position
Left | Notes Section | ~30% width
Center | Recording Section | ~30% width
Right | Settings Section | ~40% width

The page should use a clean, minimal design. No unnecessary chrome. Performance is critical — audio streaming and live text rendering must not cause UI jank.
