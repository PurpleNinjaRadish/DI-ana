"""DI-ana's page checks. Build first (python3 web/build.py), then:  python3 web/tests/test_diana.py
Needs Playwright with Chromium, Pillow, numpy, and poppler (pdftoppm) and qpdf.

1. The demo: pretend pictures, checking a flagged answer, saving; the sample sheets as a PDF.
2. Photos: the sample PDF printed (pdftoppm), filled in with a pencil-like gray, photographed on a desk at an angle with
   uneven light (photo.py), then chosen as files: every answer read exactly.
3. The live camera: the same photos played as a video through Chromium's pretend camera; DI-ana reads each sheet as it
   comes into view, once, and every answer exactly.
4. A sheet made by another version of Odin isn't read (its answer key doesn't match).
5. With ODIN_URL (a running Odin 0.9.5 server on a fresh demo database, ODIN_PASSWORD=test-pass), the school's server
   through a stand-in for the Android app: sign in, load the sheets, read photos of two of the server's own sheets, send
   them, and find the scores in Odin, on the sheets and on the week's check.
"""
import base64, glob, http.server, json, os, random, re, subprocess, sys, tempfile, threading, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import photo, desk, y4m

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


def fill_pages(pdf, specs, prefix, dpi=150):
    """The PDF's pages as paper, with one bubble filled per question. Returns the pictures and the answers."""
    for f in glob.glob(f"{OUT}/{prefix}-*.pgm"): os.remove(f)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", pdf, f"{OUT}/{prefix}"], check=True)
    ppm, pages = dpi / 25.4, []
    for k, f in enumerate(sorted(glob.glob(f"{OUT}/{prefix}-*.pgm"))):
        im = Image.open(f).convert("L"); d = ImageDraw.Draw(im); ans = ""
        for it in specs[k]["items"]:
            c = random.randrange(len(it)); x, y, r = it[c]; ans += "ABCD"[c]; rr = r * random.uniform(0.78, 0.92) * ppm
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
    check(w["open"] and w["step"] == 1 and w["steps"] == 7 and "DI-ana does" in w["heading"] and "Diagnostic testing and Intervention automatic analysis" in p.inner_text("#tour"),
          f"the walkthrough opens the first time, with what DI-ana stands for: {w['heading']!r}, {w['steps']} steps")
    heads = [w["heading"]]
    for k in range(w["steps"] - 1):
        p.click("[data-a=tournext]"); heads.append(p.evaluate("window.__diana.walkthrough().heading"))
    p.keyboard.press("ArrowLeft"); back = p.evaluate("window.__diana.walkthrough().step")
    p.keyboard.press("ArrowRight")
    check(heads[1].startswith("1. Print") and heads[3].startswith("3. Scan") and heads[-1] == "At school" and back == 6 and p.locator("[data-a=tourscan]").count() == 1,
          f"it steps through printing, filling in, scanning, checking, sending and school ({len(heads)} steps; Back and the arrow keys work)")
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
        c.close()
    else:
        print("     (no ODIN_URL: skipped the school's server)")
    b.close()

srv.shutdown()
check(not errs, f"no page errors {errs[:3]}")
print(f"\nPictures and PDFs in {OUT}")
print("ALL PASS" if not fails else f"{len(fails)} FAILED")
raise SystemExit(1 if fails else 0)
