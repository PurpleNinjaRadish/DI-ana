#!/usr/bin/env python3
"""Draws DI-ana's icons (web/icons/*.png) from one picture: a sheet with Odin's four corner squares, a filled
bubble and a scan line, on DI-ana's plum. Needs Playwright (python3 -m pip install playwright). Run when the icon changes."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "web/icons"
def svg(pad):   # pad: room around the picture (a maskable icon keeps its middle 80% safe)
    s = 100 - 2 * pad
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" fill="#6B3FA0"/>
  <g transform="translate({pad} {pad}) scale({s / 100})">
    <rect x="25" y="14" width="50" height="68" rx="4" fill="#fff"/>
    <g fill="#1B1726"><rect x="30" y="19" width="8" height="8"/><rect x="62" y="19" width="8" height="8"/><rect x="30" y="69" width="8" height="8"/><rect x="62" y="69" width="8" height="8"/></g>
    <g fill="none" stroke="#6B3FA0" stroke-width="2.2"><circle cx="38" cy="44" r="4.2"/><circle cx="62" cy="44" r="4.2"/><circle cx="38" cy="57" r="4.2"/></g>
    <g fill="#6B3FA0"><circle cx="50" cy="44" r="4.2"/><circle cx="50" cy="57" r="4.2"/></g>
    <rect x="16" y="49.5" width="68" height="3" rx="1.5" fill="#F2C14E"/>
  </g></svg>"""
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    for name, size, pad in (("icon-192.png", 192, 4), ("icon-512.png", 512, 4), ("icon-maskable-512.png", 512, 14), ("apple-touch-icon.png", 180, 6)):
        pg.set_viewport_size({"width": size, "height": size})
        pg.set_content(f"<html><body style='margin:0'>{svg(pad)}</body></html>")
        pg.screenshot(path=str(OUT / name), omit_background=False)
    b.close()
print("icons in", OUT)
