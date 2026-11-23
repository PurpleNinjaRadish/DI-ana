#!/usr/bin/env bash
# DI-ana's emulator check, run by .github/workflows/android.yml inside an Android 14 emulator, from the repository's top
# folder. It uses the debug build, which may reach a stand-in Odin over plain http (adb reverse makes the build machine's
# port 8090 the emulator's localhost). The page reports what it sees as "DIANA-REPORT" lines in Android's log.
set -u
OUT=out
mkdir -p "$OUT"
PKG=io.github.purpleninjaradish.diana.debug
ACT=$PKG/io.github.purpleninjaradish.diana.MainActivity
python3 android/ci/odin_standin.py 8090 "$OUT" > "$OUT/standin.log" 2>&1 &
sleep 3
adb reverse tcp:8090 tcp:8090
adb install -r -g android/app/build/outputs/apk/debug/app-debug.apk 2>&1 | tee "$OUT/install.txt"
adb logcat -c
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
js() { printf '%s' "$1" | base64 -w0; }
REPORT="const rep = (k, v) => console.log('DIANA-REPORT ' + k + ' ' + JSON.stringify(v));"

# 1. The setup screen (nothing saved yet): Odin's address, or the demo.
adb shell pm clear "$PKG" > /dev/null
adb shell am start -W -n "$ACT"
sleep 4; shot setup

# 2. The demo: pretend pictures (one with an answer to check), then the camera (the emulator's pretend scene).
adb shell am force-stop "$PKG"
adb shell am start -W -n "$ACT" --es diana_url demo --es diana_js64 "$(js "$REPORT setTimeout(() => { rep('hello', window.__diana.state()); document.querySelector('[data-a=pretend]').click();
  setTimeout(() => { rep('demo', { state: window.__diana.state(), reads: window.__diana.reads(), bridge: !!window.DianaAndroid }); document.querySelector('[data-a=camera]').click();
    setTimeout(() => rep('camera', window.__diana.camera()), 22000); }, 7000); }, 2500);")"
sleep 12; shot demo
# The setup step cleared the app, so Android asks for the camera now, the way it does on a new phone: tap Allow like a
# person (pressing Wait if the emulator's launcher shows "isn't responding" on top).
sleep 2; shot camera-ask
asked=0
for i in 1 2 3 4 5 6 7; do
  adb shell uiautomator dump /sdcard/diana-ui.xml > /dev/null 2>&1
  adb shell cat /sdcard/diana-ui.xml > "$OUT/camera-ui.xml" 2>/dev/null
  busy=$(python3 android/ci/tap.py "$OUT/camera-ui.xml" aerr_wait)
  if [ -n "$busy" ]; then adb shell input tap $busy; sleep 2; continue; fi
  at=$(python3 android/ci/tap.py "$OUT/camera-ui.xml" permission_allow_foreground_only_button permission_allow_one_time_button permission_allow_button)
  if [ -n "$at" ]; then adb shell input tap $at; asked=1; break; fi
  sleep 2
done
echo "{\"asked\": $asked}" > "$OUT/camera-asked.json"
sleep 12; shot camera
adb shell am force-stop "$PKG"

# 3. The school's Odin (the stand-in): sign in, load the sheets, read a pretend picture of one, send it.
adb shell am start -W -n "$ACT" --es diana_url "http://localhost:8090/" --es diana_js64 "$(js "$REPORT setTimeout(() => {
  rep('signin-form', { form: !!document.querySelector('#signin'), demoChip: !!document.querySelector('.chip.demo') });
  document.querySelector('#pw').value = 'test-pass'; document.querySelector('#signin').requestSubmit();
  setTimeout(() => { const st = window.__diana.state(); const id = (window.__diana.ids() || [])[0]; const read = window.__diana.pretendRead(id);
    rep('server', { state: st, id, read }); setTimeout(() => { document.querySelector('[data-a=send]').click();
      setTimeout(() => rep('sent', { reads: window.__diana.reads(), notice: (document.querySelector('.notice') || {}).textContent || '' }), 5000); }, 1000); }, 6000); }, 2500);")"
sleep 28; shot server
adb logcat -d -v time | grep -E "DianaBridge|DianaPage|AndroidRuntime|FATAL|purpleninjaradish" > "$OUT/logcat.txt" || true
adb logcat -d -s DianaPage:I | grep -o "DIANA-REPORT.*" > "$OUT/report.txt" || true
adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime" > "$OUT/crash.txt" || true
python3 android/ci/check.py "$OUT"
