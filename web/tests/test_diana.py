"""DI-ana's page checks. Build first (python3 web/build.py), then:  python3 web/tests/test_diana.py
Needs Playwright with Chromium, Pillow, numpy, and poppler (pdftoppm) and qpdf.

1. The demo: pretend pictures, checking a flagged answer, saving; the sample sheets as a PDF.
2. Photos: the sample PDF printed (pdftoppm), filled in with a pencil-like gray, photographed on a desk at an angle with
   uneven light (photo.py), then chosen as files: every answer read exactly.
3. The live camera: the same photos played as a video through Chromium's pretend camera; DI-ana reads each sheet as it
   comes into view, once, and every answer exactly.
4. A sheet made by another version of Odin isn't read (its answer key doesn't match).
5. With ODIN_URL (a running Odin 0.10 server on a fresh demo database, ODIN_PASSWORD=test-pass), the school's server
   through a stand-in for the Android app: sign in, load the sheets, read photos of two of the server's own sheets, send
   them, and find the scores in Odin, on the sheets and on the week's check. Then a test written with AI through Odin
   (a stand-in AI, fake_ai.py), made in Odin, its sheets and answer key read from photos and scored by Odin.
6. Tests and worksheets in the demo: a worksheet's PDF (its questions and choices counted), its answer key sheet bubbled in
   and photographed with the students' sheets, every sheet scored; a practice sheet written with AI (a stand-in) and
   changed by the teacher; a student's name kept out of the AI's topic; a key tapped in.
"""
import base64, glob, http.server, json, os, random, re, subprocess, sys, tempfile, threading, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import photo, desk, y4m
import fake_ai

ROOT = Path(__file__).resolve().parents[2]
OUT = os.environ.get("DIANA_TEST_OUT") or tempfile.mkdtemp(prefix="diana-test-")
os.makedirs(OUT, exist_ok=True)
ODIN = os.environ.get("ODIN_URL", "").rstrip("/")
random.seed(3)
fails, errs = [], []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)


# the page over http://localhost (a secure place for the camera, like https)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), lambda *a, **k: Quiet(*a, directory=str(ROOT / "dist"), **k))
threading.Thread(target=srv.serve_forever, daemon=True).start()
PAGE = f"http://127.0.0.1:{srv.server_address[1]}/index.html"


def new_page(b, toured=True, **kw):
    c = b.new_context(viewport={"width": 412, "height": 900}, accept_downloads=True, **kw)
    p = c.new_page()
    if toured:   # the walkthrough was seen before: it stays closed (the first test checks it opening)
        p.add_init_script("try { localStorage.setItem('diana.walkthroughSeen', '1'); } catch (e) {}")
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") and "127.0.0.1" not in r.request.url else r.continue_())
    return c, p


def fill_pages(pdf, specs, prefix, dpi=150, answers=None):
    """The PDF's pages as paper, with one bubble filled per question (or the answers given for a sheet). Returns the pictures and the answers."""
    for f in glob.glob(f"{OUT}/{prefix}-*.pgm"): os.remove(f)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", pdf, f"{OUT}/{prefix}"], check=True)
    ppm, pages = dpi / 25.4, []
    for k, f in enumerate(sorted(glob.glob(f"{OUT}/{prefix}-*.pgm"))):
        im = Image.open(f).convert("L"); d = ImageDraw.Draw(im); ans = ""
        given = (answers or {}).get(specs[k]["id"])
        for i, it in enumerate(specs[k]["items"]):
            c = "ABCDE".index(given[i]) if given else random.randrange(len(it)); x, y, r = it[c]; ans += "ABCDE"[c]; rr = r * random.uniform(0.78, 0.92) * ppm
            d.ellipse([x * ppm - rr, y * ppm - rr, x * ppm + rr, y * ppm + rr], fill=random.randint(45, 105))
        pages.append((im, specs[k]["id"], ans))
    return pages


