#!/usr/bin/env python3
"""Reads what the emulator check saw (out/report.txt, out/standin.json, out/crash.txt) and says ok or FAIL for each part.
Exits 1 if anything failed."""
import json, re, sys
from pathlib import Path

OUT = Path(sys.argv[1])
rep = {}
for line in (OUT / "report.txt").read_text().splitlines() if (OUT / "report.txt").exists() else []:
    _, k, v = re.sub(r" \([^()]*\)$", "", line).split(" ", 2)   # Android adds the page's place in brackets
    try: rep[k] = json.loads(v)
    except ValueError: rep[k] = v
standin = json.loads((OUT / "standin.json").read_text()) if (OUT / "standin.json").exists() else {}
crash = (OUT / "crash.txt").read_text().strip() if (OUT / "crash.txt").exists() else ""
lines, fails = [], 0
def check(ok, msg):
    global fails
    lines.append(("ok   " if ok else "FAIL ") + msg); fails += not ok
h, d, cam = rep.get("hello", {}), rep.get("demo", {}), rep.get("camera", {})
check(h.get("mode") == "demo" and h.get("sheets", 0) > 500, f"the demo opens in the app with Odin's invented school: {h}")
reads = d.get("reads", [])
check(d.get("bridge") and len(reads) == 5 and all(r["ok"] for r in reads) and sum(r["status"] == "check" for r in reads) == 1, f"pretend pictures read in the app: {[r.get('status') for r in reads]}")
asked = json.loads((OUT / "camera-asked.json").read_text()).get("asked") if (OUT / "camera-asked.json").exists() else 0
check(asked == 1, "Android asked for the camera when the page first wanted it, and Allow was tapped")
cam_ok = bool(cam.get("on") and cam.get("video") and cam["video"][0] > 0 and any(s in cam.get("msg", "") for s in ("Hold the phone", "Hold still", "Reading")))
check(cam_ok, f"the camera opens (the app has the camera, the page gets the picture): {cam}")
sf, sv, se = rep.get("signin-form", {}), rep.get("server", {}), rep.get("sent", {})
check(sf.get("form") and not sf.get("demoChip"), f"with Odin's address, the app asks for Odin's password, not the demo: {sf}")
check(sv.get("state", {}).get("signedIn") and sv["state"].get("mode") == "server" and sv["state"].get("sheets", 0) > 0 and sv.get("read"), f"signed in through the app; the school's sheets loaded; a picture read: {sv}")
res = standin.get("results", [])
check(len(res) == 1 and res[0]["id"] == sv.get("id") and res[0]["answers"] == res[0]["key"] and res[0]["source"] == "scan" and standin.get("signins") == 1,
      f"the answers reached Odin through the app, with the sign-in's cookie: {res}")
check(any(r.get("status") == "sent" for r in se.get("reads", [])) and "Sent 1 sheet" in se.get("notice", ""), f"the page says it was sent: {se.get('notice')}")
check(not crash, "the app never crashed" + ("" if not crash else ": " + crash[:300]))
(OUT / "check.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
sys.exit(1 if fails else 0)
