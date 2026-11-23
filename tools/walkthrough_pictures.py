#!/usr/bin/env python3
"""Takes the README's walkthrough pictures (docs/walkthrough/*.png) from the demo: the walkthrough, the camera reading a
sheet (Chromium's pretend camera, playing a picture of a filled-in sample sheet), an answer to check, sent sheets, and
(0.2) making tests and worksheets: a worksheet's PDF counted, questions written by a stand-in AI (web/tests/fake_ai.py)
for the teacher to check, and an answer key sheet.
Build first (python3 web/build.py). Needs Playwright, Pillow, numpy and pdftoppm. Every student shown is invented."""
import glob, os, random, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web/tests"))
from photo import photo, desk, y4m
import fake_ai

OUT, TMP = ROOT / "docs/walkthrough", Path(tempfile.mkdtemp(prefix="diana-pics-"))
OUT.mkdir(parents=True, exist_ok=True)
# the copy built for the Android app: the same page, with Odin's fonts from files instead of the internet
PAGE = (ROOT / "android/app/src/main/assets/web/index.html").as_uri()
SEEN = "try { localStorage.setItem('diana.walkthroughSeen', '1'); } catch (e) {}"
random.seed(4)


def page(b, seen=True, **kw):
    c = b.new_context(viewport={"width": 390, "height": 760}, device_scale_factor=2, accept_downloads=True, **kw)
    p = c.new_page()
    p.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") and "127.0.0.1" not in r.request.url else r.continue_())
    if seen: p.add_init_script(SEEN)
    p.goto(PAGE); p.wait_for_selector("#app h1"); p.wait_for_timeout(600)
    return c, p