SPEC_JS = "ids => ids.map(id => { const s = window.__diana.sheet(id).spec; return { id, items: s.layout.items.map(it => it.choices.map(c => [c.bx, c.by, c.r])) }; })"
SHOTS = [dict(), dict(tilt=0.12, rot=4), dict(upside=True, rot=-3, shade=0.5), dict(fill=0.62), dict(landscape=True, fill=0.8), dict(blur=1.3, tilt=0.15, bg=(200, 196, 190))]

with sync_playwright() as pw:
    b = pw.chromium.launch()
    c, p = new_page(b, toured=False)
    p.goto(PAGE); p.wait_for_selector("#app h1")
    # the walkthrough: opens by itself the first time, steps forward and back, and stays closed after Done
    w = p.evaluate("window.__diana.walkthrough()")
    check(w["open"] and w["step"] == 1 and w["steps"] == 8 and "DI-ana does" in w["heading"] and "Diagnostic testing and Intervention automatic analysis" in p.inner_text("#tour"),
          f"the walkthrough opens the first time, with what DI-ana stands for: {w['heading']!r}, {w['steps']} steps")
    heads = [w["heading"]]
    for k in range(w["steps"] - 1):
        p.click("[data-a=tournext]"); heads.append(p.evaluate("window.__diana.walkthrough().heading"))
    p.keyboard.press("ArrowLeft"); back = p.evaluate("window.__diana.walkthrough().step")
    p.keyboard.press("ArrowRight")
    check(heads[1].startswith("1. Print") and heads[3].startswith("3. Scan") and heads[6].startswith("6. Make tests") and heads[-1] == "At school" and back == 7 and p.locator("[data-a=tourscan]").count() == 1,
          f"it steps through printing, filling in, scanning, checking, sending, making tests and worksheets, and school ({len(heads)} steps; Back and the arrow keys work)")
    check(p.evaluate("document.activeElement && document.activeElement.id") == "tour-h", "each step's heading gets the focus, for screen readers")
    p.click("[data-a=tourdone]")
    p.reload(); p.wait_for_selector("#app h1")
    check(not p.evaluate("window.__diana.walkthrough().open"), "after Done it doesn't open by itself again")
    p.click("[data-a=tour]")
    check(p.evaluate("window.__diana.walkthrough().open"), "the Walkthrough button opens it again")
    p.keyboard.press("Escape")
    check(not p.evaluate("window.__diana.walkthrough().open"), "Escape closes it")
    st = p.evaluate("window.__diana.state()")
    check(st["mode"] == "demo" and st["sheets"] > 500, f"the demo opens with Odin's invented school: {st['sheets']} sheets")
    check(p.locator("text=Every student in the demo is invented").count() == 1, "the demo says its students are invented")

    # 1. pretend pictures, a flagged answer, saving
    p.click("[data-a=pretend]"); p.wait_for_function("() => /^Read \\d+ pretend/.test((document.querySelector('.notice') || {}).textContent || '')")
    rd = p.evaluate("window.__diana.reads()")
    check(len(rd) == 5 and all(x["ok"] for x in rd) and sum(x["status"] == "check" for x in rd) == 1, f"5 pretend pictures read, 1 to check: {[x['status'] for x in rd]}")
    check(p.locator("[data-a=send]").is_enabled() and "Save 4 sheets" in p.inner_text("[data-a=send]"), "Save waits for the answer to check: " + p.inner_text("[data-a=send]"))
    p.locator(".read.check [data-a=fix]").first.click()
    check("Save 5 sheets" in p.inner_text("[data-a=send]"), "after checking it, all 5 can be saved")
    p.click("[data-a=send]"); p.wait_for_timeout(200)
    check(all(x["status"] == "sent" for x in p.evaluate("window.__diana.reads()")) and "nothing leaves this page" in p.inner_text(".notice"), "saved in the demo, and it says nothing left the page")
    p.click("[data-a=clear]")
    check(not p.evaluate("window.__diana.reads()"), "the list clears")

    # the sample sheets as a PDF: one class's math pre-checks
    p.select_option("#d-cls", "3-112"); p.select_option("#d-subj", "math"); p.select_option("#d-which", "pre")
    ids = p.evaluate("window.__diana.ids('3-112', 'math', 'pre')")
    with p.expect_download() as dl: p.click("[data-a=samplepdf]")
    pdf = f"{OUT}/sample.pdf"; dl.value.save_as(pdf)
    q = subprocess.run(["qpdf", "--check", pdf], capture_output=True, text=True)
    pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    check(q.returncode == 0 and pages == len(ids), f"sample sheets saved as a PDF ({dl.value.suggested_filename}): {pages} pages for {len(ids)} pre-checks")

    # 2. photos of the printed, filled sheets
    n = min(len(SHOTS), len(ids))
    specs = p.evaluate(SPEC_JS, ids[:n])
    subprocess.run(["qpdf", pdf, "--pages", pdf, f"1-{n}", "--", f"{OUT}/sample-n.pdf"], check=True)
    papers = fill_pages(f"{OUT}/sample-n.pdf", specs, "paper")
    files, want, frames = [], {}, []
    for k, (im, sid, ans) in enumerate(papers):
        pic, _ = photo(im, seed=k, **SHOTS[k])
        f = f"{OUT}/photo-{k + 1}.jpg"; pic.save(f, quality=82); files.append(f); want[sid] = ans
        cam, _ = photo(im, out_w=720, out_h=1280, seed=10 + k, **{x: v for x, v in SHOTS[k].items() if x != "landscape"})
        frames += [desk(seed=k)] * 8 + [cam] * 14
    p.set_input_files("#files", files)
    p.wait_for_function("() => /^Read \\d+ sheet/.test((document.querySelector('.notice') || {}).textContent || '')", timeout=120000)
    got = {x["id"]: x for x in p.evaluate("window.__diana.reads()") if x["ok"]}
    exact = [sid for sid, ans in want.items() if sid in got and got[sid]["answers"] == ans and not got[sid]["open"]]
    for sid, ans in want.items():
        if sid not in exact: print("    sheet", sid, "want", ans, "got", got.get(sid))
    check(len(exact) == n, f"photos on a desk, at an angle, upside down, sideways, in uneven light: {len(exact)} of {n} read exactly")
    p.screenshot(path=f"{OUT}/photos.png", full_page=True)

    # 4. a sheet from another version of Odin (its answer key differs) isn't read
    other = ids[n] if len(ids) > n else ids[0]
    p.evaluate("id => { const s = window.__diana.sheet(id); s.rec.key = (s.rec.key[0] === 'A' ? 'B' : 'A') + s.rec.key.slice(1); window.__diana.recheck(id); }", other)
    p.click("[data-a=clear]"); p.click("[data-a=clear]")
    p.evaluate("""async id => { const e = window.__diana.sheet(id); const sp = shBuildSheet(Object.assign({}, e.rec)); sp.id = id;
      const img = scSynth(sp, 'A'.repeat(sp.total), { seed: 1 }); const cv = document.createElement('canvas'); cv.width = img.w; cv.height = img.h; const cx = cv.getContext('2d'); const d = cx.createImageData(img.w, img.h);
      for (let i = 0; i < img.g.length; i++) { d.data[4 * i] = d.data[4 * i + 1] = d.data[4 * i + 2] = img.g[i]; d.data[4 * i + 3] = 255; } cx.putImageData(d, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const f = new File([blob], 'other-version.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#files'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); }""", other)
    p.wait_for_function("() => window.__diana.reads().length === 1 && /^Read/.test(document.querySelector('.notice').textContent)", timeout=60000)
    r = p.evaluate("window.__diana.reads()")[0]
    check(not r["ok"] and r["reason"] == "version" and p.locator("text=made by another version of Odin").count() == 1, f"a sheet from another version of Odin isn't read: {r['reason']}")
    c.close()

    # 6. tests and worksheets in the demo
    AI = fake_ai.start(8098)
    c, p = new_page(b)
    p.goto(PAGE); p.wait_for_selector("#app h1")
    p.click("[data-a=view][data-v=make]"); p.wait_for_selector("#mk-file", state="attached")
    ws = ("<html><body style='font-family:Arial;font-size:13pt'><h2>Chapter 4 Review</h2><p>Name ________ Date ______</p><p>Directions: choose the best answer.</p>"
          + "".join(f"<p>{i}. What is {i} + {i}?</p>" + ("<p>" + "&nbsp;&nbsp;&nbsp;".join(f"{L}. {i * 2 + d}" for d, L in enumerate("ABCDE"[:5 if i % 4 == 0 else 4])) + "</p>" if i % 2
             else "".join(f"<p>&nbsp;&nbsp;{L}) {i * 2 + d}</p>" for d, L in enumerate("abcde"[:5 if i % 4 == 0 else 4]))) for i in range(1, 13))
          + "<h3>Answer Key</h3><p>1. A 2. B 3. C 4. E 5. A 6. B 7. C 8. D 9. A 10. B 11. C 12. E</p></body></html>")
    wp = b.new_page(); wp.set_content(ws); wp.pdf(path=f"{OUT}/worksheet.pdf", format="Letter"); wp.close()
    p.set_input_files("#mk-file", f"{OUT}/worksheet.pdf"); p.wait_for_selector("#mk-n", timeout=60000)
    mk = p.evaluate("window.__diana.make()")
    check(mk["n"] == 12 and mk["choices"] == [4, 4, 4, 5] * 3 and mk["key"] == "ABCEABCDABCE" and p.locator(".pics img").count() == 2,
          f"a worksheet's PDF: {mk['n']} questions, choices {mk['choices']}, its own answer key {mk['key']}, and pictures of its 2 pages")
    p.uncheck("#mk-usekey"); p.fill("#mk-title", "Chapter 4 review")
    p.click("[data-a=mknext]"); p.wait_for_selector(".who-list")
    p.select_option("#mk-cls", "3-112"); p.click("[data-a=mknone]")
    for k in range(3): p.locator(".mk-st").nth(k).check()
    p.click("[data-a=mkmake]"); p.wait_for_selector("text=Made:")
    st = p.evaluate("window.__diana.sets()")[0]
    check(st["kind"] == "worksheet" and st["total"] == 12 and st["key"] == "?" * 12 and len(st["sheets"]) == 3, f"made: an answer key sheet ({st['keySheet']}) and 3 student sheets, the key not known yet")
    with p.expect_download() as dl: p.click("[data-a=mkprint]")
    wpdf = f"{OUT}/worksheet-sheets.pdf"; dl.value.save_as(wpdf)
    pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", wpdf], capture_output=True, text=True).stdout).group(1))
    check(subprocess.run(["qpdf", "--check", wpdf], capture_output=True).returncode == 0 and pages == 4, f"the sheets as a PDF: {pages} pages (the key sheet first)")
    sids = [st["keySheet"]] + [x["id"] for x in st["sheets"]]
    key = "ABCEABCDABCE"
    papers = fill_pages(wpdf, p.evaluate(SPEC_JS, sids), "ws", answers={st["keySheet"]: key})
    files, wsw = [], {}
    for k, (im, sid, ans) in enumerate(papers):
        pic, _ = photo(im, seed=60 + k, **SHOTS[k % 3]); f = f"{OUT}/ws-{k + 1}.jpg"; pic.save(f, quality=82); files.append(f); wsw[sid] = ans
    p.click("[data-a=view][data-v=scan]")
    p.set_input_files("#files", files[1:] + files[:1])   # the students' sheets first: the key comes last
    p.wait_for_function("() => /^Read \\d+ sheet/.test((document.querySelector('.notice') || {}).textContent || '')", timeout=120000)
    rd = {x["id"]: x for x in p.evaluate("window.__diana.reads()") if x["ok"]}
    check(all(sid in rd and rd[sid]["answers"] == wsw[sid] and not rd[sid]["open"] for sid in sids), f"the answer key sheet and the students' answer sheets (5 choices on some questions) read exactly from photos")
    p.click("[data-a=send]"); p.wait_for_timeout(300)
    st = p.evaluate("window.__diana.sets()")[0]
    right = {x["id"]: sum(a == k for a, k in zip(wsw[x["id"]], key)) for x in st["sheets"]}
    check(st["key"] == key and all(x["status"] == "done" and x["right"] == right[x["id"]] for x in st["sheets"]), f"the key came from its sheet and every student sheet is scored with it: {right}")
    p.screenshot(path=f"{OUT}/worksheet-scanned.png", full_page=True)

    # a practice sheet written with AI (the stand-in), changed by the teacher
    p.click("[data-a=view][data-v=make]"); p.click("[data-a=mknew]"); p.click("[data-a=mkai]"); p.wait_for_selector("#mk-topic")
    p.click("#ai-details summary"); p.select_option("#ai-provider", "custom"); p.fill("#ai-url", "http://127.0.0.1:8098/v1"); p.fill("#ai-model", "stand-in"); p.click("[data-a=aisave]")
    p.click("[data-a=aitest]"); p.wait_for_function("() => /It works/.test(document.querySelector('#ai-details').textContent)", timeout=20000)
    check(True, "the AI settings' test reaches the AI")
    name = p.evaluate("DEMO.classes[0].students[1].name.split(' ')[0]")
    p.select_option("#mk-kind", "practice"); p.select_option("#mk-subj", "math")
    p.fill("#mk-topic", f"{name}'s birthday"); p.click("[data-a=mkwrite]"); p.wait_for_selector(".notice.bad")
    sent = [r for r in json.loads(urllib.request.urlopen("http://127.0.0.1:8098/requests").read()) if name in json.dumps(r)]
    check("names and codes" in p.inner_text(".notice.bad") and not sent, f"a topic with a student's name ({name}) is never sent to the AI")
    p.fill("#mk-topic", "a school store"); p.click("[data-a=mkwrite]"); p.wait_for_selector("fieldset.q", timeout=30000)
    mk = p.evaluate("window.__diana.make()")
    check(mk["step"] == "review" and mk["items"] == 6 and p.locator("[id$='-hint']").count() == 6, f"the AI wrote {mk['items']} questions with hints, for the teacher to read")
    p.fill("#q0-stem", "Changed by the teacher: what is 2 + 0?"); p.check('input[name="q2-key"][value="3"]'); p.click("[data-a=mkdelq][data-i='5']")
    p.click("[data-a=mknext]"); p.wait_for_selector(".who-list")
    p.select_option("#mk-cls", "3-112"); p.click("[data-a=mkmake]"); p.wait_for_selector("text=Made:")
    st2 = [x for x in p.evaluate("window.__diana.sets()") if x["kind"] == "practice"][0]
    sp = p.evaluate(f"window.__diana.sheet({st2['sheets'][0]['id']}).spec")
    check(st2["total"] == 5 and st2["key"][2] == "D" and sp["items"][0]["stem"].startswith("Changed by the teacher") and sp["hints"], f"made with the teacher's changes: {st2['total']} questions, key {st2['key']}, hints on the sheet")
    check(p.evaluate(f"window.__diana.pretendRead({st2['keySheet']})") and p.evaluate("window.__diana.reads()")[0]["status"] == "ready", "its answer key sheet, printed with the right answers filled in, reads as the same key")
    # any worksheet: the key tapped in
    p.click("[data-a=view][data-v=make]"); p.click("[data-a=mknew]"); p.click("[data-a=mkcount]"); p.fill("#mk-title", "Book page 42"); p.fill("#mk-n", "5"); p.dispatch_event("#mk-n", "change")
    p.select_option("#mk-all", "3"); p.click("[data-a=mknext]"); p.click("[data-a=mkmake]"); p.wait_for_selector("text=Made:")
    p.click("[data-a=mkkey]"); p.wait_for_selector(".keyrows")
    for q, v in enumerate("ABCAB"): p.click(f"[data-a=keypick][data-q='{q}'][data-v='{v}']")
    p.click("[data-a=keysave]")
    check(any(x["title"] == "Book page 42" and x["key"] == "ABCAB" for x in p.evaluate("window.__diana.sets()")), "any worksheet: 5 questions with 3 choices, the key tapped in")
    c.close()

    # 3. the live camera: Chromium's pretend camera plays the photos as a video
    video = f"{OUT}/camera.y4m"; y4m(frames + [desk(seed=99)] * 8, video)
    b.close()
    b = pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={video}", "--autoplay-policy=no-user-gesture-required"])
    c, p = new_page(b, permissions=["camera"])
    p.goto(PAGE); p.wait_for_selector("#app h1")
    p.click("[data-a=camera]")
    p.wait_for_function(f"() => window.__diana.camera().count >= {n}", timeout=90000)
    p.screenshot(path=f"{OUT}/camera.png")
    cam = p.evaluate("window.__diana.camera()")
    p.wait_for_timeout(3000)   # the video starts over: the same sheets aren't added twice
    p.click("[data-a=camclose]")
    rd = [x for x in p.evaluate("window.__diana.reads()") if x["ok"]]
    exact = [x for x in rd if want.get(x["id"]) == x["answers"]]
    check(len(rd) == n and len(exact) == n, f"the live camera read {len(rd)} sheets as they came into view, {len(exact)} of {n} exactly, each once (last: {cam['last']!r})")
    check(all(x["src"] == "camera" for x in rd) and "with the camera" in p.inner_text(".notice"), "after the camera closes, the list says what it read")
    c.close()

    # 5. the school's server, through a stand-in for the Android app (the app does these requests itself)
    if ODIN:
        jar = {}
        def native(raw):
            m = json.loads(raw); t, mid = m["t"], m.get("id")
            reply = {"t": "reply", "id": mid}
            def http(method, path, body=None):
                req = urllib.request.Request(ODIN + "/" + path, data=None if body is None else json.dumps(body).encode(), method=method,
                                             headers={"Content-Type": "application/json", **({"Cookie": jar["c"]} if jar.get("c") else {})})
                try:
                    with urllib.request.urlopen(req, timeout=20) as r: return r.status, r.read().decode(), r.headers.get("Set-Cookie", "")
                except urllib.error.HTTPError as e: return e.code, e.read().decode(), ""
            if t == "hello": reply.update(app="test", mode="server", server=ODIN)
            elif t == "signin":
                st, body, ck = http("POST", "api/signin", {"password": m.get("password", "")})
                if st == 200 and ck: jar["c"] = ck.split(";")[0]
                reply.update(ok=st == 200, status=st, error=None if st == 200 else json.loads(body or "{}").get("error"))
            elif t in ("get", "post"):
                st, body, _ = http("GET" if t == "get" else "POST", m["path"], m.get("body") if t == "post" else None)
                reply.update(status=st, body=body)
            else: reply.update(ok=True)
            return json.dumps(reply)
        b.close(); b = pw.chromium.launch()
        c, p = new_page(b)
        p.expose_function("__dianaNative", native)
        p.add_init_script("window.DianaAndroid = { onmessage: null, postMessage(s) { window.__dianaNative(s).then(r => { if (r && this.onmessage) this.onmessage({ data: r }); }); } };")
        p.goto(PAGE); p.wait_for_selector("#signin")
        check(p.locator("text=Demo · invented students").count() == 0 and "Sign in to Odin" in p.inner_text("#signin"), "in the app with a school's address: Odin's sign-in, not the demo")
        p.fill("#pw", "wrong"); p.click("#signin [type=submit]"); p.wait_for_selector(".notice.bad")
        check("isn't right" in p.inner_text(".notice.bad"), "a wrong password is refused")
        p.fill("#pw", "test-pass"); p.click("#signin [type=submit]"); p.wait_for_selector("[data-a=camera]")
        st = p.evaluate("window.__diana.state()")
        check(st["mode"] == "server" and st["signedIn"] and st["sheets"] > 0 and p.locator("#demo-h").count() == 0, f"signed in: {st['sheets']} of the school's sheets, no demo panel")
        sids = p.evaluate("() => window.__diana.ids('3-112').filter(id => { const s = window.__diana.sheet(id); return s.rec.status !== 'done' && s.rec.kind === 'post' && !s.mismatch; }).slice(0, 2)")
        b64 = p.evaluate("""ids => { const doc = new OdinPdf('test'); ids.forEach(id => { const s = window.__diana.sheet(id); shPdfSheetPage(doc, s.rec, { students: [], teacher: 'T', room: '1' }, {}); });
          const b = doc.bytes(); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }""", sids)
        Path(f"{OUT}/server.pdf").write_bytes(base64.b64decode(b64))
        papers = fill_pages(f"{OUT}/server.pdf", p.evaluate(SPEC_JS, sids), "srv")
        files, want = [], {}
        for k, (im, sid, ans) in enumerate(papers):
            pic, _ = photo(im, seed=40 + k, rot=3 - 6 * k); f = f"{OUT}/server-{k + 1}.jpg"; pic.save(f, quality=82); files.append(f); want[sid] = ans
        p.set_input_files("#files", files)
        p.wait_for_function("() => /^Read \\d+ sheet/.test((document.querySelector('.notice') || {}).textContent || '')", timeout=60000)
        p.click("[data-a=send]")
        p.wait_for_function("() => /Sent \\d+ sheet/.test(document.querySelector('.notice').textContent)", timeout=30000)
        rd = {x["id"]: x for x in p.evaluate("window.__diana.reads()")}
        req = urllib.request.Request(ODIN + "/api/school", headers={"Authorization": "Basic " + base64.b64encode(b"t:test-pass").decode()})
        school = json.loads(urllib.request.urlopen(req).read())
        cls = next(x for x in school["classes"] if x["id"] == "3-112")
        sheets = {x["id"]: x for x in cls["sheets"]}
        keys = {sid: sheets[sid]["key"] for sid in sids}
        right = {sid: sum(a == k for a, k in zip(want[sid], keys[sid])) for sid in sids}
        ok_sheets = all(sheets[sid]["status"] == "done" and sheets[sid]["answers"] == want[sid] and sheets[sid]["source"] == "scan" and sheets[sid]["right"] == right[sid] for sid in sids)
        on_check = all(any(k["kind"] == "post" and k["scores"].get(sheets[sid]["code"]) == right[sid] and k["id"].endswith(f"-{sheets[sid]['skill']}-post-sh{sheets[sid]['total']}") for k in cls["checks"]) for sid in sids)
        check(all(rd[s]["status"] == "sent" for s in sids) and ok_sheets, f"sent to Odin: both sheets are done there with the answers read and Odin's own scores {right}")
        check(on_check, "and each score is on that week's post-check in Odin")
        # a test written with AI through Odin (Odin's server calls the stand-in AI and keeps the key)
        auth = {"Authorization": "Basic " + base64.b64encode(b"t:test-pass").decode(), "Content-Type": "application/json"}
        urllib.request.urlopen(urllib.request.Request(ODIN + "/api/ai/settings", data=json.dumps({"provider": "openai", "url": "http://127.0.0.1:8098/v1", "model": "stand-in", "key": "sk-test-0123456789"}).encode(), headers=auth)).read()
        urllib.request.urlopen("http://127.0.0.1:8098/clear").read()
        p.click("[data-a=view][data-v=make]"); p.click("[data-a=mkai]"); p.wait_for_selector("#mk-topic")
        check("OpenAI" in p.inner_text(".panel") and p.locator("#ai-key").count() == 0, "at school, DI-ana shows Odin's AI and never asks for the key")
        p.select_option("#mk-kind", "test"); p.fill("#mk-topic", "ocean animals"); p.check("#mk-psg"); p.click("[data-a=mkwrite]"); p.wait_for_selector("fieldset.q", timeout=60000)
        reqs = json.loads(urllib.request.urlopen("http://127.0.0.1:8098/requests").read())
        check(len(reqs) == 1 and reqs[0]["key"] == "sk-test-0123456789" and "ocean animals" in json.dumps(reqs[0]["body"]), "Odin's server asked the AI, with the key it keeps")
        p.click("[data-a=mknext]"); p.wait_for_selector(".who-list"); p.select_option("#mk-cls", "3-112"); p.click("[data-a=mknone]")
        for k in range(2): p.locator(".mk-st").nth(k).check()
        p.click("[data-a=mkmake]"); p.wait_for_selector("text=Made:", timeout=30000)
        st = p.evaluate("window.__diana.sets()")[-1]
        sids = [st["keySheet"]] + [x["id"] for x in st["sheets"]]
        b64 = p.evaluate("""ids => { const doc = new OdinPdf('test'); ids.forEach(id => { const s = window.__diana.sheet(id); shPdfSheetPage(doc, s.rec, { students: [], teacher: 'T', room: '1' }, {}); });
          const b = doc.bytes(); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }""", sids)
        Path(f"{OUT}/server-set.pdf").write_bytes(base64.b64decode(b64))
        papers = fill_pages(f"{OUT}/server-set.pdf", p.evaluate(SPEC_JS, sids), "srvset", answers={st["keySheet"]: st["key"]})
        files, want = [], {}
        for k, (im, sid, ans) in enumerate(papers):
            pic, _ = photo(im, seed=80 + k, rot=2 - 2 * k); f = f"{OUT}/server-set-{k + 1}.jpg"; pic.save(f, quality=82); files.append(f); want[sid] = ans
        p.click("[data-a=view][data-v=scan]"); p.click("[data-a=clear]")   # the sheets sent before clear at once
        p.set_input_files("#files", files)
        p.wait_for_function("() => /^Read \\d+ sheet/.test((document.querySelector('.notice') || {}).textContent || '')", timeout=60000)
        p.click("[data-a=send]"); p.wait_for_function("() => /Sent \\d+ sheet/.test(document.querySelector('.notice').textContent)", timeout=30000)
        school = json.loads(urllib.request.urlopen(urllib.request.Request(ODIN + "/api/school", headers=auth)).read())
        oset = next(x for x in next(x for x in school["classes"] if x["id"] == "3-112")["sets"] if x["id"] == st["id"])
        right = {x["id"]: sum(a == k for a, k in zip(want[x["id"]], oset["key"])) for x in oset["sheets"]}
        check(oset["source"].startswith("AI: ") and all(x["status"] == "done" and x["answers"] == want[x["id"]] and x["right"] == right[x["id"]] for x in oset["sheets"]),
              f"in Odin: the test (with its passage) and both students' scores {right}, worked out by Odin")
        names = [s["name"] for cl in school["classes"] for s in cl["students"]]
        allreq = json.dumps(json.loads(urllib.request.urlopen("http://127.0.0.1:8098/requests").read()))
        check(not any(n in allreq for n in names), "nothing about a student was sent to the AI")
        c.close()
    else:
        print("     (no ODIN_URL: skipped the school's server)")
    b.close()

srv.shutdown()
check(not errs, f"no page errors {errs[:3]}")
print(f"\nPictures and PDFs in {OUT}")
print("ALL PASS" if not fails else f"{len(fails)} FAILED")
raise SystemExit(1 if fails else 0)
