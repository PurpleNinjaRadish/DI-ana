// ---------- PDF: Odin writes its own PDF files (0.9.4) ----------
// A small, dependency-free PDF writer, so the school server (offline), the demo and the online preview can all save a sheet
// as a PDF. Vector only: rectangles, lines, circles, curves and text in the standard PDF fonts (Helvetica, Helvetica-Bold,
// Helvetica-Oblique, Courier), which every PDF reader has, so nothing is embedded. Coordinates are millimetres from the
// top-left of a US Letter page, the same as Odin's printed sheets (sheets.js), so a printed PDF scans like a printed sheet.
// Widths of Helvetica and Helvetica-Bold for WinAnsi codes 32-255 (from the Adobe font metrics), for wrapping and centring.
const PDF_WIDTHS = {
  R: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,278,222,556,333,1000,556,556,333,1000,667,333,1000,278,611,278,278,222,222,333,333,350,556,1000,333,1000,500,333,944,278,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  B: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,278,278,556,500,1000,556,556,333,1000,667,333,1000,278,611,278,278,278,278,500,500,350,556,1000,333,1000,556,333,944,278,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]
};
const PDF_PAGE = { w: 215.9, h: 279.4 }, PDF_K = 72 / 25.4;
// Unicode to WinAnsi for the characters Odin's sheets use beyond Latin-1 (quotes, dashes, the bullet...); anything else is "?".
const PDF_WIN = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142,
  0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159,
  0x2212: 45, 0x00D7: 215, 0x00F7: 247, 0x2264: 60, 0x2265: 62, 0x2192: 62, 0x2190: 60, 0x2715: 120, 0x2713: 118 };
