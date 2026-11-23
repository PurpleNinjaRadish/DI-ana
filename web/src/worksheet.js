// =====================================================================================================
// DI-ana 0.2: a worksheet's PDF. pdf.js (web/vendor/pdfjs, loaded only when a teacher picks a worksheet) reads the text
// and draws small pictures of the pages; wsDetect() finds the numbered questions and how many choices each has, so the
// teacher only checks the counts. The worksheet itself is printed from its own file: students bubble their answers on
// Odin's answer sheet. Nothing from the file is sent anywhere or kept.
// =====================================================================================================
let WS_PDFJS = null;
function wsLoadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(s); });
}
// pdf.js runs on the page itself (its "fake worker"), so nothing but these two files is ever loaded.
async function wsPdfjs() {
  if (WS_PDFJS) return WS_PDFJS;
  if (!globalThis.pdfjsWorker) await wsLoadScript("vendor/pdfjs/pdf.worker.min.js");
  if (!globalThis.pdfjsLib) await wsLoadScript("vendor/pdfjs/pdf.min.js");
  WS_PDFJS = globalThis.pdfjsLib;
  return WS_PDFJS;
}
// The worksheet's lines of text (top to bottom on each page) and a small picture of each page (up to 6).
async function wsReadPdf(bytes, opt = {}) {
  const lib = await wsPdfjs();
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
  const lines = [], pics = [], n = Math.min(doc.numPages, opt.maxPages || 20);
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent();
    lines.push(...wsLines(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 10 })), p));
    if (pics.length < (opt.pictures == null ? 6 : opt.pictures)) {
      try {
        const vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(2, 420 / vp0.width) });
        const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: cx, viewport: vp }).promise;
        pics.push(cv.toDataURL("image/jpeg", 0.8));
      } catch (e) {}
    }
    page.cleanup();
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { lines, pics, pages };
}
// Text pieces on one page into lines: pieces at the same height (PDF y grows upward) are one line, left to right.
function wsLines(items, page) {
  const its = items.filter(it => it.str && it.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x), out = [];
  for (const it of its) {
    const L = out.length ? out[out.length - 1] : null;
    if (L && Math.abs(L.y - it.y) <= Math.max(2, Math.min(L.h, it.h) * 0.45)) L.parts.push(it);
    else out.push({ page, y: it.y, h: it.h, parts: [it] });
  }
  return out.map(L => {
    L.parts.sort((a, b) => a.x - b.x);
    let t = "", end = null;
    for (const p of L.parts) { if (end != null && p.x - end > Math.max(1.5, p.h * 0.15) && !/\s$/.test(t) && !/^\s/.test(p.str)) t += " "; t += p.str; end = p.x + p.w; }
    return { page, y: L.y, text: t.replace(/\s+/g, " ").trim() };
  });
}
// Numbered questions and their lettered choices. Returns { n, choices: [count per question], common, found: [per question
// whether its choices were seen], key: [a key letter per question when the worksheet prints its own answer key, or ""] }.
function wsDetect(lines) {
  const QRX = /^(?:Q(?:uestion)?\s*)?(\d{1,2})\s*[.):]\s*(\S.*)?$/i;
  const START = /^[(\[]?([A-Ea-e])\s*[.)\]]\s+\S|^[(\[]?([A-E])\s*[.)\]]?\s*$/;
  const INLINE = /(?:^|\s)[(\[]?([A-E])[.)\]]\s+\S|(?:^|\s)\(([a-e])\)\s+\S|(?:^|\s)([a-e])\)\s+\S/g;
  const qs = [];
  let cur = null, expect = 1, keyAt = -1;
  lines.forEach((L, i) => {
    const t = L.text;
    if (qs.length && /^(answer key|answers|key)\b[:.]?\s*$/i.test(t)) { if (keyAt < 0) keyAt = i; return; }
    if (keyAt >= 0) return;
    const m = t.match(QRX);
    if (m && (Number(m[1]) === expect || (Number(m[1]) === 1 && expect > 2))) {
      cur = { letters: new Set(), line: i }; qs.push(cur); expect = Number(m[1]) + 1;
      wsLetters(m[2] || "", INLINE, cur.letters);
      return;
    }
    if (!cur) return;
    const s = t.match(START);
    if (s) cur.letters.add((s[1] || s[2]).toUpperCase());
    wsLetters(t, INLINE, cur.letters);
  });
  const counts = qs.map(q => { let n = 0; while (n < 5 && q.letters.has("ABCDE"[n])) n++; return n >= 2 ? n : 0; });
  const tally = {}; counts.filter(Boolean).forEach(c => { tally[c] = (tally[c] || 0) + 1; });
  const common = Number(Object.keys(tally).sort((a, b) => tally[b] - tally[a] || (b == 4) - (a == 4) || b - a)[0]) || 4;
  const key = keyAt >= 0 ? wsKeyFrom(lines.slice(keyAt + 1), qs.length) : [];
  return { n: qs.length, choices: counts.map(c => c || common), found: counts.map(Boolean), common, key };
}
function wsLetters(t, rx, set) { rx.lastIndex = 0; let m; while ((m = rx.exec(t))) set.add((m[1] || m[2] || m[3]).toUpperCase()); }
// "1. B  2. D  3. A" or one per line, after an "Answer key" heading.
function wsKeyFrom(lines, n) {
  const key = Array(n).fill(""), rx = /(?:^|\s)(\d{1,2})\s*[.):-]?\s*([A-E])\b/g;
  lines.forEach(L => { rx.lastIndex = 0; let m; while ((m = rx.exec(L.text))) { const q = Number(m[1]); if (q >= 1 && q <= n && !key[q - 1]) key[q - 1] = m[2]; } });
  return key.filter(Boolean).length >= Math.max(1, Math.ceil(n / 2)) ? key : [];
}
if (typeof module !== "undefined") module.exports = { wsLines, wsDetect, wsKeyFrom };
