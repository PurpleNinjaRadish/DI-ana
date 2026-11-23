// =====================================================================================================
// DI-ana: reads Odin's paper sheets (pre-checks, practice 1 and 2, post-checks) with the phone's camera, or from photos
// and scans, and sends only the answers to Odin. The sheet code, the corner squares and the bubbles are read by Odin's own
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
  const sheetLabel = rec => (rec.kind === "practice" ? `Practice ${rec.part}` : SH_KIND[rec.kind]);
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
    reads: [], sending: false, leaving: false,
    demo: { cls: null, subj: "math", which: "pre" },
    tour: { open: false, step: 0, focus: false }
  };
  function useData(d) {
    S.data = d; S.byId = new Map(); S.today = d.today || new Date().toISOString().slice(0, 10);
    for (const c of d.classes) for (const r of c.sheets) S.byId.set(r.id, { rec: r, cls: c, spec: null, mismatch: false });
    if (!S.demo.cls || !d.classes.some(c => c.id === S.demo.cls)) S.demo.cls = (d.classes.slice().sort((a, b) => b.sheets.length - a.sheets.length)[0] || {}).id || null;
  }
  // Odin draws each sheet again from its record. If this copy of Odin's sheet maker doesn't make the same answer key as
  // the server's, the sheet came from another version of Odin: DI-ana won't guess at it.
  function specFor(id) {
    const e = S.byId.get(id);
    if (!e) return null;
    if (!e.spec) {
      try { e.spec = shBuildSheet(Object.assign({}, e.rec)); } catch (err) { e.spec = null; }
      e.mismatch = !e.spec || e.spec.key !== e.rec.key || e.spec.total !== e.rec.total;
    }
    return e.mismatch ? null : e.spec;
  }
  const who = (cls, code) => { const s = cls && cls.students.find(x => x.code === code); return s && S.names ? s.name : code; };

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
      const x = { key: ++readKey, ok: true, id: r.id, rec: e.rec, cls: e.cls, spec: r.spec, answers: r.answers, flagsN: r.flags.length, open, src, file, thumb, note: "" };
      x.status = open.length ? "check" : e.rec.status === "done" ? "replace" : "ready";
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
    if (before && before.status === "sent") { beep(false); camLast(`Already sent: <b>${esc(who(before.cls, before.rec.code))}</b> · ${esc(sheetLabel(before.rec))}`, true); camSay("Next sheet."); return; }
    const x = addRead(r, f, "camera");
    CAM.count++;
    $("#cam-n").textContent = `${CAM.count} read`;
    const fl = $("#cam .flash"); fl.classList.add("on"); setTimeout(() => fl.classList.remove("on"), 60);
    const sc = shScore(x.spec, x.answers);
    beep(!x.open.length);
    camLast(`<b>${esc(who(x.cls, x.rec.code))}</b> · ${esc(sheetLabel(x.rec))} · <b>${sc.right}/${x.spec.total}</b>${x.open.length ? ` · check ${plural(x.open.length, "answer")}` : ""}${x.status === "replace" ? " · already had a result" : ""}${before ? " · read again" : ""}`, x.open.length > 0);
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
    const list = S.reads.filter(x => x.ok && x.status === "ready");
    if (!list.length || S.sending) return;
    S.sending = true; say(`Sending ${plural(list.length, "sheet")}…`); render();
    let sent = 0, failed = 0, signin = false;
    for (const x of list) {
      const body = { classId: x.cls.id, id: x.id, answers: x.answers, source: "scan", taken: S.today, flags: Math.min(20, x.flagsN || 0) };
      if (S.mode === "demo") {
        const sc = shScore(x.spec, x.answers);
        Object.assign(x.rec, { status: "done", right: sc.right, source: "scan", taken: S.today });
        Object.assign(x, { status: "sent", score: sc.right, img: null });
        sent++; continue;
      }
      const r = await ask("post", { path: "api/sheet/result", body }, 30000);
      if (r && r.status === 200) {
        let j = {}; try { j = JSON.parse(r.body || "{}"); } catch (e) {}
        Object.assign(x.rec, { status: "done", right: j.score, source: "scan", taken: S.today });
        Object.assign(x, { status: "sent", score: j.score, img: null });
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
    else say(S.mode === "demo" ? `Saved ${plural(sent, "sheet")} in the demo. In the demo nothing leaves this page.` : `Sent ${plural(sent, "sheet")} to Odin.${failed ? ` ${plural(failed, "sheet")} didn't go: see below.` : " Pre- and post-check scores are on Odin's Weekly focus and Progress tabs."}`, failed ? "bad" : "ok");
    render();
  }

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
    const bytes = doc.bytes(), name = `diana-demo-${c.id}-${S.demo.subj}-${S.demo.which}.pdf`;
    if (BRIDGE) {
      let b = ""; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await ask("printpdf", { name, b64: btoa(b) }, 15000);
      say(r && r.ok ? "Android's print screen is open: print the sheets on US Letter at 100%, or save them as a PDF." : "Android's print screen didn't open.");
      return render();
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    say(`Saved ${name} (${plural(list.length, "sheet")}). Print it on US Letter at 100% (actual size), fill in a few bubbles with a pencil, then scan them.`, "ok");
    render();
  }
  async function pretend() {
    const list = demoSheets().filter(x => x.rec.status !== "done").slice(0, 5);
    if (!list.length) { say("All of these sheets already have results. Pick another class or kind."); return render(); }
    say("Making pretend pictures…"); render();
    for (let i = 0; i < list.length; i++) {
      await new Promise(r => setTimeout(r, 10));
      const { rec } = list[i], sp = specFor(rec.id), R = seeded("pretend|" + rec.id), good = 0.55 + R() * 0.4;
      let ans = sp.items.map(it => (R() < good ? "ABCD"[it.key] : "ABCD"[(it.key + 1 + Math.floor(R() * (it.choices.length - 1))) % it.choices.length])).join("");
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
    else body = scanPanel(counts, demo, ready) + (demo ? demoPanel() : "");
    root.innerHTML = `<header class="top"><div class="wrap">
        <div class="brand">${LOGO}<div><h1>DI-ana</h1><div class="sub">Diagnostic testing and Intervention automatic analysis</div></div></div>
        ${demo ? `<span class="chip demo">Demo · invented students</span>` : `<span class="chip">${esc(S.server || "Odin")}${S.signedIn ? " · signed in" : ""}</span>`}
        <button class="btn ghost sm" data-a="tour" aria-haspopup="dialog">Walkthrough</button>
        <button class="switch" role="switch" aria-checked="${S.names}" data-a="names"><span class="k"></span>Names</button>
      </div></header>
      <p class="wrap tagline small muted">Reads Odin's paper pre-checks, practice sheets and post-checks with the camera, and sends only the answers to Odin.</p>
      <main class="wrap">
        ${S.error ? `<div class="notice bad" role="alert"><b>${esc(S.error)}</b></div>` : ""}
        ${body}
        <p class="privacy">DI-ana reads each picture on this ${BRIDGE ? "phone" : "device"}. Pictures are never saved or sent: only the answers go to Odin, and only when you press Send. Nothing stays on the ${BRIDGE ? "phone" : "device"}: closing DI-ana clears this list.${demo ? " Every student in the demo is invented." : ""}</p>
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
  function scanPanel(counts, demo, ready) {
    const list = S.reads;
    return `<section class="panel" aria-labelledby="scan-h">
      <h2 id="scan-h">Scan sheets</h2>
      <p class="small muted">Pre-checks, practice 1 and 2, and post-checks, in any order. Hold the phone over each sheet until it beeps, then the next. Sheets can be upside down or a little crooked.</p>
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
    const sc = shScore(x.spec, x.answers), cls = x.status === "check" ? "check" : x.status === "error" ? "bad" : "";
    const st = { ready: S.mode === "demo" ? "Ready to save" : "Ready to send", check: `Check ${plural(x.open.length, "answer")}`, replace: "Already had a result", sent: S.mode === "demo" ? "Saved (demo)" : "Sent to Odin", error: "Not sent" }[x.status];
    return `<div class="read ${cls}" data-key="${x.key}"><div class="top">${x.thumb ? `<img class="thumb" src="${x.thumb}" alt="">` : "<span></span>"}
        <div><div class="who">${esc(who(x.cls, x.rec.code))}</div><div class="what">${esc(sheetLabel(x.rec))} · ${esc(shSkillName(x.rec.subject, x.rec.skill))} · ${SUBJ[x.rec.subject]} · week of ${esc(weekLabel(x.rec.week))} · sheet ${x.id}</div></div>
        <div><div class="score">${x.status === "sent" && x.score != null ? x.score : sc.right}/${x.spec.total}</div><span class="st ${x.status}">${esc(st)}</span></div></div>
      ${x.note ? `<p class="small muted">${esc(x.note)}</p>` : ""}
      ${x.status === "error" ? `<p class="small" style="color:var(--bad)">${esc(x.error)}</p><div class="row"><button class="btn ghost sm" data-a="retry" data-k="${x.key}">Try again</button></div>` : ""}
      ${x.status === "replace" ? `<p class="small">Odin already has ${x.rec.right != null ? `${x.rec.right}/${x.rec.total}` : "a result"}${x.rec.source ? ` (${SRC_WORD[x.rec.source] || x.rec.source}${x.rec.taken ? ", " + x.rec.taken : ""})` : ""} for this sheet.</p><div class="row"><button class="btn sm" data-a="replace" data-k="${x.key}">Replace it with this one</button><button class="btn ghost sm" data-a="drop" data-k="${x.key}">Keep Odin's</button></div>` : ""}
      ${x.status === "check" ? x.open.map(o => reviewRow(x, o)).join("") : ""}
      ${x.status !== "sent" ? `<div class="row"><button class="btn ghost sm" data-a="drop" data-k="${x.key}">Remove</button></div>` : ""}
    </div>`;
  }
  function reviewRow(x, o) {
    const it = x.spec.items[o.item], cur = x.answers[o.item];
    return `<div class="rv"><span class="small"><b>Question ${o.item + 1}</b> · ${FLAG_WORDS[o.kind] || "Check"}</span>${o.pic ? `<img src="${o.pic}" alt="The bubbles for question ${o.item + 1}">` : ""}
      <div class="row" role="group" aria-label="Answer for question ${o.item + 1}">${it.choices.map((c, k) => `<button class="btn ${cur === "ABCD"[k] ? "" : "ghost"} sm" data-a="fix" data-k="${x.key}" data-q="${o.item}" data-v="${"ABCD"[k]}">${"ABCD"[k]}</button>`).join("")}<button class="btn ${cur === "-" ? "" : "ghost"} sm" data-a="fix" data-k="${x.key}" data-q="${o.item}" data-v="-">Blank</button></div></div>`;
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
    school: `${PHONE(30, 12, `<text x="56" y="44" text-anchor="middle" font-size="7" fill="var(--muted)">https://</text><rect x="38" y="48" width="36" height="8" rx="2" fill="var(--surface)" stroke="var(--line)"/><rect x="38" y="62" width="36" height="9" rx="3" fill="var(--accent)"/>`)}${ARROW(98, 150, 60)}<text x="124" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">school Wi-Fi</text>${ODIN(156, 38)}`
  };
  function tourSteps() {
    const demo = S.mode === "demo";
    return [
      { art: ART.about, h: "What DI-ana does", p: [
        "DI-ana stands for Diagnostic testing and Intervention automatic analysis. It reads the paper sheets Odin prints for each student: the pre-check, practice 1 and 2, and the post-check.",
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
      { art: ART.school, h: "At school", p: [
        BRIDGE ? "Tap Change Odin's address at the bottom of the page and type the address teachers use for Odin (it starts with https://), then sign in with Odin's password. The phone has to be on the school network."
          : "Use the DI-ana Android app: type the address teachers use for Odin (it starts with https://) and sign in with Odin's password. The phone has to be on the school network.",
        "DI-ana needs Odin 0.9.5 or newer. Use real student information only on the school's Project Cerberus server, with the school's written approval." ] }
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
      if (!x.open.length) x.status = x.rec.status === "done" ? "replace" : "ready";
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
    state: () => ({ mode: S.mode, signedIn: S.signedIn, sheets: S.byId.size, names: S.names, walkthrough: S.tour.open ? S.tour.step + 1 : 0 }),
    walkthrough: () => ({ open: S.tour.open, step: S.tour.step + 1, steps: tourSteps().length, heading: (($("#tour-h") || {}).textContent || "") }),
    reads: () => S.reads.map(x => ({ ok: x.ok, id: x.id, status: x.status, answers: x.answers, open: x.open ? x.open.length : 0, reason: x.reason, src: x.src, code: x.rec && x.rec.code })),
    sheet: id => { const e = S.byId.get(id); return e ? { rec: e.rec, spec: specFor(id), mismatch: e.mismatch } : null; },
    ids: (cls, subj, kind) => S.data ? S.data.classes.filter(c => !cls || c.id === cls).flatMap(c => c.sheets.filter(r => (!subj || r.subject === subj) && (!kind || r.kind === kind)).map(r => r.id)) : [],
    recheck: id => { const e = S.byId.get(id); if (e) e.spec = null; },
    camera: () => ({ on: CAM.on, count: CAM.count, msg: ($("#cam-msg") || {}).textContent || "", last: ($("#cam-last") || {}).textContent || "", video: CAM.video ? [CAM.video.videoWidth, CAM.video.videoHeight] : null }),
    pretendRead: id => { const sp = specFor(id); if (!sp) return null; const img = scSynth(sp, sp.items.map(it => "ABCD"[it.key]).join(""), { seed: 7 }); const x = addRead(scReadPage(img, lookup), img, "pretend", "pretend picture"); render(); return x && x.ok; }
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
