#!/usr/bin/env python3
"""Copy the parts of Odin that DI-ana shares into odin/, so both apps read sheets the same way.

    python3 tools/sync_odin.py /path/to/project-cerabus

Odin (github.com/PurpleNinjaRadish/project-cerabus) makes the sheets and is the only place these files are edited.
Run this after every Odin change that touches them, then rebuild DI-ana (python3 web/build.py) and run its tests.
odin/SOURCE.json records which Odin version and commit the copy came from. No student data is copied: the demo
school is Odin's invented one.
"""
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DEST = HERE / "odin"
# The engine: making a sheet from its record (sheets*.js, engine.js), drawing it as PDF (pdf.js, sheets_pdf.js) and
# reading a picture of it (scan.js). Kept in this order: later files use earlier ones.
ENGINE = ["engine.js", "sheets_math.js", "sheets_reading.js", "sheets_passages.js", "sheets.js", "pdf.js", "sheets_pdf.js", "scan.js", "ai.js"]
OTHER = {"demo/school.json": "page-src/demo/school.json"}
FONTS = "public/fonts"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    odin = Path(sys.argv[1]).resolve()
    src = odin / "page-src/src"
    if not (src / "scan.js").is_file():
        sys.exit(f"{odin} doesn't look like Odin's repository (no page-src/src/scan.js)")
    files = {}
    for f in ENGINE:
        shutil.copyfile(src / f, DEST / f)
        files[f] = f
    for dest, rel in OTHER.items():
        (DEST / dest).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(odin / rel, DEST / dest)
        files[dest] = rel
    fonts = DEST / "fonts"
    if fonts.exists():
        shutil.rmtree(fonts)
    fonts.mkdir()
    for f in sorted((odin / FONTS).iterdir()):
        if f.suffix in (".woff2", ".css", ".txt"):
            shutil.copyfile(f, fonts / f.name)
            files["fonts/" + f.name] = FONTS + "/" + f.name
    version = (src / "engine.js").read_text(encoding="utf-8").split('const ODIN_VERSION = "', 1)[1].split('"', 1)[0]
    try:
        commit = subprocess.run(["git", "-C", str(odin), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "-C", str(odin), "status", "--porcelain", "page-src/src", "page-src/demo", FONTS], capture_output=True, text=True).stdout.strip())
    except Exception:
        commit, dirty = "", True
    source = {
        "odinVersion": version,
        "odinCommit": commit + (" (with changes not yet committed)" if dirty and commit else ""),
        "copied": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "files": {k: {"from": v, "sha256": hashlib.sha256((DEST / k).read_bytes()).hexdigest()} for k, v in sorted(files.items())},
    }
    (DEST / "SOURCE.json").write_text(json.dumps(source, indent=1) + "\n", encoding="utf-8")
    print(f"Copied Odin {version} ({commit[:10] or 'no git'}): {len(files)} files into odin/")


if __name__ == "__main__":
    main()
