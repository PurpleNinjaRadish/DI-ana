# DI-ana changes

## 0.2.0-alpha · November 2026

Needs Odin 0.10.0 or newer for making tests and worksheets at school (scanning Odin's own sheets still works with 0.9.5).

- **Make tests and worksheets**, a second part next to **Scan sheets**:
  - **A worksheet's PDF.** DI-ana reads the PDF on the device (pdf.js, `web/vendor/pdfjs`, loaded only then; the file is
    never sent or kept), counts its numbered questions and each one's lettered choices (`web/src/worksheet.js`), and shows
    small pictures of its pages to check against. If the worksheet prints its own answer key, DI-ana can use it. Students
    answer on Odin's answer sheet: up to 60 questions, 2 to 5 choices (A to E), in one to three columns.
  - **Any worksheet:** type how many questions it has and how many choices each has.
  - **A test or practice sheet written with AI:** grade, subject, skill (Odin's skill tiers for the grade), topic, 4 to 8
    questions, 3 or 4 choices, and a short passage if wanted. The teacher reads and changes every question, its choices,
    its right answer and its hint before anything is made; DI-ana checks it fits on one page with Odin's own layout.
  - Then the class and the students; DI-ana makes the set in Odin (or in the demo) and prints or saves the PDF: an
    **answer key sheet** and a sheet for each student, with Odin's corner squares and sheet code.
- **The answer key sheet.** When the key is known (AI, or the worksheet's own), it prints with the right answers filled
  in. When it isn't, fill in its bubbles with a pencil and scan it with the students' sheets, in any order, or **Tap in
  the key**. Every sheet is scored with it; sheets scanned earlier are scored again. A key sheet that disagrees with
  Odin's key asks before replacing it.
- **The AI:** at school, Odin's server calls it and keeps the key (DI-ana shows which AI, and never asks for the key). In
  the demo, DI-ana calls it: on a school computer (Ollama, LM Studio), a free tier (Gemini, Groq, OpenRouter) or paid
  (Claude, OpenAI, or a service like OpenAI's); a key typed there is kept only while DI-ana is open. In the Android app's
  demo the app makes the call (`ai` in `DianaBridge`, HTTPS only, only the headers an AI needs). **The AI is told only
  the grade, subject, skill and topic**; DI-ana (and Odin again) refuses a topic with a student's name or code in it.
- Scanning reads the new sheets: tests, practice sheets, worksheet answer sheets (a fifth choice, E) and answer key
  sheets; a set's sheet shows "–" until its key is known; answer key sheets are sent first.
- The walkthrough has a step for making tests and worksheets (8 steps); the README has pictures of it.
- Shares Odin 0.10.0's engine, now with `ai.js` (`tools/sync_odin.py`).
- Tests: a worksheet's PDF (made by Chromium) counted; its answer key sheet and students' sheets printed, filled in,
  photographed and read exactly, and scored from the key sheet; a practice sheet from a stand-in AI
  (`web/tests/fake_ai.py`), changed by the teacher; a student's name kept out of the AI; a key tapped in. With Odin: a
  test written through Odin's AI, made in Odin, and its photographed sheets scored there, with nothing about a student
  sent to the AI. The emulator check loads pdf.js inside the app.

## 0.1.1-alpha · November 2026

- **A walkthrough.** Seven short steps, each with a picture: what DI-ana does, printing the sheets in Odin, filling in the
  bubbles, scanning the stack, checking flagged answers, sending to Odin, and using it at school. It opens by itself the
  first time DI-ana opens (the Android app remembers that it was seen; a browser keeps only that in its own storage) and
  from the **Walkthrough** button. Back, Next, the arrow keys and Escape work; each step's heading gets the focus.
- **The description** says what the name means, Diagnostic testing and Intervention automatic analysis, in the app's
  header and setup screen, the page's title, the web copy's install name and the README.
- README: the walkthrough with pictures from the demo (`tools/walkthrough_pictures.py`).
- Tests: the walkthrough opens once, steps through, and stays closed after Done, in the page tests and the emulator check.

## 0.1.0-alpha · November 2026

The first DI-ana: an Android app and a web copy that read Odin's paper sheets. Needs Odin 0.9.5 or newer.

- **Live camera:** finds Odin's four corner squares a few times a second; when the sheet holds still, reads it at full
  size, beeps and buzzes, and waits for the next sheet. Each sheet is read once.
- **Photos and scans:** photos on the phone, or a scanner's PDF, JPEG and PNG files.
- **Checking answers:** light marks, two marks and erased answers shown as pictures with A–D buttons; a sheet that already
  has a result in Odin is replaced only when the teacher says so.
- **Sending:** only the answers, to the school's Odin, when the teacher presses Send. Odin scores them from its own keys and
  puts pre- and post-check scores on the week's check.
- **Versions:** each sheet is drawn again with this copy of Odin; a sheet whose answer key differs from the server's is
  not read ("made by another version of Odin").
- **The demo:** Odin's invented school with this week's sheets; sample sheets as a PDF to print; pretend pictures.
- **Privacy:** pictures never saved or sent; nothing about students kept on the phone; the app's page is built in and
  reaches only the Odin address given, over HTTPS; screenshots blocked while connected to a school's Odin.
- Shares Odin 0.9.5's engine (`odin/`), including its new camera-friendly corner finder.
- Tests: the demo, photos on a desk at angles and in uneven light, the live camera (a pretend camera playing a video of
  six sheets), and a round trip through a real Odin server. An emulator check of the Android app on every change.
