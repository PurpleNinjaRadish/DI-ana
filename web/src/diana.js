// =====================================================================================================
// DI-ana: reads Odin's paper sheets (pre-checks, practice 1 and 2, post-checks, and from 0.2 tests, practice sheets and
// worksheet answer sheets made here) with the phone's camera, or from photos and scans, and sends only the answers to Odin. The sheet code, the corner squares and the bubbles are read by Odin's own
// scanner (odin/scan.js); each sheet is drawn again from its record by Odin's own sheet maker (odin/sheets*.js).
// Pictures are read in memory and never saved or sent. Nothing stays on the device: closing DI-ana clears the list.
// Two ways to run: the demo (invented students, built in) and the school's Odin server (in the Android app, which signs
// in and talks to the server for the page; see android/.../DianaBridge.java).
// =====================================================================================================
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const SUBJ = { math: "Math", reading: "Reading" };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekLabel = ws => { const we = addDaysISO(ws, 4), [, m1, d1] = ws.split("-").map(Number), [y2, m2, d2] = we.split("-").map(Number);
    return m1 === m2 ? `${MON[m1 - 1]} ${d1}–${d2}, ${y2}` : `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y2}`; };
  const SET_WORD = { test: "Test", practice: "Practice sheet", worksheet: "Worksheet answers" };
  const isKeyRec = rec => rec.kind === "set" && !!(rec.custom && rec.custom.keySheet);
  const sheetLabel = rec => (rec.kind === "set" ? (isKeyRec(rec) ? "Answer key" : SET_WORD[rec.custom.setKind] || "Sheet") : rec.kind === "practice" ? `Practice ${rec.part}` : SH_KIND[rec.kind]);
  const sheetWhat = rec => (rec.kind === "set" ? `${isKeyRec(rec) ? "For the teacher" : sheetLabel(rec)} · ${rec.custom.title}${rec.subject ? " · " + SUBJ[rec.subject] : ""}` : `${sheetLabel(rec)} · ${shSkillName(rec.subject, rec.skill)} · ${SUBJ[rec.subject]}`);
  const SRC_WORD = { scan: "scanned", digital: "on a device", hand: "entered by hand" };
  const FLAG_WORDS = { blank: "Looks blank", light: "Light mark", two: "Two bubbles filled", erased: "Maybe erased" };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  // ---------- the Android app (DianaBridge): the school's server, the phone's buzz and its print screen ----------
  const BRIDGE = typeof window !== "undefined" && window.DianaAndroid && typeof window.DianaAndroid.postMessage === "function" ? window.DianaAndroid : null;
  let seq = 0;
  const waits = new Map();
  function ask(t, extra, ms) {
    return new Promise(res => {
      if (!BRIDGE) return res(null);
      const id = "d" + (++seq);
      waits.set(id, res);
      try { BRIDGE.postMessage(JSON.stringify(Object.assign({ t, id }, extra || {}))); } catch (e) { waits.delete(id); return res(null); }
      setTimeout(() => { if (waits.has(id)) { waits.delete(id); res(null); } }, ms || 20000);
    });
  }
  if (BRIDGE) BRIDGE.onmessage = ev => {
    let m; try { m = JSON.parse(ev && ev.data); } catch (e) { return; }
    if (!m) return;
    if (m.t === "reply" && waits.has(m.id)) { const f = waits.get(m.id); waits.delete(m.id); f(m); }
    else if (m.t === "app" && m.ev === "hidden") camStop();   // DI-ana left the screen: the camera turns off at once
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) camStop(); });

  // ---------- state: everything is in memory only ----------
  const S = {
    mode: "demo", server: "", appVersion: "", signedIn: false, needSignIn: false, loading: false, error: "",
    data: null, byId: new Map(), today: "", names: false, msg: "", msgKind: "",
    reads: [], sending: false, leaving: false, view: "scan", make: null, keyEdit: null, setDel: null, aiServer: null,
    demo: { cls: null, subj: "math", which: "pre" },
    tour: { open: false, step: 0, focus: false }
  };
  function useData(d) {
    S.data = d; S.byId = new Map(); S.today = d.today || new Date().toISOString().slice(0, 10);
    for (const c of d.classes) {
      for (const r of c.sheets) S.byId.set(r.id, { rec: r, cls: c, spec: null, mismatch: false });
      c.sets = c.sets || [];   // 0.2: tests, practice sheets and worksheet answer sheets (Odin 0.10)
      c.sets.forEach(st => addSetRecs(st, c));
    }
    if (!S.demo.cls || !d.classes.some(c => c.id === S.demo.cls)) S.demo.cls = (d.classes.slice().sort((a, b) => b.sheets.length - a.sheets.length)[0] || {}).id || null;
  }
  // A set's answer key sheet and each student's sheet, drawn again by Odin's sheet maker from the set's questions.
  function addSetRecs(st, c) {
    shSetRecs(st).forEach(rec => { rec.title = st.title; S.byId.set(rec.id, { rec, cls: c, spec: null, mismatch: false, set: st }); });
  }
  // A set's key changed: every sheet of it is drawn again (the key sheet shows the key) and scored again.
  function setKey(st, key) {
    st.key = key;
    S.byId.forEach(e => { if (e.set === st) { e.rec.key = key; e.spec = null; } });
  }
  const setSheet = (st, id) => (st.sheets || []).find(x => x.id === id);
  const keyNorm = a => String(a || "").replace(/[-*]/g, "?");
  // The key to score a set's sheets with now: one just read from its answer key sheet (not yet sent), or the set's own.
  function keyFor(st) {
    const k = S.reads.find(y => y.ok && y.set === st && y.isKey && y.status === "ready");
    return k ? keyNorm(k.answers) : st.key;
  }
  // The score of a read sheet, or null when it can't be scored yet (a set whose key isn't known, or an answer key sheet).
  function scoreOf(x) {
    if (x.set) {
      if (x.isKey) return null;
      const key = keyFor(x.set);
      if (key.includes("?")) return null;
      let n = 0; for (let i = 0; i < key.length; i++) if (x.answers[i] === key[i]) n++;
      return n;
    }
    return shScore(x.spec, x.answers).right;
  }
  // Odin draws each sheet again from its record. If this copy of Odin's sheet maker doesn't make the same answer key as
  // the server's, the sheet came from another version of Odin: DI-ana won't guess at it.
  function specFor(id) {
    const e = S.byId.get(id);
    if (!e) return null;
    if (!e.spec) {
      try { e.spec = shBuildSheet(Object.assign({}, e.rec)); } catch (err) { e.spec = null; }
      e.mismatch = e.set ? !e.spec || e.spec.total !== e.set.total : !e.spec || e.spec.key !== e.rec.key || e.spec.total !== e.rec.total;
    }
    return e.mismatch ? null : e.spec;
  }
  const who = (cls, code) => { const s = cls && cls.students.find(x => x.code === code); return s && S.names ? s.name : code; };
  const whoRec = (cls, rec) => (isKeyRec(rec) ? "Answer key" : who(cls, rec.code));

  // ---------- reading one picture ----------
  let readKey = 0;
  function flagPics(img, r) {
    return r.flags.map(fl => {
      const it = r.spec.layout.items[fl.item], c0 = it.choices[0];
      const box = { x: c0.x - 1, y: c0.y - 1, w: it.w - 4, h: it.choices.reduce((m, c) => Math.max(m, c.y + c.h), 0) - c0.y + 2 };
      let pic = ""; try { pic = scPicture(img, box, r.H, 420); } catch (e) {}
      return Object.assign({}, fl, { pic });
    });
  }
  // Adds what was read to the list. Returns the entry, or null when a camera frame didn't show a readable sheet.
  function addRead(r, img, src, file) {
    if (r.ok) {
      const e = S.byId.get(r.id), open = flagPics(img, r);
      let thumb = ""; try { thumb = scPicture(img, null, null, 90); } catch (err) {}
      const x = { key: ++readKey, ok: true, id: r.id, rec: e.rec, cls: e.cls, spec: r.spec, answers: r.answers, flagsN: r.flags.length, open, src, file, thumb, note: "",
        set: e.set || null, isKey: isKeyRec(e.rec) };
      x.status = open.length ? "check" : doneStatus(x);
      const old = S.reads.find(y => y.ok && y.id === r.id && y.status !== "sent");
      if (old) { S.reads = S.reads.filter(y => y !== old); x.note = "Read twice: this copy is used."; }
      S.reads.unshift(x);
      return x;
    }
    if (src === "camera") return null;
    const e = r.id ? S.byId.get(r.id) : null;
    const x = { key: ++readKey, ok: false, id: r.id || null, reason: e && e.mismatch ? "version" : r.reason, src, file, img: r.reason === "code" || r.reason === "unknown" ? img : null, status: "unread" };
    try { x.thumb = scPicture(img, null, null, 90); } catch (err) {}
    S.reads.unshift(x);
    return x;
  }
  const lookup = id => specFor(id);
  // A sheet with no answers left to check: ready, or one that already has a result in Odin (asks before replacing it).
  // An answer key sheet "already has a result" when Odin knows the whole key and this one is different.
  function doneStatus(x) {
    if (x.isKey) return !x.set.key.includes("?") && x.set.key !== keyNorm(x.answers) ? "replace" : "ready";
    return x.rec.status === "done" ? "replace" : "ready";
  }
  // One line about a read sheet, for the camera's screen.
  function readLine(x, before) {
    const sc = scoreOf(x), total = x.spec.total;
    return `<b>${esc(whoRec(x.cls, x.rec))}</b> · ${esc(x.set ? x.set.title : sheetLabel(x.rec))}${x.isKey ? ` · key <b>${esc(keyNorm(x.answers))}</b>` : ` · <b>${sc == null ? "–" : sc}/${total}</b>`}${x.open.length ? ` · check ${plural(x.open.length, "answer")}` : ""}${x.status === "replace" ? (x.isKey ? " · Odin has another key" : " · already had a result") : ""}${before ? " · read again" : ""}`;
  }
  async function readFiles(files) {
    say("Reading…"); render();
    let n = 0, ok = 0, bad = 0;
    for (const file of files) {
      let imgs;
      try { imgs = await scLoadFile(file); }
      catch (err) { S.reads.unshift({ key: ++readKey, ok: false, status: "unread", reason: "file", file: file.name, error: `Couldn't open ${file.name}: ${err.message || err}.` }); bad++; continue; }
      for (let k = 0; k < imgs.length; k++) {
        n++; say(`Reading page ${n}…`); render();
        await new Promise(r => setTimeout(r, 10));
        let r; try { r = scReadPage(imgs[k], lookup); } catch (err) { r = { ok: false, reason: "marks" }; }
        const x = addRead(r, imgs[k], "file", file.name + (imgs.length > 1 ? ` · page ${k + 1}` : ""));
        if (x && x.ok) ok++; else bad++;
      }
    }
    say(`Read ${plural(ok, "sheet")}${bad ? `; ${plural(bad, "page")} not read` : ""}. ${S.mode === "server" ? "Nothing goes to Odin until you press Send." : ""}`, bad ? "" : "ok");
    render();
  }

  // ---------- the camera ----------
  const CAM = { on: false, stream: null, video: null, timer: 0, last: null, steady: 0, away: null, gone: 0, count: 0, busy: false, torch: false, audio: null };
  function camEl() {
    let el = $("#cam");
    if (el) return el;
    el = document.createElement("div");
    el.id = "cam"; el.className = "cam"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Camera");
    el.innerHTML = `<video playsinline muted autoplay></video><canvas aria-hidden="true"></canvas><div class="flash"></div>
      <div class="bar"><button class="btn sm" data-a="camclose">Done</button><span class="n" id="cam-n">0 read</span><button class="btn ghost sm" data-a="torch" id="cam-torch" hidden>Light</button></div>
      <div class="foot"><div class="last" id="cam-last" role="status"></div><div class="msg" id="cam-msg" aria-live="polite">Starting the camera…</div></div>`;
    document.body.appendChild(el);
    return el;
  }
  function camSay(t) { const m = $("#cam-msg"); if (m && m.textContent !== t) m.textContent = t; }
  function camLast(html, warn) { const m = $("#cam-last"); if (!m) return; m.innerHTML = html; m.className = "last on" + (warn ? " warn" : ""); }
  function beep(good) {
    try {
      if (!CAM.audio) CAM.audio = new (window.AudioContext || window.webkitAudioContext)();
      const a = CAM.audio, o = a.createOscillator(), g = a.createGain();
      o.frequency.value = good ? 1046 : 440; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.2);
    } catch (e) {}
    if (BRIDGE) ask("buzz", { ms: good ? 60 : 160 }, 1000); else if (navigator.vibrate) try { navigator.vibrate(good ? 60 : [60, 60, 60]); } catch (e) {}
  }
  async function camStart() {
    const el = camEl();
    el.classList.add("on"); document.body.style.overflow = "hidden";
    Object.assign(CAM, { on: true, last: null, steady: 0, away: null, gone: 0, count: 0, busy: false });
    $("#cam-n").textContent = "0 read"; $("#cam-last").className = "last"; camSay("Starting the camera…");
    try { if (!CAM.audio) CAM.audio = new (window.AudioContext || window.webkitAudioContext)(); if (CAM.audio.state === "suspended") CAM.audio.resume(); } catch (e) {}
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camSay(window.isSecureContext === false ? "The camera works only on a secure (https) page." : "This browser has no camera access. Choose photos instead."); return; }
    try {
      CAM.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (err) {
      const n = err && err.name;
      camSay(n === "NotAllowedError" || n === "SecurityError" ? (BRIDGE ? "DI-ana isn't allowed to use the camera. Allow it in Android's Settings › Apps › DI-ana › Permissions, then try again." : "The camera isn't allowed for this page. Allow it in the browser's site settings, then try again.")
        : n === "NotFoundError" || n === "OverconstrainedError" ? "This device has no camera DI-ana can use. Choose photos instead." : "The camera didn't start (" + (err && (err.message || n)) + ").");
      return;
    }
    if (!CAM.on) { camRelease(); return; }
    const v = el.querySelector("video");
    CAM.video = v; v.srcObject = CAM.stream;
    try { await v.play(); } catch (e) {}
    const track = CAM.stream.getVideoTracks()[0], caps = track && track.getCapabilities ? track.getCapabilities() : {};
    $("#cam-torch").hidden = !(caps && caps.torch);
    camSay("Hold the phone over a sheet so all four black corner squares show.");
    camTick();
  }
  function camRelease() {
    if (CAM.stream) CAM.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    CAM.stream = null;
    if (CAM.video) CAM.video.srcObject = null;
  }
  function camStop() {
    if (!CAM.on) return;
    CAM.on = false; clearTimeout(CAM.timer); camRelease();
    const el = $("#cam"); if (el) el.classList.remove("on");
    document.body.style.overflow = "";
    if (CAM.count) say(`Read ${plural(CAM.count, "sheet")} with the camera.${S.reads.some(x => x.status === "check") ? " Some answers need a look first." : ""}`, "ok");
    render();
  }
  const camCanvas = document.createElement("canvas"), camFull = document.createElement("canvas");
  function grab(v, maxDim, cv) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const k = Math.min(1, maxDim / Math.max(vw, vh)), w = Math.round(vw * k), h = Math.round(vh * k);
    cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.drawImage(v, 0, 0, w, h);
    return { g: scToGray(cx.getImageData(0, 0, w, h).data, w, h), w, h, k };
  }
  // The live view: a few times a second, look for the four corner squares in a small copy of the frame. When they hold
  // still for two looks, read the whole frame at full size. A sheet just read isn't read again until it leaves the view.
  function camTick() {
    if (!CAM.on) return;
    CAM.timer = setTimeout(camTick, 220);
    if (CAM.busy || !CAM.video || CAM.video.readyState < 2) return;
    const small = grab(CAM.video, 640, camCanvas);
    if (!small) return;
    let marks = null;
    try { marks = scFindMarksCam(small.g, small.w, small.h, { maxDim: 640 }); } catch (e) {}
    drawMarks(marks, small);
    if (!marks) {
      CAM.steady = 0; CAM.last = null;
      if (CAM.away != null && ++CAM.gone >= 2) CAM.away = null;
      if (CAM.away == null) camSay("Hold the phone over a sheet so all four black corner squares show.");
      return;
    }
    CAM.gone = 0;
    const span = Math.hypot(small.w, small.h), moved = CAM.last ? Math.max(...marks.map((p, i) => Math.hypot(p[0] - CAM.last[i][0], p[1] - CAM.last[i][1]))) / span : 1;
    CAM.last = marks;
    CAM.steady = moved < 0.02 ? CAM.steady + 1 : 0;
    if (CAM.steady < 2) { if (CAM.away == null) camSay("Hold still…"); return; }
    CAM.busy = true;
    setTimeout(() => { try { camRead(); } finally { CAM.busy = false; } }, 0);
  }
  function camRead() {
    if (!CAM.on) return;
    const f = grab(CAM.video, 2600, camFull);
    if (!f) return;
    let r; try { r = scReadPage(f, lookup, null, { camera: true }); } catch (e) { r = { ok: false, reason: "marks" }; }
    if (!r.ok) {
      if (r.reason === "unknown" && CAM.away !== "x" + r.id) {
        const e = S.byId.get(r.id);
        CAM.away = "x" + r.id; beep(false);
        camLast(e && e.mismatch ? `Sheet <b>${r.id}</b> was made by another version of Odin. Update DI-ana, then scan it again.` : `Sheet <b>${r.id}</b> isn't in ${S.mode === "demo" ? "DI-ana's demo. Print the demo's sample sheets to try it" : "Odin (another school's, or deleted)"}.`, true);
        camSay("Next sheet.");
      } else if (r.reason !== "unknown") camSay("Reading… hold steady, with the sheet flat and well lit.");
      CAM.steady = 0;
      return;
    }
    if (CAM.away === r.id) return;   // the sheet just read is still in view
    CAM.away = r.id;
    const before = S.reads.find(y => y.ok && y.id === r.id);
    if (before && before.status === "sent") { beep(false); camLast(`Already sent: <b>${esc(whoRec(before.cls, before.rec))}</b> · ${esc(sheetLabel(before.rec))}`, true); camSay("Next sheet."); return; }
    const x = addRead(r, f, "camera");
    CAM.count++;
    $("#cam-n").textContent = `${CAM.count} read`;
    const fl = $("#cam .flash"); fl.classList.add("on"); setTimeout(() => fl.classList.remove("on"), 60);
    beep(!x.open.length);
    camLast(readLine(x, before), x.open.length > 0);
    camSay("Read. Next sheet.");
  }
  function drawMarks(marks, small) {
    const el = $("#cam"), cv = el && el.querySelector("canvas"), v = CAM.video;
    if (!cv || !v) return;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const cx = cv.getContext("2d");
    cx.clearRect(0, 0, W, H);
    // the whole video shows on the screen ("contain"), so all four corners can be seen: map the small frame to the screen
    const s = Math.min(W / small.w, H / small.h), ox = (W - small.w * s) / 2, oy = (H - small.h * s) / 2;
    if (!marks) {
      const vw = small.w * s, vh = small.h * s, gw = Math.min(vw * 0.84, vh * 0.84 / 1.294), gh = gw * 1.294, gx = (W - gw) / 2, gy = (H - gh) / 2, L = Math.min(gw, gh) * 0.09;
      cx.strokeStyle = "rgba(255,255,255,.85)"; cx.lineWidth = 4;
      for (const [x, y, dx, dy] of [[gx, gy, 1, 1], [gx + gw, gy, -1, 1], [gx + gw, gy + gh, -1, -1], [gx, gy + gh, 1, -1]]) { cx.beginPath(); cx.moveTo(x, y + dy * L); cx.lineTo(x, y); cx.lineTo(x + dx * L, y); cx.stroke(); }
      return;
    }
    const pts = marks.map(([x, y]) => [ox + x * s, oy + y * s]);
    cx.strokeStyle = CAM.away != null ? "rgba(99,199,185,.95)" : "rgba(195,163,238,.95)"; cx.lineWidth = 3;
    cx.beginPath(); pts.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.closePath(); cx.stroke();
    cx.fillStyle = cx.strokeStyle;
    pts.forEach(([x, y]) => { cx.beginPath(); cx.arc(x, y, 9, 0, Math.PI * 2); cx.fill(); });
  }
  async function torch() {
    const t = CAM.stream && CAM.stream.getVideoTracks()[0];
    if (!t) return;
    try { CAM.torch = !CAM.torch; await t.applyConstraints({ advanced: [{ torch: CAM.torch }] }); $("#cam-torch").textContent = CAM.torch ? "Light off" : "Light"; } catch (e) { $("#cam-torch").hidden = true; }
  }

  // ---------- sending to Odin ----------
  async function send() {
    const list = S.reads.filter(x => x.ok && x.status === "ready").sort((a, b) => b.isKey - a.isKey);   // answer keys first
    if (!list.length || S.sending) return;
    S.sending = true; say(`Sending ${plural(list.length, "sheet")}…`); render();
    let sent = 0, failed = 0, signin = false;
    for (const x of list) {
      const body = { classId: x.cls.id, id: x.id, answers: x.answers, source: "scan", taken: S.today, flags: Math.min(x.set ? 60 : 20, x.flagsN || 0) };
      if (S.mode === "demo") {
        if (x.set) demoSetResult(x);
        else {
          const sc = shScore(x.spec, x.answers);
          Object.assign(x.rec, { status: "done", right: sc.right, source: "scan", taken: S.today });
          Object.assign(x, { status: "sent", score: sc.right, img: null });
        }
        sent++; continue;
      }
      const r = await ask("post", { path: "api/sheet/result", body }, 30000);
      if (r && r.status === 200) {
        let j = {}; try { j = JSON.parse(r.body || "{}"); } catch (e) {}
        if (x.set) setResult(x, j);
        else {
          Object.assign(x.rec, { status: "done", right: j.score, source: "scan", taken: S.today });
          Object.assign(x, { status: "sent", score: j.score, img: null });
        }
        sent++;
      } else if (r && r.status === 401) { signin = true; break; }
      else {
        let msg = r ? "Odin answered " + r.status : "Odin didn't answer";
        try { const j = JSON.parse((r && r.body) || "{}"); if (j.error) msg = j.error; } catch (e) {}
        x.status = "error"; x.error = msg; failed++;
      }
    }
    S.sending = false;
    if (signin) { S.signedIn = false; S.needSignIn = true; say(`Sent ${plural(sent, "sheet")}. Odin's sign-in ended: sign in again to send the rest. They're still here.`, "bad"); }
    else say(S.mode === "demo" ? `Saved ${plural(sent, "sheet")} in the demo. In the demo nothing leaves this page.` : `Sent ${plural(sent, "sheet")} to Odin.${failed ? ` ${plural(failed, "sheet")} didn't go: see below.` : list.some(x => x.set) ? " Scores for tests and worksheets are on Odin's Practice tab, under Tests and worksheets." : " Pre- and post-check scores are on Odin's Weekly focus and Progress tabs."}`, failed ? "bad" : "ok");
    render();
  }
  // What Odin answered for a set's sheet: the score (none while the key isn't known), or, for its answer key sheet, the key
  // and every score worked out again with it.
  function setResult(x, j) {
    const st = x.set;
    if (x.isKey) {
      if (typeof j.key === "string") setKey(st, j.key);
      (j.scores || []).forEach(o => { const sh = setSheet(st, o.id), e = S.byId.get(o.id); if (sh) sh.right = o.score; if (e) e.rec.right = o.score; });
      Object.assign(x, { status: "sent", score: null, img: null });
      return;
    }
    const sh = setSheet(st, x.id);
    if (sh) Object.assign(sh, { status: "done", right: j.score, source: "scan", taken: S.today, answers: x.answers });
    Object.assign(x.rec, { status: "done", right: j.score, source: "scan", taken: S.today });
    Object.assign(x, { status: "sent", score: j.score, img: null });
  }
  // The demo works the same out on the page.
  function demoSetResult(x) {
    const st = x.set;
    if (x.isKey) {
      const key = keyNorm(x.answers);
      setKey(st, key);
      setResult(x, { key, scores: (st.sheets || []).filter(sh => sh.status === "done").map(sh => ({ id: sh.id, score: keyScore(key, sh.answers) })) });
      return;
    }
    setResult(x, { score: keyScore(st.key, x.answers) });
  }
  const keyScore = (key, answers) => { if (key.includes("?")) return null; let n = 0; for (let i = 0; i < key.length; i++) if (String(answers || "")[i] === key[i]) n++; return n; };

  // ---------- the school's server (through the Android app) ----------
  async function loadServer() {
    S.loading = true; S.error = ""; render();
    const r = await ask("get", { path: "api/scanner" }, 30000);
    S.loading = false;
    if (!r) { S.error = "Odin didn't answer. Check that this phone is on the school network, then try again."; return render(); }
    if (r.status === 401) { S.signedIn = false; S.needSignIn = true; return render(); }
    if (r.status !== 200) { S.error = r.status === 404 ? "This Odin is older than DI-ana needs (0.9.5 or newer). Ask IT to update Odin." : `Odin answered ${r.status}${r.error ? ": " + r.error : ""}.`; return render(); }
    try { useData(JSON.parse(r.body)); } catch (e) { S.error = "Odin's answer couldn't be read."; return render(); }
    S.signedIn = true; S.needSignIn = false;
    // sheets read before the sign-in ended still point at the old copies; point them at the new ones
    S.reads.forEach(x => { if (x.ok) { const e = S.byId.get(x.id); if (e) { x.rec = e.rec; x.cls = e.cls; } } });
    render();
  }
  async function signIn(pw) {
    S.error = ""; S.loading = true; render();
    const r = await ask("signin", { password: pw }, 30000);
    S.loading = false;
    if (!r || !r.ok) { S.error = (r && r.error) || "Odin didn't answer. Check that this phone is on the school network."; return render(); }
    await loadServer();
  }

  // ---------- the demo's sample sheets, to print and try ----------
  function demoSheets() {
    const c = S.data.classes.find(x => x.id === S.demo.cls);
    if (!c) return [];
    return c.sheets.filter(r => r.subject === S.demo.subj && (S.demo.which === "all" || (S.demo.which === "practice" ? r.kind === "practice" : r.kind === S.demo.which))).map(rec => ({ rec, cls: c }));
  }
  async function samplePdf() {
    const list = demoSheets();
    if (!list.length) { say("This class has no sheets of that kind this week."); return render(); }
    const c = list[0].cls, doc = new OdinPdf(`DI-ana demo · ${c.teacher} · ${SUBJ[S.demo.subj]} · sample sheets`);
    list.forEach(({ rec, cls }) => shPdfSheetPage(doc, rec, cls, { names: S.names, week: weekLabel(rec.week) }));
    const name = `diana-demo-${c.id}-${S.demo.subj}-${S.demo.which}.pdf`;
    say(await savePdf(doc.bytes(), name, `Saved ${name} (${plural(list.length, "sheet")}). Print it on US Letter at 100% (actual size), fill in a few bubbles with a pencil, then scan them.`), "ok");
    render();
  }
  // A PDF to Android's print screen (print it, or save it as a PDF there), or saved as a file in a browser.
  async function savePdf(bytes, name, saved) {
    if (BRIDGE) {
      let b = ""; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await ask("printpdf", { name, b64: btoa(b) }, 15000);
      return r && r.ok ? "Android's print screen is open: print the sheets on US Letter at 100%, or save them as a PDF." : "Android's print screen didn't open.";
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return saved;
  }
  async function pretend() {
    const list = demoSheets().filter(x => x.rec.status !== "done").slice(0, 5);
    if (!list.length) { say("All of these sheets already have results. Pick another class or kind."); return render(); }
    say("Making pretend pictures…"); render();
    for (let i = 0; i < list.length; i++) {
      await new Promise(r => setTimeout(r, 10));
      const { rec } = list[i], sp = specFor(rec.id), R = seeded("pretend|" + rec.id), good = 0.55 + R() * 0.4;
      let ans = sp.items.map(it => (R() < good ? SH_LETTERS[it.key] : SH_LETTERS[(it.key + 1 + Math.floor(R() * (it.choices.length - 1))) % it.choices.length])).join("");
      if (i === 1) ans = ans.slice(0, 2) + "*" + ans.slice(3);
      const img = scSynth(sp, ans, { seed: i, upsideDown: i === 2, angle: i === 3 ? 3 : undefined });
      addRead(scReadPage(img, lookup), img, "pretend", `pretend picture ${i + 1}`);
    }
    say(`Read ${plural(list.length, "pretend picture")} of ${SUBJ[S.demo.subj].toLowerCase()} sheets, as if from the camera. One has two bubbles filled on a question: check it, then press Save.`, "ok");
    render();
  }

  // ---------- the page ----------
  function say(t, kind) { S.msg = t; S.msgKind = kind || ""; }
  const LOGO = `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="var(--accent)"/><rect x="9.5" y="6.5" width="15" height="21" rx="2" fill="#fff"/><g fill="var(--accent)"><rect x="11" y="8" width="3" height="3"/><rect x="20" y="8" width="3" height="3"/><rect x="11" y="23" width="3" height="3"/><rect x="20" y="23" width="3" height="3"/><circle cx="14.5" cy="17" r="1.6"/><circle cx="19.5" cy="17" r="1.6" fill="none" stroke="var(--accent)" stroke-width=".9"/></g></svg>`;
  function render() {
    const root = $("#app");
    if (!root) return;
    const counts = { ready: 0, check: 0, replace: 0, sent: 0, unread: 0, error: 0 };
    S.reads.forEach(x => { counts[x.status] = (counts[x.status] || 0) + 1; });
    const demo = S.mode === "demo", ready = counts.ready;
    let body = "";
    if (!demo && (S.needSignIn || (!S.signedIn && !S.loading && !S.data))) body = signInPanel();
    else if (S.loading && !S.data) body = `<div class="panel"><p>Loading this week's sheets from Odin…</p></div>`;
    else body = viewTabs() + (S.view === "make" ? makeView() : scanPanel(counts, demo, ready) + (demo ? demoPanel() : ""));
    root.innerHTML = `<header class="top"><div class="wrap">
        <div class="brand">${LOGO}<div><h1>DI-ana</h1><div class="sub">Diagnostic testing and Intervention automatic analysis</div></div></div>
        ${demo ? `<span class="chip demo">Demo · invented students</span>` : `<span class="chip">${esc(S.server || "Odin")}${S.signedIn ? " · signed in" : ""}</span>`}
        <button class="btn ghost sm" data-a="tour" aria-haspopup="dialog">Walkthrough</button>
        <button class="switch" role="switch" aria-checked="${S.names}" data-a="names"><span class="k"></span>Names</button>
      </div></header>
      <p class="wrap tagline small muted">Reads Odin's paper pre-checks, practice sheets, post-checks, tests and worksheet answer sheets with the camera, and sends only the answers to Odin.</p>
      <main class="wrap">
        ${S.error ? `<div class="notice bad" role="alert"><b>${esc(S.error)}</b></div>` : ""}
        ${body}
        <p class="privacy">DI-ana reads each picture on this ${BRIDGE ? "phone" : "device"}. Pictures are never saved or sent: only the answers go to Odin, and only when you press Send. Nothing stays on the ${BRIDGE ? "phone" : "device"}: closing DI-ana clears this list. A worksheet's PDF is read here too and never sent. The AI is told only the grade, subject, skill and topic, never anything about a student.${demo ? " Every student in the demo is invented." : ""}</p>
        <p class="small muted">DI-ana ${esc(DIANA.version)}${S.appVersion ? ` · Android app ${esc(S.appVersion)}` : ""} · reads sheets with Odin ${esc(DIANA.odin.odinVersion)}'s scanner${S.data && S.data.version && !demo ? ` · this Odin is ${esc(S.data.version)}` : ""}${BRIDGE ? ` · <button class="btn ghost sm" data-a="setup">Change Odin's address or the demo</button>` : ""}</p>
      </main>${S.tour.open ? tourHTML() : ""}`;
    if (S.tour.open && S.tour.focus) { S.tour.focus = false; const h = $("#tour-h"); if (h) h.focus(); }
  }
  function signInPanel() {
    return `<form class="panel" id="signin" autocomplete="off">
      <h2>Sign in to Odin</h2>
      <p class="small">DI-ana uses Odin at <b>${esc(S.server)}</b>. Sign in with Odin's teacher password. DI-ana doesn't keep it: the sign-in ends when DI-ana closes or after Odin's idle time.</p>
      <label class="field">Odin's password<input type="password" id="pw" required autocomplete="current-password"></label>
      <div class="row"><button class="btn" type="submit" ${S.loading ? "disabled" : ""}>${S.loading ? "Signing in…" : "Sign in"}</button></div>
    </form>`;
  }
  function viewTabs() {
    return `<nav class="tabs" role="tablist" aria-label="DI-ana">${[["scan", "Scan sheets"], ["make", "Make tests and worksheets"]].map(([v, l]) => `<button role="tab" class="tab ${S.view === v ? "on" : ""}" aria-selected="${S.view === v}" data-a="view" data-v="${v}">${l}</button>`).join("")}</nav>`;
  }
  function scanPanel(counts, demo, ready) {
    const list = S.reads;
    return `<section class="panel" aria-labelledby="scan-h">
      <h2 id="scan-h">Scan sheets</h2>
      <p class="small muted">Pre-checks, practice 1 and 2, post-checks, and the tests and worksheet answer sheets made here, with their answer key sheets, in any order. Hold the phone over each sheet until it beeps, then the next. Sheets can be upside down or a little crooked.</p>
      <div class="grid2">
        <button class="btn big" data-a="camera"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Scan with the camera</button>
        <span class="btn ghost big upl">Choose photos or scans<input type="file" id="files" multiple accept="image/*,.pdf,application/pdf" aria-label="Choose photos or scanned files"></span>
      </div>
      ${S.msg ? `<div class="notice ${S.msgKind}" role="status"><b>${esc(S.msg)}</b></div>` : ""}
      ${list.length ? `<div class="counts"><span><b>${list.filter(x => x.ok).length}</b> read</span>${counts.ready ? `<span><b>${counts.ready}</b> ready</span>` : ""}${counts.check ? `<span><b>${counts.check}</b> to check</span>` : ""}${counts.replace ? `<span><b>${counts.replace}</b> already had a result</span>` : ""}${counts.sent ? `<span><b>${counts.sent}</b> ${demo ? "saved" : "sent"}</span>` : ""}${counts.unread + counts.error ? `<span><b>${counts.unread + counts.error}</b> not read</span>` : ""}</div>
        <div class="row"><button class="btn" data-a="send" ${ready && !S.sending ? "" : "disabled"}>${S.sending ? "Sending…" : demo ? `Save ${plural(ready, "sheet")}` : `Send ${plural(ready, "sheet")} to Odin`}</button>
          ${counts.check ? `<span class="small">Check ${plural(list.filter(x => x.status === "check").reduce((t, x) => t + x.open.length, 0), "answer")} first.</span>` : ""}
          <button class="btn ghost sm" data-a="clear">Clear the list</button></div>
        <div class="reads">${list.map(readCard).join("")}</div>` : ""}
    </section>`;
  }
  function readCard(x) {
    if (!x.ok) {
      const why = x.error || { marks: "Couldn't find the four black corner squares. Take the picture again with the whole sheet showing.", code: "Couldn't read the sheet number at the top.", unknown: S.mode === "demo" ? "This sheet number isn't in DI-ana's demo." : "This sheet number isn't in Odin (another school's, or deleted).", version: "This sheet was made by another version of Odin. Update DI-ana, then scan it again." }[x.reason] || "Not read.";
      return `<div class="read bad"><div class="top">${x.thumb ? `<img class="thumb" src="${x.thumb}" alt="">` : "<span></span>"}<div><div class="who">${esc(x.file || "Picture")}</div><div class="what">${esc(why)}</div></div><span class="st unread">Not read</span></div>
        ${x.img && (x.reason === "code" || x.reason === "unknown") ? `<div class="row typeid"><label class="small" for="tid-${x.key}">Sheet number printed at the top:</label><input id="tid-${x.key}" inputmode="numeric" maxlength="8"><button class="btn ghost sm" data-a="typeid" data-k="${x.key}">Read</button></div>` : ""}
        <div class="row"><button class="btn ghost sm" data-a="drop" data-k="${x.key}">Remove</button></div></div>`;
    }
    const sc = x.status === "sent" ? x.score : scoreOf(x), cls = x.status === "check" ? "check" : x.status === "error" ? "bad" : "";
    const st = { ready: S.mode === "demo" ? "Ready to save" : "Ready to send", check: `Check ${plural(x.open.length, "answer")}`, replace: x.isKey ? "Odin has another key" : "Already had a result", sent: S.mode === "demo" ? "Saved (demo)" : "Sent to Odin", error: "Not sent" }[x.status];
    return `<div class="read ${cls}" data-key="${x.key}"><div class="top">${x.thumb ? `<img class="thumb" src="${x.thumb}" alt="">` : "<span></span>"}
        <div><div class="who">${esc(whoRec(x.cls, x.rec))}</div><div class="what">${esc(sheetWhat(x.rec))} · week of ${esc(weekLabel(x.rec.week))} · sheet ${x.id}</div></div>
        <div><div class="score">${x.isKey ? "Key" : `${sc == null ? "–" : sc}/${x.spec.total}`}</div><span class="st ${x.status}">${esc(st)}</span></div></div>
      ${x.isKey ? `<p class="small">The key: <span class="mono">${esc(keyNorm(x.answers).split("").map((k, i) => `${i + 1}${k}`).join(" "))}</span>${x.status === "ready" ? `. ${S.mode === "demo" ? "Save" : "Send"} it with the students' sheets: they're scored with it.` : "."}</p>` : x.set && sc == null && x.status !== "check" ? `<p class="small muted">No score until the answer key is known: scan the answer key sheet, or tap it in under Make.</p>` : ""}
      ${x.note ? `<p class="small muted">${esc(x.note)}</p>` : ""}
      ${x.status === "error" ? `<p class="small" style="color:var(--bad)">${esc(x.error)}</p><div class="row"><button class="btn ghost sm" data-a="retry" data-k="${x.key}">Try again</button></div>` : ""}
      ${x.status === "replace" ? (x.isKey ? `<p class="small">Odin's key for this set is <span class="mono">${esc(x.set.key)}</span>. This sheet says <span class="mono">${esc(keyNorm(x.answers))}</span>.</p>`
        : `<p class="small">Odin already has ${x.rec.right != null ? `${x.rec.right}/${x.spec.total}` : "a result"}${x.rec.source ? ` (${SRC_WORD[x.rec.source] || x.rec.source}${x.rec.taken ? ", " + x.rec.taken : ""})` : ""} for this sheet.</p>`)
        + `<div class="row"><button class="btn sm" data-a="replace" data-k="${x.key}">${x.isKey ? "Use this key" : "Replace it with this one"}</button><button class="btn ghost sm" data-a="drop" data-k="${x.key}">Keep Odin's</button></div>` : ""}
      ${x.status === "check" ? x.open.map(o => reviewRow(x, o)).join("") : ""}
      ${x.status !== "sent" ? `<div class="row"><button class="btn ghost sm" data-a="drop" data-k="${x.key}">Remove</button></div>` : ""}
    </div>`;
  }
  function reviewRow(x, o) {
    const it = x.spec.items[o.item], cur = x.answers[o.item];
    return `<div class="rv"><span class="small"><b>Question ${o.item + 1}</b> · ${FLAG_WORDS[o.kind] || "Check"}</span>${o.pic ? `<img src="${o.pic}" alt="The bubbles for question ${o.item + 1}">` : ""}
      <div class="row" role="group" aria-label="Answer for question ${o.item + 1}">${it.choices.map((c, k) => `<button class="btn ${cur === SH_LETTERS[k] ? "" : "ghost"} sm" data-a="fix" data-k="${x.key}" data-q="${o.item}" data-v="${SH_LETTERS[k]}">${SH_LETTERS[k]}</button>`).join("")}<button class="btn ${cur === "-" ? "" : "ghost"} sm" data-a="fix" data-k="${x.key}" data-q="${o.item}" data-v="-">Blank</button></div></div>`;
  }
  function demoPanel() {
    const classes = S.data.classes.filter(c => c.sheets.length);
    const n = demoSheets().length;
    return `<section class="panel" aria-labelledby="demo-h">
      <h2 id="demo-h">Try it with the demo</h2>
      <p class="small">The demo has Odin's invented school with this week's sheets. Print some, fill in bubbles with a pencil, and scan them. Sheets printed from Odin's own demo have other numbers, so print these. Or try pretend pictures with no paper at all.</p>
      <div class="row">
        <label class="field">Class<select id="d-cls">${classes.map(c => `<option value="${esc(c.id)}" ${c.id === S.demo.cls ? "selected" : ""}>${esc(c.teacher)} · ${c.grade === 0 ? "K" : "Grade " + c.grade}</option>`).join("")}</select></label>
        <label class="field">Subject<select id="d-subj">${["math", "reading"].map(s => `<option value="${s}" ${s === S.demo.subj ? "selected" : ""}>${SUBJ[s]}</option>`).join("")}</select></label>
        <label class="field">Sheets<select id="d-which">${[["pre", "Pre-checks"], ["practice", "Practice 1 and 2"], ["post", "Post-checks"], ["all", "All four"]].map(([v, l]) => `<option value="${v}" ${v === S.demo.which ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="row"><button class="btn" data-a="samplepdf" ${n ? "" : "disabled"}>${BRIDGE ? "Print or save" : "Save"} ${plural(n, "sample sheet")} as PDF</button><button class="btn ghost" data-a="pretend" ${n ? "" : "disabled"}>Try pretend pictures</button></div>
    </section>`;
  }

  // =====================================================================================================
  // 0.2: making tests, practice sheets and worksheet answer sheets ("sets"). A worksheet's PDF is read here (pdf.js) to count
  // its questions and choices; students answer on Odin's answer sheet. A test or practice sheet is written by AI, then read
  // and changed by the teacher. Each set prints with an answer key sheet (filled in when the key is known; to fill in and
  // scan when it isn't) and one sheet per student. Odin keeps the set and scores the sheets.
  // =====================================================================================================
  const odinAtLeast = v => { const a = String((S.data && S.data.version) || "0").split(/[.-]/).map(Number), b = v.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; } return true; };
  const canMake = () => S.mode === "demo" || odinAtLeast("0.10.0");
  const allSets = () => (S.data ? S.data.classes.flatMap(c => (c.sets || []).map(st => ({ st, cls: c }))) : []).sort((a, b) => b.st.week.localeCompare(a.st.week) || b.st.id - a.st.id);
  const roster = () => (S.data ? S.data.classes.flatMap(c => c.students) : []);
  const mkNew = () => ({ step: "start", kind: "worksheet", title: "", subject: "", band: 3, file: "", pics: [], pages: 0, detected: null, n: 10, choices: Array(10).fill(4), key: "",
    skill: "", topic: "", qn: 6, qk: 4, passage: false, items: [], psg: null, warnings: [], busy: false, err: "", cls: null, codes: null, week: "", made: null, src: "" });
  const MK = () => S.make || (S.make = mkNew());

  // ---------- the AI: the school's Odin calls it (the key stays on Odin's server); in the demo this page calls it ----------
  const AIC = { provider: "ollama", url: "", model: "", key: "" };
  try { const c = JSON.parse(localStorage.getItem("diana.ai") || "null"); if (c && AI_BY_ID[c.provider]) Object.assign(AIC, { provider: c.provider, url: String(c.url || ""), model: String(c.model || "") }); } catch (e) {}
  const aiSaveLocal = () => { try { localStorage.setItem("diana.ai", JSON.stringify({ provider: AIC.provider, url: AIC.url, model: AIC.model })); } catch (e) {} };   // never the key
  const aiNow = () => { const P = AI_BY_ID[AIC.provider] || AI_BY_ID.custom; return { P, url: AIC.url || P.url, model: AIC.model || P.model }; };
  // In the Android app's demo, the app makes the call (the page itself reaches nothing but the app).
  const bridgeFetch = async (url, init) => {
    const r = await ask("ai", { url, headers: init.headers, body: init.body }, 200000);
    if (!r || !r.status) throw new TypeError((r && r.error) || "no answer");
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.body || "" };
  };
  async function aiAskD(prompt) {
    aiGuard([prompt.system, prompt.user], roster());
    if (S.mode === "server") {
      const r = await ask("post", { path: "api/ai/chat", body: { system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens } }, 200000);
      let j = {}; try { j = JSON.parse((r && r.body) || "{}"); } catch (e) {}
      if (!r) throw new Error("Odin didn't answer. Check that this phone is on the school network.");
      if (r.status === 401) { S.signedIn = false; S.needSignIn = true; throw new Error("Odin's sign-in ended: sign in again."); }
      if (r.status !== 200) throw new Error(j.error || (r.status === 404 ? "This Odin is older than 0.10.0 and has no AI." : "Odin answered " + r.status + "."));
      return j.text;
    }
    return aiChat(AIC, prompt, BRIDGE ? { fetch: bridgeFetch } : {});
  }
  async function aiLoadServer() {
    if (S.mode !== "server" || S.aiServer) return;
    S.aiServer = { loading: true };
    const r = await ask("get", { path: "api/ai/settings" }, 20000);
    try { S.aiServer = r && r.status === 200 ? JSON.parse(r.body) : { error: r && r.status === 404 ? "This Odin is older than 0.10.0 and has no AI." : "Couldn't read Odin's AI settings." }; } catch (e) { S.aiServer = { error: "Couldn't read Odin's AI settings." }; }
    render();
  }
  function aiSummary() {
    if (S.mode === "server") { const A = S.aiServer || {}; if (A.error) return A.error; if (A.off) return "AI is turned off on this Odin."; if (!A.set) return "No AI chosen in Odin yet."; const P = AI_BY_ID[A.provider] || AI_BY_ID.custom; return `${P.name}${A.model ? " · " + A.model : ""}`; }
    const { P, model } = aiNow(); return `${P.name}${model ? " · " + model : ""}${P.key === true && !AIC.key ? " · needs a key" : ""}`;
  }
  function aiPanel() {
    if (S.mode === "server") {
      aiLoadServer();
      return `<p class="small"><b>The AI:</b> ${esc(aiSummary())}. Odin's server keeps the key and makes the call, so this phone never holds it. To change it, use Odin's AI settings (Odin › Fluency › New passages › AI settings).</p>`;
    }
    const { P, url, model } = aiNow(), kinds = [["local", "On a computer at school (free, private)"], ["free", "Free tier (a free key, with daily limits)"], ["paid", "Paid (a key from the service)"], ["custom", "Other"]];
    return `<details class="aiset" ${S.aiOpen ? "open" : ""} id="ai-details"><summary class="small"><b>AI settings</b> · ${esc(aiSummary())}</summary>
      <label class="field">AI<select id="ai-provider">${kinds.map(([k, l]) => `<optgroup label="${esc(l)}">${AI_PROVIDERS.filter(p => p.kind === k).map(p => `<option value="${p.id}" ${p.id === P.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <p class="small muted">${esc(P.help)}${P.keyUrl ? ` <a href="${P.keyUrl}" target="_blank" rel="noopener">Get a key</a>.` : ""}</p>
      <label class="field">Address<input id="ai-url" value="${esc(url)}" spellcheck="false" autocapitalize="off"></label>
      <label class="field">Model<input id="ai-model" value="${esc(model)}" spellcheck="false" autocapitalize="off"></label>
      ${P.key ? `<label class="field">Key<input id="ai-key" type="password" autocomplete="off" value="${esc(AIC.key)}" placeholder="kept only while DI-ana is open"></label>` : ""}
      <p class="small muted">In the demo, DI-ana calls the AI itself, and a key you type is kept only while DI-ana is open: it's never saved. At school, Odin's server calls it and keeps the key.${BRIDGE ? " In the app, the AI's address must start with https://." : ""}</p>
      <div class="row"><button class="btn sm" data-a="aisave">Use these settings</button><button class="btn ghost sm" data-a="aitest" ${S.aiBusy ? "disabled" : ""}>Test it</button></div>
      ${S.aiMsg ? `<p class="small ${S.aiOk === false ? "warnx" : ""}" role="status">${esc(S.aiMsg)}</p>` : ""}
    </details>`;
  }
  function aiReadForm() {
    const d = $("#ai-details"); if (d) S.aiOpen = d.open;   // kept open (or closed) when the page is drawn again
    const v = id => { const el = $("#" + id); return el ? el.value.trim() : null; };
    const p = v("ai-provider"); if (p && AI_BY_ID[p]) AIC.provider = p;
    const u = v("ai-url"), m = v("ai-model"), k = v("ai-key");
    if (u != null) AIC.url = u; if (m != null) AIC.model = m; if (k != null) AIC.key = k;
  }

  // ---------- the steps ----------
  function makeView() {
    if (!S.data) return "";
    if (!canMake()) return `<section class="panel"><h2>Make tests and worksheets</h2><p>This needs Odin 0.10.0 or newer on the school's server (this one is ${esc(S.data.version || "older")}). Ask IT to update Odin.</p></section>`;
    if (S.keyEdit != null) return keyEditor();
    const M = MK();
    const step = { start: mkStart, sheet: mkSheet, ai: mkAi, review: mkReview, who: mkWho, done: mkDone }[M.step] || mkStart;
    return `${M.err ? `<div class="notice bad" role="alert"><b>${esc(M.err)}</b></div>` : ""}${step(M)}`;
  }
  function mkStart(M) {
    const list = allSets();
    return `<section class="panel" aria-labelledby="mk-h">
      <h2 id="mk-h">Make tests and worksheets</h2>
      <p class="small">Each prints with an answer key sheet and a sheet for each student, with Odin's black squares, so DI-ana scans and scores them like Odin's own sheets.</p>
      <div class="choices">
        <label class="choice"><b>A worksheet's PDF</b><span class="small muted">DI-ana counts its questions and choices. Students answer on an answer sheet; you bubble in the key on the answer key sheet.</span><span class="btn ghost sm upl">Choose the PDF<input type="file" id="mk-file" accept=".pdf,application/pdf" aria-label="Choose the worksheet's PDF"></span></label>
        <button class="choice" data-a="mkcount"><b>Any worksheet</b><span class="small muted">An answer sheet for a worksheet on paper or in a book: type how many questions it has.</span></button>
        <button class="choice" data-a="mkai"><b>A test or practice sheet, written with AI</b><span class="small muted">Pick the grade, skill and topic. You read and change every question before printing.</span></button>
      </div>
      ${M.busy ? `<p class="small" role="status">Reading the PDF…</p>` : ""}
    </section>
    <section class="panel" aria-labelledby="sets-h"><h2 id="sets-h">Tests and worksheets</h2>
      ${list.length ? list.map(({ st, cls }) => setCard(st, cls)).join("") : `<p class="small muted">None yet.${S.mode === "demo" ? " In the demo, what you make is kept only while DI-ana is open." : ""}</p>`}
    </section>`;
  }
  function setCard(st, cls) {
    const done = (st.sheets || []).filter(x => x.status === "done"), scored = done.filter(x => x.right != null), unknown = st.key.includes("?");
    const avg = scored.length ? Math.round(scored.reduce((t, x) => t + (100 * x.right) / st.total, 0) / scored.length) : null;
    return `<div class="set"><div class="top"><div><div class="who">${esc(st.title)}</div><div class="what">${SET_WORD[st.kind] || st.kind} · ${plural(st.total, "question")} · ${esc(cls.teacher)} · week of ${esc(weekLabel(st.week))}</div></div>
        <div class="small">${done.length} of ${st.sheets.length} done${avg != null ? ` · average ${avg}%` : ""}</div></div>
      <p class="small">${unknown ? `<b>The answer key isn't known yet.</b> Fill in the bubbles on the answer key sheet (sheet ${st.keySheet}) and scan it with the students' sheets, or tap it in.` : `Answer key: <span class="mono">${esc(st.key)}</span>`}</p>
      <div class="row"><button class="btn sm" data-a="mkprint" data-id="${st.id}" data-c="${esc(cls.id)}">${BRIDGE ? "Print or save" : "Save"} the sheets as PDF</button>
        <button class="btn ghost sm" data-a="mkkey" data-id="${st.id}" data-c="${esc(cls.id)}">${unknown ? "Tap in the key" : "Change the key"}</button>
        ${S.setDel === st.id ? `<button class="btn sm danger" data-a="mkdelyes" data-id="${st.id}" data-c="${esc(cls.id)}">Delete it and its ${plural(done.length, "result")}</button><button class="btn ghost sm" data-a="mkdelno">Keep it</button>` : `<button class="btn ghost sm" data-a="mkdel" data-id="${st.id}">Delete</button>`}</div></div>`;
  }
  const bandSelect = (id, v) => `<select id="${id}">${[0, 1, 2, 3, 4, 5].map(b => `<option value="${b}" ${b === v ? "selected" : ""}>${b === 0 ? "Kindergarten" : "Grade " + b}</option>`).join("")}</select>`;
  function mkSheet(M) {
    const d = M.detected;
    return `<section class="panel" aria-labelledby="mk-h"><h2 id="mk-h">Answer sheet for a worksheet</h2>
      ${M.file ? `<p class="small"><b>${esc(M.file)}</b> · ${plural(M.pages, "page")}${d ? ` · ${d.n ? `found ${plural(d.n, "numbered question")}${d.found.some(f => !f) ? `; choices seen for ${d.found.filter(Boolean).length}` : ""}${d.key.length ? ", and its answer key" : ""}` : "no numbered questions found: type how many there are"}` : ""}. Check the numbers below against the worksheet.</p>` : `<p class="small">Type how many questions the worksheet has and how many choices each one has.</p>`}
      ${M.pics.length ? `<div class="pics">${M.pics.map((u, i) => `<img src="${u}" alt="Page ${i + 1} of the worksheet">`).join("")}</div>` : ""}
      <label class="field">Title<input id="mk-title" maxlength="80" value="${esc(M.title)}"></label>
      <div class="row"><label class="field">Questions<input id="mk-n" type="number" min="1" max="60" value="${M.n}"></label>
        <label class="field">Choices for every question<select id="mk-all"><option value="">—</option>${[2, 3, 4, 5].map(k => `<option value="${k}">${k} (${SH_LETTERS.slice(0, k).split("").join(", ")})</option>`).join("")}</select></label>
        <label class="field">Subject<select id="mk-subj"><option value="">Any</option>${["math", "reading"].map(x => `<option value="${x}" ${M.subject === x ? "selected" : ""}>${SUBJ[x]}</option>`).join("")}</select></label>
        <label class="field">Level${bandSelect("mk-band", M.band)}</label></div>
      <p class="small muted">How many choices each question has (A to E):</p>
      <div class="qgrid">${M.choices.slice(0, M.n).map((k, i) => `<label class="small"><b>${i + 1}</b><select id="mk-c${i}" aria-label="Choices for question ${i + 1}">${[2, 3, 4, 5].map(v => `<option ${v === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>`).join("")}</div>
      ${M.key && M.key.replace(/\?/g, "") ? `<label class="check"><input type="checkbox" id="mk-usekey" ${M.useKey !== false ? "checked" : ""}> Use the worksheet's own answer key: <span class="mono">${esc(M.key)}</span></label><p class="small muted">Check it against the worksheet. You can change it later (Change the key), or fill in the answer key sheet and scan it.</p>` : ""}
      <div class="row"><button class="btn ghost" data-a="mkback">Back</button><button class="btn" data-a="mknext">Next: who gets it</button></div>
    </section>`;
  }
  function mkAi(M) {
    const subj = M.subject || "reading", skills = ladderFor(subj, Math.max(0, Math.min(5, M.band)));
    return `<section class="panel" aria-labelledby="mk-h"><h2 id="mk-h">A test or practice sheet, written with AI</h2>
      <p class="small">The AI is told only the grade, subject, skill and your topic, never anything about a student, and DI-ana won't send a topic with a student's name or code in it. You read and change every question next.</p>
      ${aiPanel()}
      <div class="row"><label class="field">Kind<select id="mk-kind"><option value="test" ${M.kind === "test" ? "selected" : ""}>Test</option><option value="practice" ${M.kind === "practice" ? "selected" : ""}>Practice sheet (with hints)</option></select></label>
        <label class="field">Subject<select id="mk-subj">${["math", "reading"].map(x => `<option value="${x}" ${subj === x ? "selected" : ""}>${SUBJ[x]}</option>`).join("")}</select></label>
        <label class="field">Level${bandSelect("mk-band", M.band)}</label></div>
      <div class="row"><label class="field">Skill<select id="mk-skill">${skills.map(r => `<option value="${esc(r.name)}" ${M.skill === r.name ? "selected" : ""}>${esc(r.name)}</option>`).join("")}<option value="" ${M.skill && !skills.some(r => r.name === M.skill) ? "selected" : ""}>Other: the topic says it</option></select></label>
        <label class="field">Topic<input id="mk-topic" maxlength="120" value="${esc(M.topic)}" placeholder="${subj === "math" ? "word problems about a school store" : "ocean animals"}"></label></div>
      <div class="row"><label class="field">Questions<select id="mk-qn">${[4, 5, 6, 7, 8].map(n => `<option ${n === M.qn ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="field">Choices<select id="mk-qk">${[3, 4].map(n => `<option ${n === M.qk ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" id="mk-psg" ${M.passage ? "checked" : ""}> With a short ${subj === "math" ? "story" : "passage"} to read (up to 6 questions)</label></div>
      <div class="row"><button class="btn ghost" data-a="mkback">Back</button><button class="btn" data-a="mkwrite" ${M.busy ? "disabled" : ""}>${M.busy ? "Writing… (a model on a school computer can take a minute)" : "Write it with AI"}</button></div>
    </section>`;
  }
  function mkReview(M) {
    const hints = M.kind === "practice" && !M.psg, over = mkOverflow(M);   // a sheet with a passage has no room for hints, as in Odin
    return `<section class="panel" aria-labelledby="mk-h"><h2 id="mk-h">Read and change the questions</h2>
      <p class="small">${M.src ? `Written by ${esc(M.src)}. ` : ""}Check every question, its choices and its right answer: the AI can be wrong.${M.kind === "practice" && M.psg ? " A sheet with a passage has no hints." : ""}</p>
      ${M.warnings.length ? `<ul class="small">${M.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      <label class="field">Title<input id="mk-title" maxlength="80" value="${esc(M.title)}"></label>
      ${M.psg ? `<fieldset class="q"><legend>The ${M.subject === "math" ? "story" : "passage"}</legend><label class="field">Title<input id="mk-ptitle" maxlength="80" value="${esc(M.psg.title)}"></label><textarea id="mk-ptext" rows="7">${esc(M.psg.text)}</textarea><button class="btn ghost sm" data-a="mknopsg">Leave the passage out</button></fieldset>` : ""}
      ${M.items.map((it, i) => `<fieldset class="q"><legend>Question ${i + 1}</legend>
        <textarea id="q${i}-stem" rows="2" aria-label="Question ${i + 1}">${esc(it.stem)}</textarea>
        <div class="opts">${it.choices.map((c, k) => `<label class="opt"><input type="radio" name="q${i}-key" value="${k}" ${it.key === k ? "checked" : ""} aria-label="${SH_LETTERS[k]} is the right answer"><b>${SH_LETTERS[k]}</b><input id="q${i}-c${k}" value="${esc(c)}" aria-label="Choice ${SH_LETTERS[k]}"></label>`).join("")}</div>
        ${hints ? `<label class="field small">Hint<input id="q${i}-hint" maxlength="120" value="${esc(it.hint || "")}"></label>` : ""}
        <div class="row"><span class="small muted">The dot marks the right answer.</span><button class="btn ghost sm" data-a="mkdelq" data-i="${i}">Remove this question</button></div></fieldset>`).join("")}
      ${over.length ? `<div class="notice bad"><b>${esc(over.join(" "))}</b></div>` : ""}
      <div class="row"><button class="btn ghost sm" data-a="mkaddq" ${M.items.length >= (M.psg ? 6 : 8) ? "disabled" : ""}>Add a question</button><button class="btn ghost sm" data-a="mkwrite" ${M.busy ? "disabled" : ""}>${M.busy ? "Writing…" : "Write it again"}</button></div>
      <div class="row"><button class="btn ghost" data-a="mkback">Back</button><button class="btn" data-a="mknext" ${over.length || !M.items.length ? "disabled" : ""}>Next: who gets it</button></div>
    </section>`;
  }
  // Does it fit on one page? Odin's layout says, the same one that prints it.
  function mkOverflow(M) {
    if (!M.items.length) return ["Add at least one question."];
    try {
      const sp = shBuildSetSheet({ id: 1, code: "", kind: "set", band: M.band, key: M.items.map(it => SH_LETTERS[it.key] || "?").join(""), custom: { setKind: M.kind, title: M.title, items: M.items, passage: M.psg || undefined } });
      const o = sp.layout.overflow;
      if (!o.length) return [];
      return [o.includes("passage") ? "It doesn't fit on one page: shorten the passage or the questions, or remove a question." : `It doesn't fit on one page: shorten question${o.length > 1 ? "s" : ""} ${o.join(", ")}.`];
    } catch (e) { return ["It couldn't be laid out: " + (e.message || e)]; }
  }
  function mkWho(M) {
    const classes = S.data.classes, c = classes.find(x => x.id === (M.cls || S.demo.cls)) || classes[0];
    if (!M.cls || M.cls !== c.id) { M.cls = c.id; M.codes = new Set(c.students.map(s => s.code)); }
    return `<section class="panel" aria-labelledby="mk-h"><h2 id="mk-h">Who gets it</h2>
      <div class="row"><label class="field">Class<select id="mk-cls">${classes.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? "selected" : ""}>${esc(x.teacher)} · ${x.grade === 0 ? "K" : "Grade " + x.grade} · Room ${esc(x.room)}</option>`).join("")}</select></label>
        <div class="row"><button class="btn ghost sm" data-a="mkall">Everyone</button><button class="btn ghost sm" data-a="mknone">No one</button></div></div>
      <div class="who-list">${c.students.map(s => `<label class="check"><input type="checkbox" data-code="${esc(s.code)}" class="mk-st" ${M.codes.has(s.code) ? "checked" : ""}> ${esc(S.names ? s.name : s.code)}</label>`).join("")}</div>
      <p class="small">${esc(SET_WORD[M.kind])} · <b>${esc(M.title || "Untitled")}</b> · ${plural(M.kind === "worksheet" ? M.n : M.items.length, "question")} · an answer key sheet and ${plural(M.codes.size, "student sheet")}.${S.names ? "" : " Sheets print with student codes; turn on Names to print names."}</p>
      <div class="row"><button class="btn ghost" data-a="mkback">Back</button><button class="btn" data-a="mkmake" ${M.codes.size && !M.busy ? "" : "disabled"}>${M.busy ? "Making…" : S.mode === "demo" ? "Make the sheets" : "Make the sheets in Odin"}</button></div>
    </section>`;
  }
  function mkDone(M) {
    const st = M.made && M.made.st, unknown = st && st.key.includes("?");
    if (!st) return mkStart(M);
    return `<section class="panel" aria-labelledby="mk-h"><h2 id="mk-h">Made: ${esc(st.title)}</h2>
      <p>An answer key sheet (sheet ${st.keySheet}) and ${plural(st.sheets.length, "student sheet")}${S.mode === "demo" ? ", in the demo" : ", in Odin"}.</p>
      <ol class="small steps">
        <li>${BRIDGE ? "Print the sheets (or save them as a PDF)" : "Save the sheets as a PDF and print it"} on US Letter at 100% (actual size).${st.kind === "worksheet" ? " Hand out the worksheet itself as usual: students mark their answers on the answer sheet." : ""}</li>
        <li>${unknown ? "Fill in the right answers on the answer key sheet with a pencil, or tap them in here." : "The answer key sheet has the right answers filled in: keep it, or scan it with the students' sheets."}</li>
        <li>Scan the students' sheets${unknown ? " and the answer key sheet" : ""} under <b>Scan sheets</b>, then ${S.mode === "demo" ? "Save" : "Send"}.</li></ol>
      <div class="row"><button class="btn" data-a="mkprint" data-id="${st.id}" data-c="${esc(M.made.cls.id)}">${BRIDGE ? "Print or save" : "Save"} the sheets as PDF</button>
        ${unknown ? `<button class="btn ghost" data-a="mkkey" data-id="${st.id}" data-c="${esc(M.made.cls.id)}">Tap in the key</button>` : ""}
        <button class="btn ghost" data-a="view" data-v="scan">Scan sheets</button><button class="btn ghost" data-a="mknew">Make another</button></div>
    </section>`;
  }
  // The key, tapped in: one row of letter buttons per question.
  function keyEditor() {
    const f = allSets().find(x => x.st.id === S.keyEdit.id && x.cls.id === S.keyEdit.cls);
    if (!f) { S.keyEdit = null; return makeView(); }
    const { st } = f, key = S.keyEdit.key, counts = setCounts(st);
    return `<section class="panel" aria-labelledby="key-h"><h2 id="key-h">Answer key · ${esc(st.title)}</h2>
      <p class="small">Tap the right answer to each question. ${st.sheets.some(x => x.status === "done") ? "Sheets already scanned are scored again with it." : ""}</p>
      <div class="keyrows">${counts.map((n, i) => `<div class="keyrow" role="group" aria-label="Question ${i + 1}"><b>${i + 1}</b>${SH_LETTERS.slice(0, n).split("").map(L => `<button class="btn sm ${key[i] === L ? "" : "ghost"}" data-a="keypick" data-q="${i}" data-v="${L}" aria-pressed="${key[i] === L}">${L}</button>`).join("")}</div>`).join("")}</div>
      <div class="row"><button class="btn ghost" data-a="keyclose">Cancel</button><button class="btn" data-a="keysave" ${key.includes("?") ? "disabled" : ""}>${key.includes("?") ? `Pick ${plural(key.split("?").length - 1, "more answer")}` : "Save the key"}</button></div>
    </section>`;
  }
  const setCounts = st => (st.content.answers ? st.content.answers : st.content.items.map(it => it.choices.length));

  // ---------- doing each step ----------
  function mkRead() {
    const M = MK(), v = id => { const el = $("#" + id); return el ? el.value : null; };
    const d = $("#ai-details"); if (d) S.aiOpen = d.open;
    if (v("mk-title") != null) M.title = v("mk-title").trim();
    if (v("mk-subj") != null) M.subject = v("mk-subj");
    if (v("mk-band") != null) M.band = Number(v("mk-band"));
    if (v("mk-kind") != null) M.kind = v("mk-kind");
    if (v("mk-skill") != null) M.skill = v("mk-skill");
    if (v("mk-topic") != null) M.topic = v("mk-topic").trim();
    if (v("mk-qn") != null) M.qn = Number(v("mk-qn"));
    if (v("mk-qk") != null) M.qk = Number(v("mk-qk"));
    if ($("#mk-psg")) M.passage = $("#mk-psg").checked;
    if ($("#mk-usekey")) M.useKey = $("#mk-usekey").checked;
    if (M.step === "sheet") {
      M.choices = M.choices.map((k, i) => (v("mk-c" + i) != null ? Number(v("mk-c" + i)) : k));
      const n = Math.max(1, Math.min(60, Number(v("mk-n")) || M.n));
      while (M.choices.length < n) M.choices.push(M.choices[M.choices.length - 1] || 4);
      M.n = n;
    }
    if (M.step === "review") {
      if (M.psg && v("mk-ptext") != null) M.psg = { title: v("mk-ptitle").trim(), text: v("mk-ptext") };
      M.items = M.items.map((it, i) => {
        const key = $(`input[name="q${i}-key"]:checked`);
        return { stem: (v(`q${i}-stem`) || "").trim(), choices: it.choices.map((c, k) => (v(`q${i}-c${k}`) != null ? v(`q${i}-c${k}`).trim() : c)), key: key ? Number(key.value) : it.key, hint: v(`q${i}-hint`) != null ? v(`q${i}-hint`).trim() : it.hint };
      });
    }
    return M;
  }
  async function mkReadPdf(file) {
    const M = S.make = mkNew();
    M.busy = true; M.kind = "worksheet"; M.file = file.name; M.title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 80); render();
    try {
      const r = await wsReadPdf(new Uint8Array(await file.arrayBuffer()));
      const d = wsDetect(r.lines);
      Object.assign(M, { pics: r.pics, pages: r.pages, detected: d, n: d.n || 10, choices: d.n ? d.choices.slice() : Array(10).fill(4), key: d.key.length ? d.key.map(k => k || "?").join("") : "" });
      M.step = "sheet";
    } catch (e) { M.err = `Couldn't read ${file.name}: ${e.message || e}. Type how many questions it has instead.`; M.step = "sheet"; M.file = ""; }
    M.busy = false; render();
  }
  async function mkWrite() {
    const M = mkRead(); M.err = ""; M.busy = true; render();
    try {
      const o = { subject: M.subject || "reading", band: M.band, skill: M.skill || M.topic || "the topic", topic: M.topic, n: M.passage ? Math.min(6, M.qn) : M.qn, choices: M.qk, kind: M.kind, passage: M.passage };
      if (!M.skill && !M.topic) throw new Error("Type a topic, or pick a skill.");
      const t = await aiAskD(aiPromptQuestions(o)), q = aiParseQuestions(t, o);
      Object.assign(M, { items: q.items, psg: q.passage, warnings: q.warnings, title: M.title && M.step === "review" ? M.title : q.title, subject: o.subject, src: aiSummary(), step: "review" });
    } catch (e) { M.err = String(e.message || e); }
    M.busy = false; render(); window.scrollTo({ top: 0 });
  }
  function mkNext() {
    const M = mkRead(); M.err = "";
    if (M.step === "sheet") { if (!M.title) { M.err = "Give it a title."; return render(); } M.step = "who"; }
    else if (M.step === "review") {
      const bad = M.items.findIndex(it => !it.stem || it.choices.filter(Boolean).length < 2 || !it.choices[it.key]);
      if (bad >= 0) { M.err = `Question ${bad + 1} needs the question, at least two choices and its right answer.`; return render(); }
      M.items = M.items.map(it => { const ch = it.choices.filter(Boolean), k = ch.indexOf(it.choices[it.key]); return Object.assign({}, it, { choices: ch, key: k }); });
      if (!M.title) { M.err = "Give it a title."; return render(); }
      M.step = "who";
    }
    render(); window.scrollTo({ top: 0 });
  }
  async function mkMake() {
    const M = mkRead(), c = S.data.classes.find(x => x.id === M.cls), codes = c.students.map(s => s.code).filter(k => M.codes.has(k));
    const ws = M.kind === "worksheet", content = ws ? { answers: M.choices.slice(0, M.n) } : Object.assign({ items: M.items.map(it => ({ stem: it.stem, choices: it.choices, hint: M.kind === "practice" ? it.hint || "" : "" })) }, M.psg && M.psg.text.trim() ? { passage: { title: M.psg.title, text: M.psg.text.trim() } } : {});
    let key = ws ? (M.key && M.useKey !== false && M.key.length === M.n ? M.key : "?".repeat(M.n)) : M.items.map(it => SH_LETTERS[it.key]).join("");
    if (ws) key = key.split("").map((k, i) => (k !== "?" && SH_LETTERS.indexOf(k) < M.choices[i] ? k : "?")).join("");
    const body = { classId: c.id, kind: M.kind, title: M.title, subject: M.subject || "", band: M.band, week: mondayOf(S.today), content, key, codes, source: (ws ? (M.file ? "PDF: " + M.file : "typed in") : "AI: " + M.src).slice(0, 120) };
    M.busy = true; M.err = ""; render();
    let st;
    if (S.mode === "demo") {
      let top = 100000; S.byId.forEach((_, id) => { if (id > top) top = id; });
      const sid = 1 + allSets().reduce((m, x) => Math.max(m, x.st.id), 0);
      st = { id: sid, kind: body.kind, title: body.title, subject: body.subject, band: body.band, week: body.week, total: ws ? M.n : M.items.length, content, key, keySheet: top + 1, source: body.source, sheets: codes.map((code, i) => ({ id: top + 2 + i, code, status: "ready", right: null })) };
    } else {
      const r = await ask("post", { path: "api/sets", body }, 30000);
      let j = {}; try { j = JSON.parse((r && r.body) || "{}"); } catch (e) {}
      if (!r || r.status !== 200) { M.busy = false; M.err = r && r.status === 401 ? "Odin's sign-in ended: sign in again." : j.error || (r ? "Odin answered " + r.status : "Odin didn't answer."); if (r && r.status === 401) { S.signedIn = false; S.needSignIn = true; } return render(); }
      st = { id: j.id, kind: body.kind, title: body.title, subject: body.subject, band: body.band, week: body.week, total: ws ? M.n : M.items.length, content, key, keySheet: j.keySheet, source: body.source, sheets: j.sheets.map(x => ({ id: x.id, code: x.code, status: "ready", right: null })) };
    }
    c.sets = c.sets || []; c.sets.push(st); addSetRecs(st, c);
    M.busy = false; M.made = { st, cls: c }; M.step = "done"; render(); window.scrollTo({ top: 0 });
  }
  async function mkPrint(st, cls) {
    const doc = new OdinPdf(`DI-ana · ${st.title} · ${cls.teacher}`);
    shSetRecs(st).forEach(rec => shPdfSheetPage(doc, rec, cls, { names: S.names, week: weekLabel(rec.week) }));
    const name = `diana-${S.mode === "demo" ? "demo-" : ""}set-${st.id}.pdf`;
    say(await savePdf(doc.bytes(), name, `Saved ${name}: the answer key sheet and ${plural(st.sheets.length, "student sheet")}. Print it on US Letter at 100% (actual size).${S.names && S.mode === "server" ? " It has students' names on it: delete it once the sheets are printed." : ""}`), "ok");
    render();
  }
  async function keySave() {
    const K = S.keyEdit, f = allSets().find(x => x.st.id === K.id && x.cls.id === K.cls);
    if (!f) return;
    if (S.mode === "demo") {
      setKey(f.st, K.key);
      f.st.sheets.filter(x => x.status === "done").forEach(x => { x.right = keyScore(K.key, x.answers); const e = S.byId.get(x.id); if (e) e.rec.right = x.right; });
    } else {
      const r = await ask("post", { path: "api/sets/key", body: { classId: f.cls.id, id: f.st.id, key: K.key } }, 30000);
      let j = {}; try { j = JSON.parse((r && r.body) || "{}"); } catch (e) {}
      if (!r || r.status !== 200) { say(j.error || "Odin didn't take the key.", "bad"); return render(); }
      setKey(f.st, j.key); (j.scores || []).forEach(o => { const sh = setSheet(f.st, o.id), e = S.byId.get(o.id); if (sh) sh.right = o.score; if (e) e.rec.right = o.score; });
    }
    S.keyEdit = null; say(`The key for ${f.st.title} is saved.${f.st.sheets.some(x => x.status === "done") ? " The sheets already scanned are scored with it." : ""}`, "ok"); render();
  }
  async function mkDelete(id, cid) {
    const c = S.data.classes.find(x => x.id === cid);
    if (S.mode === "server") {
      const r = await ask("post", { path: "api/sets/delete", body: { classId: cid, id } }, 30000);
      if (!r || r.status !== 200) { say("Odin didn't delete it.", "bad"); return render(); }
    }
    const st = c.sets.find(x => x.id === id);
    c.sets = c.sets.filter(x => x.id !== id);
    S.byId.forEach((e, k) => { if (e.set === st) S.byId.delete(k); });
    S.setDel = null; say(`Deleted ${st.title}.`, "ok"); render();
  }
  function mkClick(a, t) {
    const M = MK();
    if (a === "view") { if (M.step !== "done") mkRead(); S.view = t.dataset.v; S.keyEdit = null; say(""); render(); window.scrollTo({ top: 0 }); return true; }
    if (a === "mkcount") { S.make = Object.assign(mkNew(), { step: "sheet" }); render(); return true; }
    if (a === "mkai") { S.make = Object.assign(mkNew(), { step: "ai", kind: "test", subject: "reading" }); render(); return true; }
    if (a === "mkback") { mkRead(); M.err = ""; M.step = { sheet: "start", ai: "start", review: "ai", who: M.kind === "worksheet" ? "sheet" : "review" }[M.step] || "start"; render(); return true; }
    if (a === "mknext") { mkNext(); return true; }
    if (a === "mkwrite") { mkWrite(); return true; }
    if (a === "mkaddq") { mkRead(); M.items.push({ stem: "", choices: Array(M.qk || 4).fill(""), key: 0, hint: "" }); render(); return true; }
    if (a === "mkdelq") { mkRead(); M.items.splice(Number(t.dataset.i), 1); render(); return true; }
    if (a === "mknopsg") { mkRead(); M.psg = null; render(); return true; }
    if (a === "mkall" || a === "mknone") { const c = S.data.classes.find(x => x.id === M.cls); M.codes = new Set(a === "mkall" ? c.students.map(s => s.code) : []); render(); return true; }
    if (a === "mkmake") { mkMake(); return true; }
    if (a === "mknew") { S.make = mkNew(); render(); return true; }
    if (a === "mkprint" || a === "mkkey") {
      const f = allSets().find(x => x.st.id === Number(t.dataset.id) && x.cls.id === t.dataset.c);
      if (!f) return true;
      if (a === "mkprint") mkPrint(f.st, f.cls);
      else { S.keyEdit = { id: f.st.id, cls: f.cls.id, key: f.st.key }; S.view = "make"; render(); window.scrollTo({ top: 0 }); }
      return true;
    }
    if (a === "keypick") { const q = Number(t.dataset.q); S.keyEdit.key = S.keyEdit.key.slice(0, q) + t.dataset.v + S.keyEdit.key.slice(q + 1); render(); return true; }
    if (a === "keysave") { keySave(); return true; }
    if (a === "keyclose") { S.keyEdit = null; render(); return true; }
    if (a === "mkdel") { S.setDel = Number(t.dataset.id); render(); return true; }
    if (a === "mkdelno") { S.setDel = null; render(); return true; }
    if (a === "mkdelyes") { mkDelete(Number(t.dataset.id), t.dataset.c); return true; }
    if (a === "aisave") { aiReadForm(); aiSaveLocal(); S.aiMsg = "DI-ana uses " + aiSummary() + "."; S.aiOk = true; render(); return true; }
    if (a === "aitest") {
      aiReadForm(); S.aiBusy = true; S.aiMsg = "Asking the AI…"; S.aiOk = null; render();
      aiAskD({ system: AI_SYSTEM, user: 'Reply with this JSON and nothing else: {"ok": true}', maxTokens: 60 }).then(t => { aiJSON(t); S.aiMsg = "It works: the AI answered."; S.aiOk = true; })
        .catch(e => { S.aiMsg = String(e.message || e); S.aiOk = false; }).finally(() => { S.aiBusy = false; render(); });
      return true;
    }
    return false;
  }
  function mkChange(t) {
    if (t.id === "mk-file" && t.files && t.files.length) { const f = t.files[0]; t.value = ""; mkReadPdf(f); return true; }
    if (t.id === "mk-all" && t.value) { mkRead(); const M = MK(); M.choices = M.choices.map(() => Number(t.value)); render(); return true; }
    if (t.id === "mk-n" || t.id === "mk-subj" || t.id === "mk-band" || t.id === "mk-kind") { mkRead(); render(); return true; }
    if (t.id === "mk-cls") { const M = mkRead(); M.cls = t.value; const c = S.data.classes.find(x => x.id === t.value); M.codes = new Set(c.students.map(s => s.code)); render(); return true; }
    if (t.classList && t.classList.contains("mk-st")) { const M = MK(); if (t.checked) M.codes.add(t.dataset.code); else M.codes.delete(t.dataset.code); render(); return true; }
    if (t.id === "ai-provider") { aiReadForm(); const P = AI_BY_ID[t.value]; AIC.url = P.url; AIC.model = P.model; AIC.key = ""; S.aiMsg = ""; render(); return true; }
    return false;
  }
  document.addEventListener("toggle", e => { if (e.target.id === "ai-details") S.aiOpen = e.target.open; }, true);

  // ---------- the walkthrough: what DI-ana does and how to use it, step by step ----------
  // It opens by itself the first time DI-ana opens (the Android app remembers that it was seen; a browser remembers it in
  // its own storage, which holds nothing else), and from the Walkthrough button.
  const TOUR_KEY = "diana.walkthroughSeen";
  const SHEET = (x, y, w, h) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#fff" stroke="var(--line)"/>${[[x + 3, y + 3], [x + w - 9, y + 3], [x + 3, y + h - 9], [x + w - 9, y + h - 9]].map(([a, b]) => `<rect x="${a}" y="${b}" width="6" height="6" fill="#1B1726"/>`).join("")}${[0.36, 0.52, 0.68].map(f => [0.3, 0.45, 0.6, 0.75].map((g, k) => `<circle cx="${x + w * g}" cy="${y + h * f}" r="${Math.max(2, w * 0.045)}" ${k === (Math.round(f * 10) % 4) ? 'fill="var(--accent)"' : 'fill="none" stroke="#888" stroke-width="1"'}/>`).join("")).join("")}</g>`;
  const ODIN = (x, y) => `<g><rect x="${x}" y="${y}" width="64" height="44" rx="8" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/><text x="${x + 32}" y="${y + 27}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--accent)" font-family="var(--f-display)">Odin</text></g>`;
  const ARROW = (x1, x2, y) => `<path d="M${x1} ${y}H${x2 - 6}" stroke="var(--muted)" stroke-width="2"/><path d="M${x2 - 8} ${y - 5}L${x2} ${y}L${x2 - 8} ${y + 5}" fill="none" stroke="var(--muted)" stroke-width="2"/>`;
  const PHONE = (x, y, inner) => `<g><rect x="${x}" y="${y}" width="52" height="96" rx="9" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/><rect x="${x + 5}" y="${y + 10}" width="42" height="72" rx="2" fill="var(--sunk)"/>${inner || ""}</g>`;
  const ART = {
    about: `${PHONE(18, 12, SHEET(28, 28, 32, 44))}${ARROW(80, 150, 60)}<text x="115" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">answers only</text>${ODIN(156, 38)}`,
    print: `<rect x="70" y="40" width="100" height="44" rx="8" fill="var(--sunk)" stroke="var(--ink)" stroke-width="2"/><rect x="84" y="28" width="72" height="14" rx="2" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>${SHEET(92, 70, 56, 46)}<circle cx="158" cy="52" r="3" fill="var(--accent)"/>`,
    bubbles: `${[0, 1, 2].map(r => `<text x="44" y="${40 + r * 28}" font-size="12" font-weight="700" fill="var(--ink)">${r + 1}</text>${[0, 1, 2, 3].map(k => `<circle cx="${76 + k * 30}" cy="${36 + r * 28}" r="9" ${k === [2, 0, 3][r] ? 'fill="var(--ink)"' : 'fill="none" stroke="var(--muted)" stroke-width="1.5"'}/><text x="${76 + k * 30}" y="${40 + r * 28}" text-anchor="middle" font-size="9" fill="#b4b4b4">${"ABCD"[k]}</text>`).join("")}`).join("")}<path d="M196 96 L214 30 L222 33 L204 99 Z" fill="var(--warn)" stroke="var(--ink)" stroke-width="1.5"/><path d="M196 96 L204 99 L198 108 Z" fill="var(--ink)"/>`,
    scan: `${SHEET(30, 40, 70, 74)}${PHONE(118, 10, SHEET(128, 30, 32, 40))}<path d="M128 30v-5h5M160 30v-5h-5M128 70v5h5M160 70v5h-5" stroke="var(--accent)" stroke-width="2" fill="none"/><path d="M182 20q8 8 0 16M188 14q14 14 0 28" stroke="var(--accent)" stroke-width="2" fill="none"/><text x="65" y="32" text-anchor="middle" font-size="10" fill="var(--muted)">all four corners in view</text>`,
    check: `<rect x="22" y="18" width="196" height="84" rx="10" fill="var(--surface)" stroke="var(--warn)" stroke-width="2"/><text x="36" y="38" font-size="11" font-weight="700" fill="var(--ink)">Question 3 · Two bubbles filled</text>${[0, 1, 2, 3].map(k => `<circle cx="${52 + k * 30}" cy="56" r="8" ${k === 1 || k === 2 ? 'fill="#555"' : 'fill="none" stroke="#999" stroke-width="1.5"'}/>`).join("")}${["A", "B", "C", "D"].map((l, k) => `<rect x="${36 + k * 36}" y="72" width="30" height="20" rx="5" fill="${k === 2 ? "var(--accent)" : "var(--surface)"}" stroke="var(--line)"/><text x="${51 + k * 36}" y="86" text-anchor="middle" font-size="11" font-weight="700" fill="${k === 2 ? "var(--accent-ink)" : "var(--ink)"}">${l}</text>`).join("")}`,
    send: `${[0, 1, 2].map(k => `<rect x="${24 + k * 6}" y="${22 + k * 8}" width="64" height="74" rx="3" fill="var(--surface)" stroke="var(--line)"/>`).join("")}<text x="68" y="82" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ok)">6/8</text>${ARROW(104, 146, 62)}${ODIN(152, 40)}<path d="M174 96h20" stroke="var(--ok)" stroke-width="3"/><path d="M178 92l4 4l8-8" stroke="var(--ok)" stroke-width="2" fill="none"/>`,
    make: `${SHEET(24, 22, 60, 80)}<text x="54" y="18" text-anchor="middle" font-size="10" fill="var(--muted)">worksheet</text>${ARROW(92, 132, 62)}<g><rect x="140" y="22" width="62" height="80" rx="2" fill="#fff" stroke="var(--line)"/>${[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3].map(k => `<circle cx="${156 + k * 12}" cy="${36 + r * 14}" r="4" ${k === [1, 3, 0, 2, 1][r] ? 'fill="var(--accent)"' : 'fill="none" stroke="#888" stroke-width="1"'}/>`).join("")).join("")}${[[142, 24], [194, 24], [142, 94], [194, 94]].map(([a, b]) => `<rect x="${a}" y="${b}" width="6" height="6" fill="#1B1726"/>`).join("")}</g><text x="171" y="116" text-anchor="middle" font-size="10" fill="var(--muted)">answer key</text><path d="M214 30l4-8l4 8l8 4l-8 4l-4 8l-4-8l-8-4z" fill="var(--warn)"/>`,
    school: `${PHONE(30, 12, `<text x="56" y="44" text-anchor="middle" font-size="7" fill="var(--muted)">https://</text><rect x="38" y="48" width="36" height="8" rx="2" fill="var(--surface)" stroke="var(--line)"/><rect x="38" y="62" width="36" height="9" rx="3" fill="var(--accent)"/>`)}${ARROW(98, 150, 60)}<text x="124" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">school Wi-Fi</text>${ODIN(156, 38)}`
  };
  function tourSteps() {
    const demo = S.mode === "demo";
    return [
      { art: ART.about, h: "What DI-ana does", p: [
        "DI-ana stands for Diagnostic testing and Intervention automatic analysis. It reads the paper sheets Odin prints for each student: the pre-check, practice 1 and 2, and the post-check, and the tests and worksheet answer sheets you make in DI-ana.",
        "It sends only the answers to Odin. Odin scores them with its own answer keys, and the pre- and post-check scores show on Odin's Weekly focus and Progress tabs." ] },
      { art: ART.print, h: "1. Print the sheets in Odin", p: [
        "In Odin, open the Practice tab. Under View, print or save as PDF, choose Pre-checks, Practice packets or Post-checks, then Print (or Save as PDF).",
        "Print on US Letter at 100% (actual size). Each sheet has its own number in the black squares at the top, so DI-ana knows whose sheet it is and which one." ],
        note: demo ? "In this demo, use Save sample sheets as PDF (under Try it with the demo) instead: Odin's own demo numbers its sheets differently." : "" },
      { art: ART.bubbles, h: "2. Students fill in the bubbles", p: [
        "One bubble per question, filled in completely with a pencil. To change an answer, erase it cleanly.",
        "Nobody writes on the four black corner squares or the black squares at the top: that's how DI-ana finds the sheet and reads its number." ] },
      { art: ART.scan, h: "3. Scan the stack", p: [
        "Tap Scan with the camera. Hold the phone over a sheet so all four black corner squares show on the screen.",
        "Hold still until it beeps, then put the next sheet down. Any order works, and upside down or a little crooked is fine. Good light helps: tap Light if the room is dark.",
        "Already have photos, or a scanner's PDF? Tap Choose photos or scans." ] },
      { art: ART.check, h: "4. Check what DI-ana asks about", p: [
        "When a mark is light, two bubbles are filled, or an answer looks erased, DI-ana shows that question's bubbles with A–D buttons. Tap what the student meant, or Blank.",
        "If Odin already has a result for a sheet, DI-ana asks before replacing it." ] },
      { art: ART.send, h: demo ? "5. Save (in the demo) or send to Odin" : "5. Send to Odin", p: [
        demo ? "At school, Send puts the answers into Odin. In this demo it's called Save, and nothing leaves the page." : "Press Send. Only the answers go to Odin, and Odin scores them.",
        "DI-ana keeps nothing: pictures are never saved or sent, and closing DI-ana clears its list. So send before you close it." ] },
      { art: ART.make, h: "6. Make tests and worksheets", p: [
        "Under Make tests and worksheets: choose a worksheet's PDF (DI-ana counts its questions and choices), type how many questions any worksheet has, or have AI write a test or practice sheet for a grade, skill and topic. Read and change every AI question before printing.",
        "Each prints with an answer key sheet and a sheet for each student. Fill in the key's bubbles (or tap the key in), then scan the key sheet with the students' sheets: DI-ana scores them all." ],
        note: "The AI is told only the grade, subject, skill and topic, never anything about a student." },
      { art: ART.school, h: "At school", p: [
        BRIDGE ? "Tap Change Odin's address at the bottom of the page and type the address teachers use for Odin (it starts with https://), then sign in with Odin's password. The phone has to be on the school network."
          : "Use the DI-ana Android app: type the address teachers use for Odin (it starts with https://) and sign in with Odin's password. The phone has to be on the school network.",
        "DI-ana needs Odin 0.9.5 or newer to scan Odin's sheets, and 0.10.0 or newer to make tests and worksheets. Use real student information only on the school's Project Cerberus server, with the school's written approval." ] }
    ];
  }
  const nb = t => esc(t).replace(/DI-ana/g, '<span class="nw">DI-ana</span>');   // never "DI-" at a line's end
  function tourHTML() {
    const steps = tourSteps(), k = Math.min(S.tour.step, steps.length - 1), st = steps[k], last = k === steps.length - 1;
    return `<div class="tour" id="tour" role="dialog" aria-modal="true" aria-labelledby="tour-h"><div class="tour-card">
      <svg class="tour-art" viewBox="0 0 240 120" role="img" aria-label="">${st.art}</svg>
      <p class="tour-n small muted">Walkthrough · ${k + 1} of ${steps.length}</p>
      <h2 id="tour-h" tabindex="-1">${nb(st.h)}</h2>
      ${st.p.map(t => `<p>${nb(t)}</p>`).join("")}${st.note ? `<p class="small notice">${nb(st.note)}</p>` : ""}
      <div class="tour-dots" aria-hidden="true">${steps.map((_, i) => `<i class="${i === k ? "on" : ""}"></i>`).join("")}</div>
      <div class="row tour-nav">
        ${k ? `<button class="btn ghost" data-a="tourback">Back</button>` : `<button class="btn ghost" data-a="tourdone">Skip</button>`}
        ${last ? (S.mode === "demo" && S.data ? `<button class="btn ghost" data-a="tourtry">Try pretend pictures</button>` : "") + `<button class="btn" data-a="tourscan">Start scanning</button><button class="btn ghost" data-a="tourdone">Done</button>` : `<button class="btn" data-a="tournext">Next</button>`}
      </div></div></div>`;
  }
  function tourOpen(step) { S.tour = { open: true, step: step || 0, focus: true }; render(); }
  function tourClose() { S.tour.open = false; try { localStorage.setItem(TOUR_KEY, "1"); } catch (e) {} if (BRIDGE) ask("toured", {}, 2000); render(); }
  function tourSeen(hello) {
    if (hello && typeof hello.toured === "boolean") return hello.toured;
    try { return localStorage.getItem(TOUR_KEY) === "1"; } catch (e) { return false; }
  }
  document.addEventListener("keydown", e => {
    if (!S.tour.open) return;
    if (e.key === "Escape") tourClose();
    else if (e.key === "ArrowRight" && S.tour.step < tourSteps().length - 1) { S.tour.step++; S.tour.focus = true; render(); }
    else if (e.key === "ArrowLeft" && S.tour.step > 0) { S.tour.step--; S.tour.focus = true; render(); }
  });

  // ---------- taps ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-a]");
    if (!t) return;
    const a = t.dataset.a, x = t.dataset.k ? S.reads.find(y => y.key === Number(t.dataset.k)) : null;
    if (mkClick(a, t)) return;
    if (a === "tour") tourOpen(0);
    else if (a === "tournext") { S.tour.step++; S.tour.focus = true; render(); }
    else if (a === "tourback") { S.tour.step = Math.max(0, S.tour.step - 1); S.tour.focus = true; render(); }
    else if (a === "tourdone") tourClose();
    else if (a === "tourtry") { tourClose(); pretend(); }
    else if (a === "tourscan") { tourClose(); if (S.data) camStart(); }
    else if (a === "camera") camStart();
    else if (a === "camclose") camStop();
    else if (a === "torch") torch();
    else if (a === "names") { S.names = !S.names; render(); }
    else if (a === "send") send();
    else if (a === "clear") {
      const waiting = S.reads.filter(y => y.ok && y.status !== "sent").length;
      if (waiting && !S.clearAsk) { S.clearAsk = true; say(`${plural(waiting, "sheet")} ${waiting === 1 ? "isn't" : "aren't"} ${S.mode === "demo" ? "saved" : "sent"} yet. Press Clear the list again to drop ${waiting === 1 ? "it" : "them"}.`, "bad"); setTimeout(() => { S.clearAsk = false; }, 6000); return render(); }
      S.reads = []; S.clearAsk = false; say(""); render();
    }
    else if (a === "drop" && x) { S.reads = S.reads.filter(y => y !== x); render(); }
    else if (a === "replace" && x) { x.status = "ready"; render(); }
    else if (a === "retry" && x) { x.status = "ready"; send(); }
    else if (a === "fix" && x) {
      const q = Number(t.dataset.q), v = t.dataset.v;
      x.answers = x.answers.slice(0, q) + v + x.answers.slice(q + 1);
      x.open = x.open.filter(o => o.item !== q);
      if (!x.open.length) x.status = doneStatus(x);
      render();
    }
    else if (a === "typeid" && x) {
      const id = Number(($(`#tid-${x.key}`) || {}).value);
      if (!id || !x.img) return;
      const r = scReadPage(x.img, lookup, id);
      S.reads = S.reads.filter(y => y !== x);
      const y = addRead(r, x.img, "file", x.file);
      if (y && !y.ok) y.img = null;
      render();
    }
    else if (a === "samplepdf") samplePdf();
    else if (a === "pretend") pretend();
    else if (a === "setup") ask("setup", {}, 1000);
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (mkChange(t)) return;
    if (t.id === "files" && t.files && t.files.length) { const f = [...t.files]; t.value = ""; readFiles(f); }
    else if (t.id === "d-cls") { S.demo.cls = t.value; render(); }
    else if (t.id === "d-subj") { S.demo.subj = t.value; render(); }
    else if (t.id === "d-which") { S.demo.which = t.value; render(); }
  });
  document.addEventListener("submit", e => {
    if (e.target.id !== "signin") return;
    e.preventDefault();
    const pw = ($("#pw") || {}).value || "";
    if (pw) signIn(pw);
  });
  // Android's back button: close the camera first; and don't lose sheets that weren't sent without asking.
  window.__dianaBack = () => {
    if (S.tour.open) { tourClose(); return "stay"; }
    if (CAM.on) { camStop(); return "stay"; }
    const waiting = S.reads.filter(x => x.ok && x.status !== "sent").length;
    if (waiting && !S.leaving) { S.leaving = true; say(`${plural(waiting, "sheet")} ${waiting === 1 ? "isn't" : "aren't"} ${S.mode === "demo" ? "saved" : "sent to Odin"} yet. Press Back again to leave without them, or send them first.`, "bad"); render(); setTimeout(() => { S.leaving = false; }, 6000); return "stay"; }
    return "";
  };
  // for the tests: what was read, and a way to read a picture without the camera
  window.__diana = {
    state: () => ({ mode: S.mode, signedIn: S.signedIn, sheets: S.byId.size, names: S.names, walkthrough: S.tour.open ? S.tour.step + 1 : 0, view: S.view, step: S.make ? S.make.step : null }),
    make: () => (S.make ? { step: S.make.step, kind: S.make.kind, title: S.make.title, n: S.make.n, choices: S.make.choices.slice(0, S.make.n), key: S.make.key, items: S.make.items.length, err: S.make.err, detected: S.make.detected } : null),
    sets: () => allSets().map(({ st, cls }) => ({ id: st.id, cls: cls.id, kind: st.kind, title: st.title, total: st.total, key: st.key, keySheet: st.keySheet, sheets: st.sheets.map(x => ({ id: x.id, code: x.code, status: x.status, right: x.right })) })),
    ai: () => ({ provider: AIC.provider, url: AIC.url, model: AIC.model, hasKey: !!AIC.key }),
    walkthrough: () => ({ open: S.tour.open, step: S.tour.step + 1, steps: tourSteps().length, heading: (($("#tour-h") || {}).textContent || "") }),
    reads: () => S.reads.map(x => ({ ok: x.ok, id: x.id, status: x.status, answers: x.answers, open: x.open ? x.open.length : 0, reason: x.reason, src: x.src, code: x.rec && x.rec.code })),
    sheet: id => { const e = S.byId.get(id); return e ? { rec: e.rec, spec: specFor(id), mismatch: e.mismatch } : null; },
    ids: (cls, subj, kind) => S.data ? S.data.classes.filter(c => !cls || c.id === cls).flatMap(c => c.sheets.filter(r => (!subj || r.subject === subj) && (!kind || r.kind === kind)).map(r => r.id)) : [],
    recheck: id => { const e = S.byId.get(id); if (e) e.spec = null; },
    camera: () => ({ on: CAM.on, count: CAM.count, msg: ($("#cam-msg") || {}).textContent || "", last: ($("#cam-last") || {}).textContent || "", video: CAM.video ? [CAM.video.videoWidth, CAM.video.videoHeight] : null }),
    pretendRead: (id, answers) => { const sp = specFor(id); if (!sp) return null; const img = scSynth(sp, answers || sp.items.map(it => SH_LETTERS[Math.max(0, it.key)]).join(""), { seed: 7 }); const x = addRead(scReadPage(img, lookup), img, "pretend", "pretend picture"); render(); return x && x.ok; }
  };

  // ---------- start ----------
  async function start() {
    const root = document.createElement("div"); root.id = "app"; document.body.appendChild(root);
    const hello = BRIDGE ? await ask("hello", {}, 8000) : null;
    if (hello) { S.appVersion = hello.app || ""; if (hello.mode === "server" && hello.server) { S.mode = "server"; S.server = hello.server; } }
    if (!tourSeen(hello)) S.tour = { open: true, step: 0, focus: true };   // the first time DI-ana opens
    if (S.mode === "demo") { useData(DEMO); render(); return; }
    render();
    await loadServer();
  }
  start();
})();
