// ===== Odin 0.9.5: one practice sheet as a PDF page (pdf.js), drawn from the same millimetre layout as the printed page =====
// Shared by Odin (Save as PDF) and DI-ana (its demo's sample sheets), so a sheet from either scans the same way.
// o.names: print the student's name (otherwise their code); o.week: the week as words, such as "Oct 5–9, 2026".
// 0.10: sheets from a set (a test, a practice sheet or a worksheet's answer sheet) and a set's answer key sheet, which has
// the right answers filled in when they're known, and empty bubbles for the teacher to fill in when they aren't.
function shPdfSheetPage(doc, rec, cls, o = {}) {
  const sp = shBuildSheet(rec), L = sp.layout, bits = shCodeBits(rec.id), s = cls.students.find(x => x.code === rec.code) || { code: rec.code, name: rec.code };
  const keyPage = !!sp.keySheet;
  doc.page();
  SH_MARKS.forEach(([x, y]) => doc.rect(x - SH_MARK / 2, y - SH_MARK / 2, SH_MARK, SH_MARK, { fill: "#000" }));
  shCodeCells().forEach((c, i) => { if (bits[i]) doc.rect(c.x, c.y, c.w, c.h, { fill: "#000" }); });
  doc.text(40, 18.9, `Odin sheet ${rec.id} · keep this strip clean`, { f: "M", pt: 6, color: "#555" });
  const wk = `Week of ${o.week || rec.week}`;
  doc.text(14, 25, pdfFit(sp.title, "B", 14, 134), { f: "B", pt: 14 });
  doc.text(201.9, 25, wk, { pt: 9.5, color: "#333", align: "right" });
  // Name: ____  Date: ____            Score: _____ / 8
  const nb = 31.4, gap = 1.6, nm = pdfFit(o.names ? s.name : s.code, "B", 10.5, 62);
  let x = 14;
  if (keyPage) {
    doc.text(14, nb, "For the teacher only", { f: "B", pt: 10.5 });
    doc.text(201.9, nb, `${sp.total} questions${sp.keyKnown ? " · the right answers are filled in" : ""}`, { pt: 10.5, color: "#333", align: "right" });
  } else {
  doc.text(x, nb, "Name:", { pt: 10.5 }); x += pdfWidth("Name: ", "R", 10.5);
  doc.text(x, nb, nm, { f: "B", pt: 10.5 }); x += pdfWidth(nm, "B", 10.5) + gap;
  doc.line(x, nb + 0.3, x + 38, nb + 0.3, { lw: 0.3 }); x += 38 + gap;
  doc.text(x, nb, "Date:", { pt: 10.5 }); x += pdfWidth("Date:", "R", 10.5) + gap;
  doc.line(x, nb + 0.3, x + 26, nb + 0.3, { lw: 0.3 });
  doc.text(201.9, nb, `Score: _____ / ${sp.total}`, { pt: 10.5, color: "#333", align: "right" });
  }
  const dlh = 9.5 * SH_PT * 1.25;
  pdfWrap(sp.directions, "R", 9.5, 187.9).forEach((l, i) => doc.text(14, OdinPdf.mid(33.6 + i * dlh, dlh, 9.5), l, { pt: 9.5, color: "#222" }));
  if (L.passage) {
    const P = L.passage, inner = P.w - 7.6;
    doc.rect(P.x + 0.15, P.y + 0.15, P.w - 0.3, P.h - 0.3, { stroke: "#888", lw: 0.3, r: 2 });
    doc.text(P.x + 3.8, P.y + 5.4, pdfFit(P.title, "B", 10.5, inner), { f: "B", pt: 10.5 });
    const room = Math.max(1, Math.floor((P.h - 7.2 - 1.9) / P.lh + 0.01));
    pdfWrap(sp.passage.text, "R", P.pt, inner).slice(0, room).forEach((l, i) => doc.text(P.x + 3.8, OdinPdf.mid(P.y + 7.2 + i * P.lh, P.lh, P.pt), l, { pt: P.pt }));
  }
  if (L.template === "answers") {   // light lines between columns and every five rows, to keep the place on a long answer sheet
    for (let c = 1; c < L.cols; c++) doc.line(SH_BODY.x0 + c * L.colW - 3, SH_BODY.y0, SH_BODY.x0 + c * L.colW - 3, SH_BODY.y0 + L.rows * L.rowH, { lw: 0.25, stroke: "#bbb" });
    for (let r = 5; r < L.rows; r += 5) doc.line(SH_BODY.x0, SH_BODY.y0 + r * L.rowH, SH_BODY.x1, SH_BODY.y0 + r * L.rowH, { lw: 0.2, stroke: "#ccc" });
  }
  L.items.forEach((it, i) => {
    const item = sp.items[i], r = Math.min(2.6, it.lh * 0.62), npt = Math.max(7, it.pt - 3);
    doc.circle(it.num.x, it.num.y, r - 0.175, { stroke: "#000", lw: 0.35 });
    doc.text(it.num.x, OdinPdf.mid(it.num.y - r, 2 * r, npt), String(it.n), { f: "B", pt: npt, align: "center" });
    // the question, wrapped to its box; a question too long for its box ends with "…" (the layout leaves room, so this is rare)
    const room = Math.max(1, Math.round(it.stem.h / it.lh));
    let lines = pdfWrap(item.stem, "R", it.pt, it.stem.w);
    if (lines.length > room) lines = lines.slice(0, room - 1).concat(pdfFit(lines.slice(room - 1).join(" ") + " …", "R", it.pt, it.stem.w));
    const base = k => OdinPdf.mid(it.stem.y + k * it.lh, it.lh, it.pt);
    lines.forEach((l, k) => doc.text(it.stem.x, base(k), l, { pt: it.pt }));
    if (item.review) {   // a small "review" tag after the question
      const tw = pdfWidth("review", "R", 7.5) + 2, last = lines.length - 1, after = it.stem.x + pdfWidth(lines[last], "R", it.pt) + 1.4;
      const [tx, k] = after + tw <= it.stem.x + it.stem.w || lines.length >= room ? [after, last] : [it.stem.x, last + 1];
      doc.rect(tx, base(k) - 2.75, tw, 3.4, { stroke: "#888", lw: 0.25, r: 1 });
      doc.text(tx + 1, base(k) - 0.15, "review", { pt: 7.5, color: "#555" });
    }
    if (it.hint) {
      const H = it.hint, hlh = H.pt * SH_PT * 1.25, hroom = Math.max(1, Math.round(H.h / hlh));
      let hl = pdfWrap("Hint: " + item.hint, "I", H.pt, H.w);
      if (hl.length > hroom) hl = hl.slice(0, hroom - 1).concat(pdfFit(hl.slice(hroom - 1).join(" "), "I", H.pt, H.w));
      hl.forEach((l, k) => doc.text(H.x, OdinPdf.mid(H.y + k * hlh, hlh, H.pt), l, { f: "I", pt: H.pt, color: "#333" }));
    }
    if (it.fig && it.fig.h > 2) doc.svg(shFig(item.fig, it.fig.w, it.fig.h), it.fig.x, it.fig.y, it.fig.w, it.fig.h);
    it.choices.forEach((c, k) => {
      const bpt = (c.r * 1.05) / SH_PT, tx = c.bx + c.r + 1.6, tw = c.w - (c.bx - c.x) - c.r - 1.8;
      if (keyPage && item.key === k) doc.circle(c.bx, c.by, c.r - 0.175, { fill: "#222", stroke: "#222", lw: 0.35 });   // the key: filled, so scanning this sheet reads it
      else {
        doc.circle(c.bx, c.by, c.r - 0.175, { stroke: "#222", lw: 0.35 });
        doc.text(c.bx, OdinPdf.mid(c.by - c.r, 2 * c.r, bpt), c.letter, { f: "B", pt: bpt, color: "#b4b4b4", align: "center" });
      }
      if (!c.text) return;
      if (c.lines > 1) {
        const clh = it.pt * SH_PT * 1.15; let cl = pdfWrap(c.text, "R", it.pt, tw);
        if (cl.length > 2) cl = [cl[0], pdfFit(cl.slice(1).join(" "), "R", it.pt, tw)];
        const top = c.y + (c.h - cl.length * clh) / 2;
        cl.forEach((l, k) => doc.text(tx, OdinPdf.mid(top + k * clh, clh, it.pt), l, { pt: it.pt }));
      } else doc.text(tx, OdinPdf.mid(c.y, c.h, it.pt), pdfFit(c.text, "R", it.pt, tw), { pt: it.pt });
    });
  });
  const foot = pdfWrap(`${keyPage ? "Answer key: scan it with the students' sheets, or keep it to check by hand." : "Fill in bubbles completely with a pencil. Erase cleanly to change an answer."} Do not write on the black squares. · ${cls.teacher} · Room ${cls.room}`, "R", 7, 164);
  foot.slice(0, 2).forEach((l, k) => doc.text(108, OdinPdf.mid(261.6 + k * 2.9, 2.9, 7), l, { pt: 7, color: "#555", align: "center" }));
}

if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { shPdfSheetPage });