function pdfCode(ch) { const c = ch.codePointAt(0); if (c >= 32 && c < 127) return c; if (c >= 160 && c <= 255) return c; return PDF_WIN[c] || (c === 9 ? 32 : 63); }
const PDF_FONT = { R: "F1", B: "F2", I: "F3", M: "F4" };
// Width of a string in millimetres at a font size in points. f: R (regular), B (bold), I (italic: Helvetica's widths), M (Courier).
function pdfWidth(s, f, pt) {
  let u = 0;
  for (const ch of String(s)) u += f === "M" ? 600 : (f === "B" ? PDF_WIDTHS.B : PDF_WIDTHS.R)[pdfCode(ch) - 32] || 556;
  return (u / 1000) * pt * 25.4 / 72;
}
// Wraps text into lines that fit widthMm (words longer than a line are broken). Keeps line breaks ("\n").
function pdfWrap(text, f, pt, widthMm) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    let cur = "";
    for (let w of para.split(/ +/)) {
      while (pdfWidth(w, f, pt) > widthMm && w.length > 1) {   // a very long word: break it
        let k = w.length - 1; while (k > 1 && pdfWidth(w.slice(0, k), f, pt) > widthMm) k--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      const t = cur ? cur + " " + w : w;
      if (cur && pdfWidth(t, f, pt) > widthMm) { lines.push(cur); cur = w; } else cur = t;
    }
    lines.push(cur);
  }
  return lines;
}
// Shortens one line with "…" so it fits widthMm.
function pdfFit(s, f, pt, widthMm) {
  s = String(s); if (pdfWidth(s, f, pt) <= widthMm) return s;
  while (s.length > 1 && pdfWidth(s + "…", f, pt) > widthMm) s = s.slice(0, -1);
  return s.replace(/\s+$/, "") + "…";
}
function pdfColor(c) {   // "#333" or "#d0d0d0" to "r g b" (0-1); null for none
  if (!c || c === "none" || c === "transparent") return null;
  let h = String(c).trim().replace("#", "");
  if (h === "black") h = "000"; if (h === "white") h = "fff";
  if (h.length === 3) h = h.split("").map(x => x + x).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "0 0 0";
  return [0, 2, 4].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
}
class OdinPdf {
  constructor(title) { this.title = title || "Odin"; this.pages = []; this.ops = null; }
  page() { this.ops = []; this.pages.push(this.ops); return this; }
  // ----- coordinates: mm from the top-left to PDF points from the bottom-left
  X(x) { return (x * PDF_K).toFixed(2); }
  Y(y) { return ((PDF_PAGE.h - y) * PDF_K).toFixed(2); }
  L(v) { return (v * PDF_K).toFixed(3); }
  op(s) { this.ops.push(s); return this; }
  style(o) {   // o: { fill, stroke, lw (mm), cap }
    const f = pdfColor(o.fill), s = pdfColor(o.stroke);
    if (f) this.op(f + " rg"); if (s) this.op(s + " RG");
    this.op(this.L(o.lw != null ? o.lw : 0.3) + " w"); this.op((o.cap === "round" ? 1 : 0) + " J"); this.op((o.join === "round" ? 1 : 0) + " j");
    return f && s ? "B" : f ? "f" : s ? "S" : "n";
  }
  rect(x, y, w, h, o = {}) {
    this.op("q"); const paint = this.style(o), r = Math.min(o.r || 0, w / 2, h / 2);
    if (r > 0) { this.path(this.roundRect(x, y, w, h, r)); this.op(paint); }
    else this.op(`${this.X(x)} ${this.Y(y + h)} ${this.L(w)} ${this.L(h)} re ${paint}`);
    this.op("Q"); return this;
  }
  roundRect(x, y, w, h, r) {
    const k = 0.5523 * r;
    return [["M", x + r, y], ["L", x + w - r, y], ["C", x + w - r + k, y, x + w, y + r - k, x + w, y + r], ["L", x + w, y + h - r], ["C", x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
      ["L", x + r, y + h], ["C", x + r - k, y + h, x, y + h - r + k, x, y + h - r], ["L", x, y + r], ["C", x, y + r - k, x + r - k, y, x + r, y], ["Z"]];
  }
  ellipse(cx, cy, rx, ry, o = {}) {
    const kx = 0.5523 * rx, ky = 0.5523 * ry;
    this.op("q"); const paint = this.style(o);
    this.path([["M", cx + rx, cy], ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy], ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ["Z"]]);
    this.op(paint).op("Q"); return this;
  }
  circle(cx, cy, r, o = {}) { return this.ellipse(cx, cy, r, r, o); }
  line(x1, y1, x2, y2, o = {}) { this.op("q"); this.style({ stroke: o.stroke || "#000", lw: o.lw, cap: o.cap }); this.op(`${this.X(x1)} ${this.Y(y1)} m ${this.X(x2)} ${this.Y(y2)} l S Q`); return this; }
  // A path in mm: [["M", x, y], ["L", x, y], ["C", x1, y1, x2, y2, x, y], ["Z"]], painted with o.
  path(segs, o) {
    const s = segs.map(([c, ...v]) => c === "Z" ? "h" : c === "M" ? `${this.X(v[0])} ${this.Y(v[1])} m` : c === "L" ? `${this.X(v[0])} ${this.Y(v[1])} l`
      : `${this.X(v[0])} ${this.Y(v[1])} ${this.X(v[2])} ${this.Y(v[3])} ${this.X(v[4])} ${this.Y(v[5])} c`).join(" ");
    if (!o) { this.op(s); return this; }
    this.op("q"); const paint = this.style(o); this.op(s).op(paint).op("Q"); return this;
  }
  // Text with its baseline at y. o: { f: R|B|I|M, pt, color, align: left|center|right, spacing (mm) }
  text(x, y, s, o = {}) {
    s = String(s == null ? "" : s); if (!s) return this;
    const f = o.f || "R", pt = o.pt || 11, w = pdfWidth(s, f, pt) + (o.spacing ? o.spacing * (s.length - 1) : 0);
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    let bytes = ""; for (const ch of s) { const c = pdfCode(ch); bytes += c === 40 || c === 41 || c === 92 ? "\\" + String.fromCharCode(c) : String.fromCharCode(c); }
    // Letter spacing (Tc) stays set after ET, so text with spacing is wrapped in q ... Q to keep it off the text after it.
    this.op(`${o.spacing ? "q " : ""}BT /${PDF_FONT[f]} ${pt.toFixed(2)} Tf ${pdfColor(o.color || "#000")} rg ${o.spacing ? this.L(o.spacing) + " Tc " : ""}${this.X(x0)} ${this.Y(y)} Td (${bytes}) Tj ET${o.spacing ? " Q" : ""}`);
    return this;
  }
  // The baseline that centres a line of text (cap height) in a box from top to top + h.
  static mid(top, h, pt) { return top + h / 2 + 0.35 * pt * 25.4 / 72; }
  // A paragraph of runs ([text, font, color]) wrapped to width w, its first line's top at `top`. Returns the number of lines.
  // o: { pt, lh (mm), color, dry (measure only) }. Runs that touch with no space between them never split across lines.
  para(x, top, w, runs, o = {}) {
    const pt = o.pt || 11, lh = o.lh || pt * 0.3528 * 1.3, units = [];
    let gap = false, br = false;
    for (const [t, f, c] of runs) for (const p of String(t == null ? "" : t).split(/(\s+)/)) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { gap = true; if (p.includes("\n")) br = true; continue; }
      const part = { t: p, f: f || "R", c: c || o.color || "#000" };
      if (units.length && !gap) units[units.length - 1].parts.push(part); else units.push({ parts: [part], br });
      gap = br = false;
    }
    const sp = pdfWidth(" ", "R", pt), lines = [[]];
    let cur = 0;
    for (const u of units) {
      u.w = u.parts.reduce((a, p) => a + pdfWidth(p.t, p.f, pt), 0);
      const line = lines[lines.length - 1];
      if (line.length && (u.br || cur + sp + u.w > w)) { lines.push([u]); cur = u.w; }
      else { cur += (line.length ? sp : 0) + u.w; line.push(u); }
    }
    if (!o.dry) lines.forEach((line, i) => {
      const y = OdinPdf.mid(top + i * lh, lh, pt); let cx = x;
      line.forEach((u, k) => { if (k) cx += sp; u.parts.forEach(p => { this.text(cx, y, p.t, { f: p.f, pt, color: p.c }); cx += pdfWidth(p.t, p.f, pt); }); });
    });
    return units.length ? lines.length : 0;
  }
  // Draws an SVG (Odin's figures: rect, line, circle, ellipse, polygon, polyline, path with M L H V A Z, text) into a box in mm.
  svg(markup, x, y, wmm, hmm) {
    let doc; try { doc = new DOMParser().parseFromString(markup, "image/svg+xml"); } catch (e) { return this; }
    const root = doc.documentElement; if (!root || root.nodeName !== "svg") return this;
    const vb = (root.getAttribute("viewBox") || "0 0 100 100").split(/[\s,]+/).map(Number), sx = wmm / vb[2], sy = hmm / vb[3], s = Math.min(sx, sy);
    const P = (px, py) => [x + (px - vb[0]) * s, y + (py - vb[1]) * s];
    const num = (el, a, d = 0) => { const v = parseFloat(el.getAttribute(a)); return isNaN(v) ? d : v; };
    const paint = el => ({ fill: el.getAttribute("fill") == null ? "#000" : el.getAttribute("fill"), stroke: el.getAttribute("stroke"), lw: num(el, "stroke-width", 1) * s, cap: el.getAttribute("stroke-linecap") });
    for (const el of root.querySelectorAll("*")) {
      const t = el.nodeName;
      if (t === "rect") { const [px, py] = P(num(el, "x"), num(el, "y")); this.rect(px, py, num(el, "width") * s, num(el, "height") * s, { ...paint(el), r: num(el, "rx") * s }); }
      else if (t === "circle") { const [cx, cy] = P(num(el, "cx"), num(el, "cy")); this.circle(cx, cy, num(el, "r") * s, paint(el)); }
      else if (t === "ellipse") { const [cx, cy] = P(num(el, "cx"), num(el, "cy")); this.ellipse(cx, cy, num(el, "rx") * s, num(el, "ry") * s, paint(el)); }
      else if (t === "line") { const [x1, y1] = P(num(el, "x1"), num(el, "y1")), [x2, y2] = P(num(el, "x2"), num(el, "y2")); this.line(x1, y1, x2, y2, { stroke: el.getAttribute("stroke") || "#000", lw: num(el, "stroke-width", 1) * s, cap: el.getAttribute("stroke-linecap") }); }
      else if (t === "polygon" || t === "polyline") {
        const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number), segs = [];
        for (let i = 0; i + 1 < pts.length; i += 2) segs.push([i ? "L" : "M", ...P(pts[i], pts[i + 1])]);
        if (t === "polygon") segs.push(["Z"]);
        this.path(segs, paint(el));
      }
      else if (t === "path") this.path(pdfSvgPath(el.getAttribute("d") || "", P, s), paint(el));
      else if (t === "text") {
        const [tx, ty] = P(num(el, "x"), num(el, "y")), pt = num(el, "font-size", 3) * s * 72 / 25.4, anchor = el.getAttribute("text-anchor");
        this.text(tx, ty, el.textContent, { f: Number(el.getAttribute("font-weight")) >= 600 ? "B" : "R", pt, color: el.getAttribute("fill") || "#000", align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left" });
      }
    }
    return this;
  }
  // ----- the file
  bytes() {
    const objs = [], add = s => { objs.push(s); return objs.length; };
    const cat = add(null), pages = add(null);
    const fonts = [["F1", "Helvetica"], ["F2", "Helvetica-Bold"], ["F3", "Helvetica-Oblique"], ["F4", "Courier"]].map(([n, b]) => [n, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${b} /Encoding /WinAnsiEncoding >>`)]);
    const res = `<< /Font << ${fonts.map(([n, i]) => `/${n} ${i} 0 R`).join(" ")} >> >>`;
    const kids = this.pages.map(ops => { const body = ops.join("\n"), c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      return add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources ${res} /Contents ${c} 0 R >>`); });
    objs[cat - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
    objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
    const lit = s => "(" + Array.from(String(s), ch => { const c = pdfCode(ch); return c === 40 || c === 41 || c === 92 ? "\\" + String.fromCharCode(c) : String.fromCharCode(c); }).join("") + ")";
    const info = add(`<< /Title ${lit(this.title)} /Producer (Odin) /Creator (Odin ${typeof ODIN_VERSION === "string" ? ODIN_VERSION : ""}) >>`);
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const at = [];
    objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
    return b;
  }
}
// SVG path data (M L H V A Z, absolute and relative) to the writer's segments in mm. Arcs become cubic curves.
function pdfSvgPath(d, P, s) {
  const toks = String(d).match(/[MLHVAZCmlhvazc]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], segs = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "";
  const n = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === "Z") { segs.push(["Z"]); cx = sx; cy = sy; continue; }
    if (C === "M" || C === "L") { let x = n(), y = n(); if (rel) { x += cx; y += cy; } segs.push([C, ...P(x, y)]); cx = x; cy = y; if (C === "M") { sx = x; sy = y; cmd = rel ? "l" : "L"; } }
    else if (C === "H") { let x = n(); if (rel) x += cx; segs.push(["L", ...P(x, cy)]); cx = x; }
    else if (C === "V") { let y = n(); if (rel) y += cy; segs.push(["L", ...P(cx, y)]); cy = y; }
    else if (C === "C") { const v = [n(), n(), n(), n(), n(), n()]; if (rel) for (let k = 0; k < 6; k++) v[k] += k % 2 ? cy : cx; segs.push(["C", ...P(v[0], v[1]), ...P(v[2], v[3]), ...P(v[4], v[5])]); cx = v[4]; cy = v[5]; }
    else if (C === "A") {
      const rx0 = n(), ry0 = n(), rot = n(), large = n(), sweep = n(); let x = n(), y = n(); if (rel) { x += cx; y += cy; }
      for (const c of pdfArc(cx, cy, rx0, ry0, rot, large, sweep, x, y)) segs.push(["C", ...P(c[0], c[1]), ...P(c[2], c[3]), ...P(c[4], c[5])]);
      cx = x; cy = y;
    } else i++;
  }
  return segs;
}
// An SVG arc as cubic Bézier curves (endpoint to centre form, then quarter-turn pieces).
function pdfArc(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (rotDeg * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cs * dx + sn * dy, yp = -sn * dx + cs * dy;
  rx = Math.abs(rx); ry = Math.abs(ry); const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = large === sweep ? -1 : 1, num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  const co = sign * Math.sqrt(Math.max(0, num / den)), cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2, cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry), dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2)), d = dt / segs, out = [], k = (4 / 3) * Math.tan(d / 4);
  const pt = t => [cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs];
  const der = t => [-rx * Math.sin(t) * cs - ry * Math.cos(t) * sn, -rx * Math.sin(t) * sn + ry * Math.cos(t) * cs];
  for (let j = 0; j < segs; j++) {
    const a = t1 + j * d, b = a + d, p0 = pt(a), p3 = pt(b), d0 = der(a), d3 = der(b);
    out.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
  }
  return out;
}