with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 1. the walkthrough's first step
    c, p = page(b, seen=False)
    p.screenshot(path=str(OUT / "1-walkthrough.png"))
    p.click("[data-a=tournext]"); p.click("[data-a=tournext]"); p.click("[data-a=tournext]")
    p.screenshot(path=str(OUT / "2-walkthrough-scan.png"))
    p.keyboard.press("Escape")
    # a sample sheet, filled in and photographed, for the pretend camera
    p.select_option("#d-cls", "3-112"); p.select_option("#d-subj", "math"); p.select_option("#d-which", "pre")
    with p.expect_download() as dl: p.click("[data-a=samplepdf]")
    dl.value.save_as(str(TMP / "s.pdf"))
    sid = p.evaluate("window.__diana.ids('3-112', 'math', 'pre')[0]")
    items = p.evaluate("id => window.__diana.sheet(id).spec.layout.items.map(it => it.choices.map(c => [c.bx, c.by, c.r]))", sid)
    c.close()
    subprocess.run(["pdftoppm", "-r", "150", "-gray", "-f", "1", "-l", "1", str(TMP / "s.pdf"), str(TMP / "pg")], check=True)
    im = Image.open(glob.glob(str(TMP / "pg-*.pgm"))[0]).convert("L"); d = ImageDraw.Draw(im); ppm = 150 / 25.4
    for it in items:
        x, y, r = it[random.randrange(len(it))]; d.ellipse([(x - r * 0.85) * ppm, (y - r * 0.85) * ppm, (x + r * 0.85) * ppm, (y + r * 0.85) * ppm], fill=70)
    cam, _ = photo(im, out_w=720, out_h=1280, seed=3, tilt=0.08, rot=3, fill=0.86)
    y4m([desk(seed=1)] * 6 + [cam] * 60, str(TMP / "cam.y4m"))
    b.close()

    # 2. the camera reading it
    b = pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={TMP / 'cam.y4m'}"])
    c, p = page(b, permissions=["camera"])
    p.click("[data-a=camera]"); p.wait_for_function("() => window.__diana.camera().count >= 1", timeout=60000); p.wait_for_timeout(500)
    p.screenshot(path=str(TMP / "camera.png"))
    Image.open(TMP / "camera.png").convert("RGB").save(OUT / "3-camera.jpg", quality=80)   # a photo: smaller as JPEG
    p.click("[data-a=camclose]")
    # 3. an answer to check, and 4. saved
    p.click("[data-a=pretend]"); p.wait_for_function("() => /^Read \\d+ pretend/.test(document.querySelector('.notice').textContent)")
    card = p.locator(".read.check").first
    card.scroll_into_view_if_needed(); card.screenshot(path=str(OUT / "4-check.png"))
    p.locator(".read.check [data-a=fix]").first.click()
    p.click("[data-a=send]"); p.wait_for_timeout(300)
    p.evaluate("window.scrollTo(0, 0)"); p.locator("section.panel").first.screenshot(path=str(OUT / "5-sent.png"))
    im = Image.open(OUT / "5-sent.png"); im.crop((0, 0, im.width, min(im.height, 1250))).save(OUT / "5-sent.png")   # the top: the notice and the first sheets
    c.close(); b.close()

    # 0.2: making tests and worksheets
    AI = fake_ai.start(8096)
    b = pw.chromium.launch()
    wp = b.new_page(); wp.set_content("<html><body style='font-family:Arial;font-size:13pt'><h2>Fractions review</h2><p>Name ________</p>" + "".join(
        f"<p>{i}. Which fraction is the same as {i}/{i * 2}?</p><p>A. 1/2&nbsp;&nbsp;&nbsp;B. 1/3&nbsp;&nbsp;&nbsp;C. 2/3&nbsp;&nbsp;&nbsp;D. 3/4</p>" for i in range(1, 11)) + "</body></html>")
    wp.pdf(path=str(TMP / "worksheet.pdf"), format="Letter"); wp.close()
    c, p = page(b)
    p.click("[data-a=view][data-v=make]"); p.wait_for_timeout(300)
    p.screenshot(path=str(OUT / "6-make.png"))
    p.set_input_files("#mk-file", str(TMP / "worksheet.pdf")); p.wait_for_selector("#mk-n", timeout=60000); p.fill("#mk-title", "Fractions review"); p.wait_for_timeout(300)
    p.locator("section.panel").first.screenshot(path=str(OUT / "7-worksheet.png"))
    im = Image.open(OUT / "7-worksheet.png"); im.crop((0, 0, im.width, min(im.height, 1500))).save(OUT / "7-worksheet.png")
    p.click("[data-a=mknext]"); p.select_option("#mk-cls", "3-112"); p.click("[data-a=mkmake]"); p.wait_for_selector("text=Made:")
    with p.expect_download() as dl: p.click("[data-a=mkprint]")
    dl.value.save_as(str(TMP / "set.pdf"))
    subprocess.run(["pdftoppm", "-r", "60", "-png", "-f", "1", "-l", "1", str(TMP / "set.pdf"), str(TMP / "key")], check=True)
    Image.open(glob.glob(str(TMP / "key-*.png"))[0]).convert("RGB").save(OUT / "8-key-sheet.png")
    p.click("[data-a=mknew]"); p.click("[data-a=mkai]"); p.wait_for_selector("#mk-topic")
    p.click("#ai-details summary"); p.select_option("#ai-provider", "custom"); p.fill("#ai-url", "http://127.0.0.1:8096/v1"); p.fill("#ai-model", "llama3.1:8b"); p.click("[data-a=aisave]")
    p.select_option("#mk-subj", "math"); p.fill("#mk-topic", "a school store"); p.click("[data-a=mkwrite]"); p.wait_for_selector("fieldset.q", timeout=30000)
    p.fill("#mk-title", "Adding zero"); p.evaluate("window.scrollTo(0, 0)"); p.wait_for_timeout(200)
    p.locator("section.panel").first.screenshot(path=str(OUT / "9-ai-review.png"))
    im = Image.open(OUT / "9-ai-review.png"); im.crop((0, 0, im.width, min(im.height, 1500))).save(OUT / "9-ai-review.png")
    c.close(); b.close(); AI.shutdown()
for f in sorted(OUT.iterdir()):
    print(f.name, Image.open(f).size, f.stat().st_size // 1024, "KB")
