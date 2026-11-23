// ===== Odin 0.4: reading scanned answer sheets, inside the browser =====
// Nothing leaves the computer: images are decoded and read in this page, and only the answers are saved.
// Steps: find the four corner squares -> fit a perspective transform from the page (mm) to the image (pixels)
// -> read the 34-square sheet code (trying all four rotations) -> look up the sheet -> measure every bubble.
const SC_FILL = 0.42, SC_MIN = 0.12, SC_LIGHT = 0.2, SC_TWO = 0.6, SC_RATIO = 3;   // darkness: clearly filled, any mark at all, light, second mark vs first, filled vs the rest

function scOtsu(g) {
  const hist = new Float64Array(256); for (let i = 0; i < g.length; i++) hist[g[i]]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = g.length - wB; if (!wF) break; sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; t = i; } }
  return t;
}
function scDownscale(g, w, h, maxDim) {
  const f = Math.max(1, Math.ceil(Math.max(w, h) / maxDim)), sw = Math.floor(w / f), sh = Math.floor(h / f), s = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let a = 0; for (let j = 0; j < f; j++) { const row = (y * f + j) * w + x * f; for (let i = 0; i < f; i++) a += g[row + i]; } s[y * sw + x] = a / (f * f); }
  return { g: s, w: sw, h: sh, f };
}
// Find the four corner squares. Returns image points in order: top-left, top-right, bottom-right, bottom-left of the image.
function scFindMarks(g, w, h) {
  const d = scDownscale(g, w, h, 900), t = Math.min(scOtsu(d.g), 110), N = d.w * d.h, lab = new Int32Array(N), stack = new Int32Array(N);
  const ppm = Math.sqrt((d.w * d.h) / (SH_PAGE.w * SH_PAGE.h)), side = SH_MARK * ppm, cands = [];
  let next = 0;
  for (let p0 = 0; p0 < N; p0++) {
    if (lab[p0] || d.g[p0] >= t) continue;
    next++; let sp = 0, area = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0, edge = false;
    stack[sp++] = p0; lab[p0] = next;
    while (sp) {
      const p = stack[--sp], x = p % d.w, y = (p - x) / d.w;
      area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === d.w - 1 || y === d.h - 1) edge = true;
      const nb = [p - 1, p + 1, p - d.w, p + d.w];
      for (let k = 0; k < 4; k++) { const q = nb[k]; if (q < 0 || q >= N || lab[q] || d.g[q] >= t) continue; if ((k === 0 && x === 0) || (k === 1 && x === d.w - 1)) continue; lab[q] = next; stack[sp++] = q; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (edge || bw < side * 0.5 || bh < side * 0.5 || bw > side * 1.75 || bh > side * 1.75 || bw / bh > 1.6 || bh / bw > 1.6 || area / (bw * bh) < 0.62) continue;
    cands.push({ x: sx / area, y: sy / area, x0, y0, x1, y1 });
  }
  if (cands.length < 4) return null;
  const corners = [[0, 0], [d.w, 0], [d.w, d.h], [0, d.h]], used = new Set(), out = [];
  const diag = Math.hypot(d.w, d.h);
  for (const [cx, cy] of corners) {
    let best = null, bd = 1e18;
    cands.forEach((c, i) => { if (used.has(i)) return; const dd = Math.hypot(c.x - cx, c.y - cy); if (dd < bd) { bd = dd; best = i; } });
    if (best == null || bd > diag * 0.33) return null;
    used.add(best); out.push(cands[best]);
  }
  // refine each centre at full resolution: centroid of the dark pixels inside the box
  return out.map(c => {
    const X0 = Math.max(0, Math.floor((c.x0 - 2) * d.f)), Y0 = Math.max(0, Math.floor((c.y0 - 2) * d.f)), X1 = Math.min(w - 1, Math.ceil((c.x1 + 3) * d.f)), Y1 = Math.min(h - 1, Math.ceil((c.y1 + 3) * d.f));
    let mn = 255, mx = 0; for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const v = g[y * w + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const th = (mn + mx) / 2; let sx = 0, sy = 0, n = 0;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (g[y * w + x] < th) { sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : [c.x * d.f, c.y * d.f];
  });
}
// 0.9.5: the corner squares in a phone camera's picture (DI-ana, and phone photos dropped into Odin). The page may fill
// only part of the picture, sit on a desk, lean in perspective and have uneven light, so this finder compares each pixel
// with its neighbourhood instead of one threshold for the whole picture, and picks the four squares that frame the page:
// the outermost square-ish dark spots of a similar size, about as far apart as the page's corner squares. Same output as
// scFindMarks. opt.maxDim: how far the picture is shrunk first (smaller is faster, for the live camera preview).
function scFindMarksCam(g, w, h, opt = {}) {
  const d = scDownscale(g, w, h, opt.maxDim || 1000), W = d.w, Hh = d.h, N = W * Hh, W1 = W + 1;
  const I = new Float64Array(W1 * (Hh + 1));
  for (let y = 0; y < Hh; y++) { let row = 0; for (let x = 0; x < W; x++) { row += d.g[y * W + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
  const r = Math.max(6, Math.round(Math.min(W, Hh) / 9)), mean = new Float32Array(N);
  for (let y = 0; y < Hh; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(Hh, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      mean[y * W + x] = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  const sum = (a, b, c, e) => I[e * W1 + c] - I[b * W1 + c] - I[e * W1 + a] + I[b * W1 + a];
  const lab = new Int32Array(N), stack = new Int32Array(N), cands = [], big = Math.min(W, Hh) / 5, dark = new Uint8Array(N);
  // Two passes: a strict one keeps a square apart from a dark desk right next to the page; a looser one finds it in shadow.
  for (const k of [0.45, 0.62]) {
    for (let p = 0; p < N; p++) { dark[p] = d.g[p] < mean[p] * k && d.g[p] < mean[p] - 25 ? 1 : 0; lab[p] = 0; }
    let next = 0;
    for (let p0 = 0; p0 < N; p0++) {
      if (lab[p0] || !dark[p0]) continue;
      next++; let sp = 0, area = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0, edge = false;
      stack[sp++] = p0; lab[p0] = next;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p - x) / W;
        area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === W - 1 || y === Hh - 1) edge = true;
        if (x > 0 && !lab[p - 1] && dark[p - 1]) { lab[p - 1] = next; stack[sp++] = p - 1; }
        if (x < W - 1 && !lab[p + 1] && dark[p + 1]) { lab[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0 && !lab[p - W] && dark[p - W]) { lab[p - W] = next; stack[sp++] = p - W; }
        if (y < Hh - 1 && !lab[p + W] && dark[p + W]) { lab[p + W] = next; stack[sp++] = p + W; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (edge || area < 16 || bw > big || bh > big || bw / bh > 1.7 || bh / bw > 1.7 || area / (bw * bh) < 0.55) continue;
      // a corner square is black on white paper: much darker than a ring of paper around it (spots on a desk are not)
      const pad = Math.max(2, Math.round(Math.max(bw, bh) * 0.5)), X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad), X1 = Math.min(W, x1 + 1 + pad), Y1 = Math.min(Hh, y1 + 1 + pad);
      const inner = sum(x0, y0, x1 + 1, y1 + 1), nIn = bw * bh, ring = (sum(X0, Y0, X1, Y1) - inner) / Math.max(1, (X1 - X0) * (Y1 - Y0) - nIn), blob = inner / nIn;
      if (ring < blob * 1.8 || ring - blob < 50) continue;
      const c = { x: sx / area, y: sy / area, s: Math.sqrt(area), x0, y0, x1, y1 };
      if (!cands.some(o => c.x >= o.x0 && c.x <= o.x1 && c.y >= o.y0 && c.y <= o.y1)) cands.push(c);   // found in both passes: keep the first
    }
  }
  if (opt.debug) opt.debug.cands = cands.map(c => [Math.round(c.x * d.f), Math.round(c.y * d.f), Math.round(c.s * d.f)]);
  if (cands.length < 4) return null;
  // for each corner of the picture, the few spots furthest out in that direction; then the best frame of four
  const dirs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], K = Math.min(8, cands.length);
  const tops = dirs.map(([a, b]) => cands.slice().sort((p, q) => (b * q.y + a * q.x) - (b * p.y + a * p.x)).slice(0, K));
  const want = SH_MARK / ((SH_MARKS[1][0] - SH_MARKS[0][0] + SH_MARKS[3][1] - SH_MARKS[0][1]) / 2), aspect = (SH_MARKS[3][1] - SH_MARKS[0][1]) / (SH_MARKS[1][0] - SH_MARKS[0][0]);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let best = null, bestScore = 0;
  for (const A of tops[0]) for (const B of tops[1]) for (const C of tops[2]) for (const D of tops[3]) {
    const q = [A, B, C, D];
    if (new Set(q).size < 4) continue;
    const ss = q.map(c => c.s), smin = Math.min(...ss), smax = Math.max(...ss);
    if (smax > smin * 2.2) continue;
    const turns = [cross(A, B, C), cross(B, C, D), cross(C, D, A), cross(D, A, B)];
    if (!(turns.every(t => t > 0) || turns.every(t => t < 0))) continue;   // a convex frame, corners in order
    const e = [dist(A, B), dist(B, C), dist(C, D), dist(D, A)], mean = (e[0] + e[1] + e[2] + e[3]) / 4;
    if (Math.min(...e) < mean * 0.45) continue;
    const ratio = (ss.reduce((t, x) => t + x, 0) / 4) / mean;
    if (ratio < want * 0.45 || ratio > want * 2.2) continue;                // squares about the size of corner squares for a frame this big
    const ar = (e[1] + e[3]) / (e[0] + e[2]);
    const ok = Math.max(Math.min(ar / aspect, aspect / ar), Math.min(ar * aspect, 1 / (ar * aspect)));   // the page upright or on its side
    if (ok < 0.55) continue;
    const area = Math.abs(turns[0] + turns[2]) / 2, score = area * ok * (smin / smax);
    if (score > bestScore) { bestScore = score; best = q; }
  }
  if (!best) return null;
  return best.map(c => {
    const X0 = Math.max(0, Math.floor((c.x0 - 2) * d.f)), Y0 = Math.max(0, Math.floor((c.y0 - 2) * d.f)), X1 = Math.min(w - 1, Math.ceil((c.x1 + 3) * d.f)), Y1 = Math.min(h - 1, Math.ceil((c.y1 + 3) * d.f));
    let mn = 255, mx = 0; for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const v = g[y * w + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const th = (mn + mx) / 2; let sx = 0, sy = 0, n = 0;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (g[y * w + x] < th) { sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : [c.x * d.f, c.y * d.f];
  });
}
// perspective transform from 4 point pairs (src -> dst), as a 3x3 matrix with h33 = 1
function scHomography(src, dst) {
  const A = [], bv = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bv.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bv.push(v); }
  for (let c = 0; c < 8; c++) {
    let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [bv[c], bv[piv]] = [bv[piv], bv[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bv[r] -= f * bv[c]; }
  }
  const h = bv.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
const scMap = (H, x, y) => { const z = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z]; };
function scMean(img, H, pts) {
  let s = 0, n = 0;
  for (const [x, y] of pts) { const [u, v] = scMap(H, x, y), X = Math.round(u), Y = Math.round(v); if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue; s += img.g[Y * img.w + X]; n++; }
  return n ? s / n : 255;
}
const scDisk = (x, y, r) => { const p = [[x, y]]; for (const [f, n] of [[0.25, 8], [0.45, 10], [0.64, 12]]) for (let k = 0; k < n; k++) { const a = (2 * k * Math.PI) / n + f; p.push([x + f * r * Math.cos(a), y + f * r * Math.sin(a)]); } return p; };
const scGrid = (x, y, hw, hh, n) => { const p = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) p.push([x - hw + (2 * hw * i) / (n - 1), y - hh + (2 * hh * j) / (n - 1)]); return p; };
function scLevels(img, H) {
  const black = scMean(img, H, scGrid(SH_MARKS[0][0], SH_MARKS[0][1], 2.8, 2.8, 5)) * 0.5 + scMean(img, H, scGrid(SH_MARKS[2][0], SH_MARKS[2][1], 2.8, 2.8, 5)) * 0.5;
  const whitePts = []; for (const x of [23, 27, 31, 35, 181, 185, 189]) for (const y of [11.5, 14, 16.5]) whitePts.push([x, y]);
  return { black, white: scMean(img, H, whitePts) };
}
function scReadCode(img, H) {
  const { black, white } = scLevels(img, H);
  if (white - black < 40) return null;
  // 0.9.5: light can change across the strip in a camera picture, so each square is judged against the blank paper just
  // above it and the corner squares' black, from the left one to the right one.
  const bl = scMean(img, H, scGrid(SH_MARKS[0][0], SH_MARKS[0][1], 2.8, 2.8, 5)), br = scMean(img, H, scGrid(SH_MARKS[1][0], SH_MARKS[1][1], 2.8, 2.8, 5));
  const bits = shCodeCells().map(c => {
    const t = (c.cx - SH_MARKS[0][0]) / (SH_MARKS[1][0] - SH_MARKS[0][0]), b = bl + (br - bl) * t;
    const w = Math.max(scMean(img, H, [[c.cx - 1.2, 9.4], [c.cx, 9.4], [c.cx + 1.2, 9.4], [c.cx, 8.6]]), b + 30);
    return scMean(img, H, scGrid(c.cx, c.cy, 0.9, 1.4, 3)) < (b + w) / 2 ? 1 : 0;
  });
  return { id: shCodeRead(bits), black, white, bits };
}
// one bubble's darkness: 0 = empty paper, 1 = as dark as the corner squares
function scBubble(img, H, b, black, white) {
  const m = scMean(img, H, scDisk(b.x, b.y, b.r));
  const lw = Math.max(scMean(img, H, [[b.x - b.r - 0.7, b.y - 0.8], [b.x - b.r - 0.7, b.y], [b.x - b.r - 0.7, b.y + 0.8]]), black + (white - black) * 0.7);
  return Math.max(0, Math.min(1, (Math.min(white, lw) - m) / Math.max(30, Math.min(white, lw) - black)));
}
function scReadBubbles(img, H, layout, black, white) {
  const answers = [], flags = [], vals = [];
  layout.items.forEach((it, i) => {
    const v = it.choices.map(c => scBubble(img, H, { x: c.bx, y: c.by, r: c.r }, black, white)); vals.push(v);
    const order = v.map((x, k) => [x, k]).sort((a, b) => b[0] - a[0]), [top, k1] = order[0], second = order[1] ? order[1][0] : 0, rest = order[2] ? order[2][0] : 0;
    // judge each answer against its own other bubbles: a light but clear mark counts; two similar marks do not
    if (top < SC_MIN) { answers.push("-"); flags.push({ item: i, kind: "blank" }); return; }
    if (second >= SC_MIN && second > top * SC_TWO && second > rest * SC_RATIO) { answers.push("*"); flags.push({ item: i, kind: "two" }); return; }
    answers.push("ABCD"[k1]);
    const clear = top >= SC_RATIO * Math.max(second, 0.04);
    if (top < SC_FILL && !(clear && top >= SC_LIGHT)) flags.push({ item: i, kind: "light" });
    else if (second >= Math.max(SC_LIGHT, top * 0.4)) flags.push({ item: i, kind: "erased" });
  });
  return { answers: answers.join(""), flags, vals };
}
// Read one page. lookup(id) returns the sheet spec (with layout), or null if Odin does not know that sheet number.
// 0.9.5: first the scanner's way of finding the corner squares, then the camera's (scFindMarksCam); opt.camera: only the camera's.
function scReadPage(img, lookup, forceId, opt = {}) {
  let last = { ok: false, reason: "marks" };
  for (const find of opt.camera ? [scFindMarksCam] : [scFindMarks, scFindMarksCam]) {
    const marks = find(img.g, img.w, img.h);
    if (!marks) continue;
    const r = scReadMarked(img, marks, lookup, forceId);
    if (r.ok || r.reason === "unknown") return r;
    last = r;
  }
  return last;
}
function scReadMarked(img, marks, lookup, forceId) {
  let hit = null, guess = null;
  const want = forceId ? shCodeBits(forceId) : null;
  for (let k = 0; k < 4 && !hit; k++) {
    const H = scHomography(SH_MARKS, SH_MARKS.map((_, i) => marks[(i + k) % 4]));
    if (!H) continue;
    const code = scReadCode(img, H);
    if (!code) continue;
    if (code.id && (!forceId || code.id === forceId)) hit = { H, code, rotation: k };
    else if (want) { const agree = code.bits.filter((b, i) => b === want[i]).length; if (!guess || agree > guess.agree) guess = { H, code, rotation: k, agree }; }
  }
  if (!hit && guess) hit = guess;   // the teacher typed the sheet number: use the best-matching rotation
  if (!hit) return { ok: false, reason: "code", marks };
  const id = forceId || hit.code.id, spec = lookup(id);
  if (!spec) return { ok: false, reason: "unknown", id, H: hit.H };
  const r = scReadBubbles(img, hit.H, spec.layout, hit.code.black, hit.code.white);
  return { ok: true, id, spec, H: hit.H, rotation: hit.rotation, answers: r.answers, flags: r.flags, vals: r.vals };
}

// ---------- a stand-in scan for the demo and the tests: the sheet drawn as an imperfect page image ----------
// Draws the corner squares, sheet code, bubble outlines, text as gray bars and pencil marks for the given answers,
// then rotates, scales, shifts and adds noise, the way a feed scanner might.
function scSynth(spec, answers, opt = {}) {
  const ppm = opt.ppm || 4.5, W = Math.round(SH_PAGE.w * ppm), Hh = Math.round(SH_PAGE.h * ppm), P = new Uint8Array(W * Hh).fill(246), L = spec.layout;
  const R = seeded("synth|" + spec.id + "|" + (opt.seed || 0));
  const rect = (x, y, w, h, v) => { for (let j = Math.max(0, Math.round(y * ppm)); j < Math.min(Hh, Math.round((y + h) * ppm)); j++) for (let i = Math.max(0, Math.round(x * ppm)); i < Math.min(W, Math.round((x + w) * ppm)); i++) P[j * W + i] = Math.min(P[j * W + i], v); };
  const disk = (cx, cy, r, v, ring) => { for (let j = Math.floor((cy - r - 1) * ppm); j <= Math.ceil((cy + r + 1) * ppm); j++) for (let i = Math.floor((cx - r - 1) * ppm); i <= Math.ceil((cx + r + 1) * ppm); i++) {
      if (i < 0 || j < 0 || i >= W || j >= Hh) continue; const d = Math.hypot(i / ppm - cx, j / ppm - cy); if (ring ? Math.abs(d - r) < 0.2 : d <= r) P[j * W + i] = Math.min(P[j * W + i], v); } };
  SH_MARKS.forEach(([x, y]) => rect(x - SH_MARK / 2, y - SH_MARK / 2, SH_MARK, SH_MARK, 22));
  const bits = shCodeBits(spec.id); shCodeCells().forEach((c, i) => { if (bits[i]) rect(c.x, c.y, c.w, c.h, 22); });
  rect(14, 19.5, 90, 4, 150); rect(14, 27, 120, 2.6, 175); rect(14, 33.5, 140, 2.2, 190);
  if (L.passage) for (let k = 0; k < L.passage.lines.length; k++) rect(L.passage.x + 4, L.passage.y + 7 + k * L.passage.lh, Math.min(L.passage.w - 8, L.passage.lines[k].length * shCharW(L.passage.pt)), L.passage.lh * 0.55, 175);
  L.items.forEach((it, i) => {
    it.stem.lines.forEach((ln, k) => rect(it.stem.x, it.stem.y + k * it.lh + 0.6, Math.min(it.stem.w, ln.length * shCharW(it.pt)), it.lh * 0.55, 170));
    if (it.fig && it.fig.h > 2) rect(it.fig.x, it.fig.y, Math.min(30, it.fig.w), it.fig.h, 215);
    it.choices.forEach((c, k) => {
      disk(c.bx, c.by, c.r, 60, true); rect(c.bx - 0.6, c.by - 0.9, 1.2, 1.8, 190); rect(c.bx + c.r + 2, c.by - 1.2, Math.min(c.w - 2 * c.r - 4, c.text.length * shCharW(it.pt)), 2.4, 170);
      const a = answers[i];
      if (a === "ABCD"[k] || (a === "*" && k < 2)) disk(c.bx + (R() - 0.5) * 0.6, c.by + (R() - 0.5) * 0.6, c.r * (0.8 + R() * 0.15), opt.light ? 150 : 70 + Math.floor(R() * 40), false);
    });
  });
  // scanner geometry: rotation, scale, offset, then noise
  const dpm = opt.dpm || 4, OW = Math.round(SH_PAGE.w * dpm * 1.04), OH = Math.round(SH_PAGE.h * dpm * 1.03), out = new Uint8Array(OW * OH);
  const th = ((opt.angle != null ? opt.angle : (R() - 0.5) * 3) * Math.PI) / 180, sc = opt.scale || 0.98 + R() * 0.03, ox = opt.dx != null ? opt.dx : 2 + R() * 4, oy = opt.dy != null ? opt.dy : 2 + R() * 4, flip = !!opt.upsideDown;
  const cs = Math.cos(th), sn = Math.sin(th), cx = SH_PAGE.w / 2, cy = SH_PAGE.h / 2;
  for (let j = 0; j < OH; j++) for (let i = 0; i < OW; i++) {
    let u = i / dpm - ox - cx * sc, v = j / dpm - oy - cy * sc;
    let x = (cs * u + sn * v) / sc + cx, y = (-sn * u + cs * v) / sc + cy;
    if (flip) { x = SH_PAGE.w - x; y = SH_PAGE.h - y; }
    const X = Math.round(x * ppm), Y = Math.round(y * ppm);
    const base = X >= 0 && Y >= 0 && X < W && Y < Hh ? P[Y * W + X] : 252;
    out[j * OW + i] = Math.max(0, Math.min(255, base + Math.round((R() - 0.5) * (opt.noise != null ? opt.noise : 18))));
  }
  return { g: out, w: OW, h: OH };
}

// ---------- files: JPEG and PNG images, and scanner PDFs (one image per page) ----------
function scPdfImages(bytes) {
  let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  const out = [], objAt = {}, rx = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = rx.exec(s))) objAt[m[1]] = m.index + m[0].length;
  const dictEnd = i => { let depth = 0; for (let k = i; k < s.length - 1; k++) { if (s[k] === "<" && s[k + 1] === "<") { depth++; k++; } else if (s[k] === ">" && s[k + 1] === ">") { depth--; k++; if (!depth) return k + 1; } } return -1; };
  const num = (d, key) => { const mm = d.match(new RegExp("/" + key + "\\s+(\\d+)(\\s+\\d+\\s+R)?")); if (!mm) return null; if (!mm[2]) return Number(mm[1]); const at = objAt[mm[1]]; if (at == null) return null; const v = s.slice(at, at + 40).match(/^\s*(\d+)/); return v ? Number(v[1]) : null; };
  for (const id of Object.keys(objAt)) {
    let i = objAt[id]; while (/\s/.test(s[i])) i++;
    if (s[i] !== "<" || s[i + 1] !== "<") continue;
    const e = dictEnd(i); if (e < 0) continue;
    const d = s.slice(i, e);
    if (!/\/Subtype\s*\/Image/.test(d)) continue;
    let k = e; while (/\s/.test(s[k])) k++;
    if (s.slice(k, k + 6) !== "stream") continue;
    k += 6; if (s[k] === "\r") k++; if (s[k] === "\n") k++;
    let len = num(d, "Length"); if (len == null || k + len > s.length) { const end = s.indexOf("endstream", k); len = end - k; }
    const filters = (d.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [, ""])[1].match(/\/\w+/g) || [];
    const cs = /\/DeviceRGB/.test(d) ? 3 : /\/DeviceCMYK/.test(d) ? 4 : /\/DeviceGray/.test(d) ? 1 : (() => { const r = d.match(/\/ColorSpace\s*\[\s*\/ICCBased\s+(\d+)\s+\d+\s+R/) || d.match(/\/ColorSpace\s+(\d+)\s+\d+\s+R/); if (!r) return 0; const at = objAt[r[1]]; const t = at != null ? s.slice(at, at + 400) : ""; const n = t.match(/\/N\s+(\d)/); return n ? Number(n[1]) : /DeviceRGB/.test(t) ? 3 : /DeviceGray/.test(t) ? 1 : 0; })();
    out.push({ w: num(d, "Width"), h: num(d, "Height"), bpc: num(d, "BitsPerComponent") || 8, comps: cs, filters: filters.map(f => f.slice(1)), predictor: num(d, "Predictor") || 1, decodeInv: /\/Decode\s*\[\s*1\s+0/.test(d), data: bytes.subarray(k, k + len) });
  }
  return out.filter(x => x.w >= 300 && x.h >= 300);
}
function scUnpredict(raw, w, bpp, rowBytes) {
  const rows = Math.floor(raw.length / (rowBytes + 1)), out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const ft = raw[r * (rowBytes + 1)], src = r * (rowBytes + 1) + 1, dst = r * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? out[dst + i - bpp] : 0, b = r ? out[dst - rowBytes + i] : 0, c = r && i >= bpp ? out[dst - rowBytes + i - bpp] : 0, x = raw[src + i];
      out[dst + i] = (ft === 1 ? x + a : ft === 2 ? x + b : ft === 3 ? x + ((a + b) >> 1) : ft === 4 ? x + (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })() : x) & 255;
    }
  }
  return out;
}
function scToGray(rgba, w, h) { const g = new Uint8Array(w * h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000; return g; }
async function scBitmapToImg(bmp) {
  const k = Math.min(1, 2600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h);
  return { g: scToGray(cx.getImageData(0, 0, w, h).data, w, h), w, h };
}
async function scInflate(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot open compressed PDF images");
  const ds = new DecompressionStream("deflate"), buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
async function scLoadFile(file) {
  const name = file.name || "scan", type = (file.type || "").toLowerCase();
  if (type === "application/pdf" || /\.pdf$/i.test(name)) {
    const imgs = scPdfImages(new Uint8Array(await file.arrayBuffer()));
    if (!imgs.length) throw new Error("no scanned pages found in this PDF");
    const pages = [];
    for (const im of imgs) {
      const f = im.filters;
      if (f.some(x => /CCITT|JBIG2/.test(x))) throw new Error("this PDF stores pages in black-and-white fax format. Set the scanner to grayscale or color and scan again");
      if (f.includes("JPXDecode")) throw new Error("this PDF uses JPEG 2000. Set the scanner to save JPEG or standard PDF");
      let data = im.data;
      if (f[0] === "FlateDecode") data = await scInflate(data);
      if (f.includes("DCTDecode")) { pages.push(await scBitmapToImg(await createImageBitmap(new Blob([data], { type: "image/jpeg" })))); continue; }
      const comps = im.comps || 1, rowBytes = Math.ceil((im.w * comps * im.bpc) / 8);
      if (im.predictor >= 10) data = scUnpredict(data, im.w, Math.max(1, (comps * im.bpc) >> 3), rowBytes);
      const g = new Uint8Array(im.w * im.h);
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        let v;
        if (im.bpc === 1) { const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1; v = (bit ^ (im.decodeInv ? 1 : 0)) ? 255 : 0; }
        else if (comps === 1) v = data[y * rowBytes + x];
        else if (comps === 3) { const o = y * rowBytes + x * 3; v = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000; }
        else { const o = y * rowBytes + x * 4; v = 255 - Math.min(255, (data[o] * 30 + data[o + 1] * 59 + data[o + 2] * 11) / 100 + data[o + 3]); }
        g[y * im.w + x] = v;
      }
      pages.push(scShrink({ g, w: im.w, h: im.h }));
    }
    return pages;
  }
  if (/image\/(jpeg|png|webp|bmp|gif)/.test(type) || /\.(jpe?g|png|webp|bmp)$/i.test(name)) return [await scBitmapToImg(await createImageBitmap(file))];
  if (/tiff?$/.test(type) || /\.tiff?$/i.test(name)) throw new Error("TIFF files can't be opened in the browser. Set the scanner to save PDF, JPEG or PNG");
  throw new Error("not a PDF, JPEG or PNG file");
}
function scShrink(img) { if (Math.max(img.w, img.h) <= 2600) return img; const d = scDownscale(img.g, img.w, img.h, 2600); return { g: d.g, w: d.w, h: d.h }; }
// small pictures for review: the whole page, or one question's answer bubbles
function scPicture(img, box, H, maxW) {
  if (typeof document === "undefined") return "";
  let x0 = 0, y0 = 0, x1 = img.w, y1 = img.h;
  if (box && H) { const pts = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(([x, y]) => scMap(H, x, y)); x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])))); x1 = Math.min(img.w, Math.ceil(Math.max(...pts.map(p => p[0])))); y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1])))); y1 = Math.min(img.h, Math.ceil(Math.max(...pts.map(p => p[1])))); }
  const sw = x1 - x0, sh = y1 - y0; if (sw < 2 || sh < 2) return "";
  const k = Math.min(1, maxW / sw), W = Math.max(1, Math.round(sw * k)), Hh = Math.max(1, Math.round(sh * k)), cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
  const cx = cv.getContext("2d"), id = cx.createImageData(W, Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const v = img.g[Math.min(img.h - 1, y0 + Math.floor(j / k)) * img.w + Math.min(img.w - 1, x0 + Math.floor(i / k))], o = (j * W + i) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255; }
  cx.putImageData(id, 0, 0);
  return cv.toDataURL("image/jpeg", 0.75);
}
if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { scFindMarks, scFindMarksCam, scReadMarked, scHomography, scMap, scReadPage, scReadCode, scSynth, scPdfImages, scUnpredict, scOtsu });
