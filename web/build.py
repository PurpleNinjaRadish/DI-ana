#!/usr/bin/env python3
"""Build DI-ana's page. Run from anywhere: python3 web/build.py   (needs Python 3.9+ and Node.js)

dist/index.html                              the web copy for GitHub Pages: the demo (invented students)
android/app/src/main/assets/web/index.html   the same page inside the Android app, with Odin's fonts from the app itself
                                             (so the app never calls the internet for them); there it can also use the
                                             school's Odin server through the app (DianaBridge)
The demo is made here from Odin's invented school (tools/demo_data.js). Odin's engine comes from odin/ (tools/sync_odin.py).
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
src = lambda f: (WEB / "src" / f).read_text(encoding="utf-8")
SOURCE = json.loads((ROOT / "odin/SOURCE.json").read_text(encoding="utf-8"))
ENGINE = ["engine.js", "sheets_math.js", "sheets_reading.js", "sheets_passages.js", "sheets.js", "pdf.js", "sheets_pdf.js", "scan.js", "ai.js"]
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

demo = subprocess.run(["node", str(ROOT / "tools/demo_data.js")], capture_output=True, text=True, check=True).stdout
assert json.loads(demo)["demo"] is True
engine = "\n".join((ROOT / "odin" / f).read_text(encoding="utf-8") for f in ENGINE)
info = {"version": VERSION, "odin": {"odinVersion": SOURCE["odinVersion"], "odinCommit": SOURCE.get("odinCommit", "")}}
head = src("head.html").replace("/*CSS*/", src("diana.css"))
page = (head + f"<script>\nconst DIANA = {json.dumps(info)};\nconst DEMO = {demo};\n{engine}\n{src('worksheet.js')}\n</script>\n<script>\n{src('diana.js')}\n</script>\n</body>\n</html>\n")

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(page, encoding="utf-8")
(dist / "icons").mkdir(exist_ok=True)
for f in (WEB / "icons").glob("*.png"):
    shutil.copyfile(f, dist / "icons" / f.name)
# pdf.js, loaded only when a teacher picks a worksheet's PDF (web/vendor/pdfjs/README.txt)
VENDOR = WEB / "vendor/pdfjs"
def copy_vendor(dest):
    (dest / "vendor/pdfjs").mkdir(parents=True, exist_ok=True)
    for f in VENDOR.iterdir():
        shutil.copyfile(f, dest / "vendor/pdfjs" / f.name)
copy_vendor(dist)
manifest = {"name": "DI-ana demo · Diagnostic testing and Intervention automatic analysis", "short_name": "DI-ana",
            "description": "Reads Odin's paper pre-checks, practice sheets and post-checks with the camera and sends only the answers to Odin. A demo with invented students.",
            "id": "./", "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait", "background_color": "#F3F2F6", "theme_color": "#6B3FA0",
            "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
(dist / "manifest.webmanifest").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")

# inside the Android app: no "install this page" parts, and the fonts from the app
app = re.sub(r"<!--app-->.*?<!--/app-->\n?", "", page, flags=re.S)
app = re.sub(r"<!--fonts-->.*?<!--/fonts-->", '<link rel="stylesheet" href="fonts/fonts.css">', app, flags=re.S)
assert "fonts.googleapis" not in app and "manifest" not in app
assets = ROOT / "android/app/src/main/assets/web"
if assets.parent.parent.exists():
    (assets / "fonts").mkdir(parents=True, exist_ok=True)
    (assets / "index.html").write_text(app, encoding="utf-8")
    for f in (ROOT / "odin/fonts").iterdir():
        shutil.copyfile(f, assets / "fonts" / f.name)
    copy_vendor(assets)
print(f"DI-ana {VERSION} with Odin {SOURCE['odinVersion']}'s engine: dist/index.html {len(page.encode()) // 1024} KB")
