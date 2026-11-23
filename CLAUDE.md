# DI-ana: notes for working on this repository

DI-ana (Diagnostic testing and Intervention automatic analysis) is the phone app that reads Odin's paper sheets (pre-checks, practice 1 and 2, post-checks) and sends the answers
to Odin. Odin is in github.com/PurpleNinjaRadish/project-cerabus (the Project Cerberus server and page).

## DI-ana and Odin change together
- `odin/` is a copy of Odin's files (`page-src/src/engine.js`, `sheets*.js`, `pdf.js`, `sheets_pdf.js`, `scan.js`,
  `page-src/demo/school.json`, `public/fonts`). Never edit it here: change Odin, then run
  `python3 tools/sync_odin.py <odin checkout>`, rebuild (`python3 web/build.py`), test, and commit both repositories.
- Any Odin change to sheet making, sheet layout, the PDF pages, the scanner, `/api/scanner`, `/api/sheet/result` or
  sign-in also needs DI-ana updated in the same piece of work.
- `odin/SOURCE.json` records the Odin version and commit the copy came from.

## Standing rules (from the project owner)
- Student data is never uploaded online. Real data only on the offline Project Cerberus server, after written school or
  district approval. Never commit real data. Demos use invented students only.
- Nothing about students is kept on phones or devices: pictures are read in memory and never saved; the list clears when
  DI-ana closes; the session cookie lives in memory only; FLAG_SECURE while connected to a school's Odin.
- Content matching never uses names or codes.
- Tiers 1/2/3 (green/yellow/red) are separate from grade level. Say "skill tiers", "lowest tier",
  "primary need (focus of interventions)", "secondary need (secondary focus)". Never say "ladder" or "rung" in visible text.
- Research cited must be from the last 5 years; no dyslexia studies.
- Commits: author "Claude <noreply@anthropic.com>"; never put the owner's email anywhere.

## The web copy
- GitHub Pages here (`.github/workflows/pages.yml`, once Pages is turned on), and a copy in the Odin-2 repository's
  `diana/` folder (purpleninjaradish.github.io/Odin-2/diana/): copy `dist/` there with each DI-ana release.

## Checks
- `python3 web/tests/test_diana.py` (add `ODIN_URL=...` with a running Odin 0.9.5+ on a fresh demo database, password test-pass).
- CI: `.github/workflows/pages.yml` (page tests, then GitHub Pages) and `android.yml` (app build, emulator check, android-build branch).
