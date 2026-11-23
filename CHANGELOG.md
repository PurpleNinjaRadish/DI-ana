# DI-ana changes

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
