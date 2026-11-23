#!/usr/bin/env python3
"""Finds a button in a uiautomator dump (by the end of its resource id) and prints the middle of it as "x y",
for adb shell input tap. Prints nothing if it isn't there. Used by the emulator check to answer Android's
permission question the way a person would."""
import re
import sys
import xml.etree.ElementTree as ET

try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(0)
for want in sys.argv[2:]:
    for n in root.iter("node"):
        if n.get("resource-id", "").endswith(want):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                print((x1 + x2) // 2, (y1 + y2) // 2)
                sys.exit(0)
