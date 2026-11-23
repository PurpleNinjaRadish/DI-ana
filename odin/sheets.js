// ===== Odin 0.4: individual practice sheets and checks =====
// Each week a student with a focus skill gets four answer sheets plus a lesson:
//   pre-check (Monday) · Learn it + practice 1 (guided, with hints) · practice 2 (on their own, plus review of the secondary need) · post-check (Friday)
// The sheets target the student's focus skill at their working level, weighted toward the benchmarks they missed.
// A sheet is rebuilt exactly from its record (student, skill, level band, week, kind, concepts, review skill), so printing,
// student mode and the scan reader all see the same questions and the same bubble positions.
const SHEET_GEN = 1;
const SH_PAGE = { w: 215.9, h: 279.4 };                                  // US Letter, in millimetres
const SH_MARK = 10;                                                       // corner squares, mm
const SH_MARKS = [[14, 14], [201.9, 14], [201.9, 265.4], [14, 265.4]];   // centres: top-left, top-right, bottom-right, bottom-left
const SH_CODE = { x0: 40, cy: 14, w: 3.6, h: 5, pitch: 4, n: 34 };        // 2 start bits + 24-bit sheet number + 8-bit check
const SH_BODY = { x0: 14, x1: 201.9, y0: 41, y1: 257.5 };
const SH_KIND = { pre: "Pre-check", practice: "Practice", post: "Post-check" };
// 0.10: the answer letters. Odin's own sheets use A to D; a worksheet's answer sheet may have up to five choices.
const SH_LETTERS = "ABCDE";
// 0.10: sheets made from a set (kind "set"): a test or practice sheet written with AI, or the answer sheet for a printed
// worksheet. rec.custom holds what the sheet shows: { set, setKind: "test" | "practice" | "worksheet", title, subject,
// items: [{ stem, choices: [..] }] and an optional passage { title, text }, or answers: [number of choices per question],
// keySheet: true for the teacher's answer key }. rec.key holds the answer key, with "?" where it isn't known yet.
const SH_SET_KIND = { test: "Test", practice: "Practice sheet", worksheet: "Worksheet answers" };
const SH_PASSAGE_SKILLS = ["LIT", "INF", "AG"];
const SH_EPOCH = "2026-01-05";   // a Monday; week numbers rotate passages

// ---------- benchmark -> concepts, so sheets lean toward what a student missed ----------
const SH_MATH_CONCEPTS = {
  "MA.K.NSO.1.1": "count", "MA.K.NSO.1.4": "compare", "MA.K.NSO.2.1": "count", "MA.K.AR.1.1": "facts", "MA.K.AR.1.2": "wordproblems", "MA.K.M.1.1": "measure", "MA.K.GR.1.1": "shapes", "MA.K.DP.1.1": "data",
  "MA.1.NSO.1.1": "count", "MA.1.NSO.1.3": "placevalue", "MA.1.NSO.1.4": "compare", "MA.1.NSO.2.1": "facts", "MA.1.AR.1.2": "wordproblems", "MA.1.M.1.1": "measure", "MA.1.M.2.1": "time", "MA.1.GR.1.1": "shapes", "MA.1.DP.1.1": "data",
  "MA.2.NSO.1.1": "placevalue", "MA.2.NSO.1.3": "compare", "MA.2.NSO.2.1": "facts", "MA.2.NSO.2.3": "addsub", "MA.2.AR.1.1": "wordproblems", "MA.2.M.1.1": "measure", "MA.2.M.2.1": "time", "MA.2.M.2.2": "money", "MA.2.GR.1.1": "shapes", "MA.2.DP.1.1": "data",
  "MA.3.NSO.1.1": "placevalue", "MA.3.NSO.1.3": "compare", "MA.3.NSO.2.1": "addsub", "MA.3.NSO.2.3": "multiply", "MA.3.NSO.2.4": "facts", "MA.3.AR.1.1": "properties", "MA.3.AR.2.2": "equations", "MA.3.GR.2.1": "area",
  "MA.3.FR.1.1": "unitfractions", "MA.3.FR.2.1": "comparefractions", "MA.3.FR.2.2": "equivalent", "MA.3.M.1.1": "measure", "MA.3.GR.1.1": "geometry", "MA.3.DP.1.2": "data",
  "MA.4.NSO.1.2": "placevalue", "MA.4.NSO.1.3": "compare", "MA.4.NSO.1.4": "round", "MA.4.NSO.1.5": "decimals compare", "MA.4.NSO.2.3": "multiply", "MA.4.NSO.2.4": "divide", "MA.4.AR.1.1": "wordproblems", "MA.4.AR.3.1": "factors",
  "MA.4.NSO.2.6": "decimals", "MA.4.FR.1.2": "decimals", "MA.4.FR.1.3": "equivalent", "MA.4.FR.1.4": "comparefractions", "MA.4.FR.2.2": "addfractions", "MA.4.GR.1.2": "angles", "MA.4.GR.2.1": "area", "MA.4.M.1.2": "convert", "MA.4.M.2.1": "time", "MA.4.DP.1.2": "data",
  "MA.5.NSO.1.2": "decimals", "MA.5.NSO.1.4": "compare", "MA.5.NSO.1.5": "round", "MA.5.NSO.2.1": "multiply", "MA.5.NSO.2.2": "divide", "MA.5.NSO.2.3": "decimals", "MA.5.FR.1.1": "fractions", "MA.5.FR.2.1": "addfractions",
  "MA.5.FR.2.2": "multiplyfractions", "MA.5.FR.2.4": "dividefractions", "MA.5.AR.1.1": "wordproblems", "MA.5.AR.2.1": "expressions", "MA.5.AR.2.2": "orderofoperations", "MA.5.AR.3.1": "patterns", "MA.5.GR.1.1": "geometry",
  "MA.5.GR.3.2": "volume", "MA.5.GR.4.1": "coordinates", "MA.5.M.1.1": "convert", "MA.5.DP.1.2": "data"
};
const SH_READ_CONCEPTS = [[/F\.1\.2$/, "phonemes rhyme syllables"], [/F\.1\.3$/, "decode vowels syllables affixes"], [/F\.1\.4$/, "hfw"], [/V\.1\.2$/, "morphology"], [/V\.1\.3$/, "context wordrelations"],
  [/R\.1\.1$/, "elements"], [/R\.1\.2$/, "theme"], [/R\.1\.3$/, "pov"], [/R\.1\.4$/, "poetry"], [/R\.2\.1$/, "structure features"], [/R\.2\.2$/, "central"], [/R\.2\.3$/, "purpose"], [/R\.2\.4$/, "argument"],
  [/R\.3\.1$/, "figurative"], [/R\.3\.3$/, "compare"]];
function shConcepts(subject, codes) {
  const out = [];
  for (const c of codes || []) {
    let v = "";
    if (subject === "math") v = SH_MATH_CONCEPTS[c] || "";
    else if (/R\.3\.2$/.test(c)) v = /^ELA\.[K12]\./.test(c) ? "retell" : "summary";
    else { const m = SH_READ_CONCEPTS.find(([rx]) => rx.test(c)); v = m ? m[1] : ""; }
    v.split(" ").filter(Boolean).forEach(x => { if (!out.includes(x)) out.push(x); });
  }
  return out;
}

// ---------- choosing what a student works on this week ----------
// Uses the weekly focus (primary need, or the secondary need moved up for pre-teaching), the working level in that skill,
// the benchmarks the student missed in that skill, and the other need for review on practice 2.
function shPlanFor(data, subject, code, week) {
  const f = focusFor(data, subject, code, week);
  if (!f.focus) return null;
  const lvlOf = r => (r && r.gl != null ? r.gl : f.p.overall.gl != null ? f.p.overall.gl : data.grade);
  const skill = f.focus.id, level = r1(lvlOf(f.focus)), band = bandOf(level);
  const missed = missedBenchmarks(data, subject, skill, [code]);
  const second = f.second && f.second.id !== skill ? { skill: f.second.id, band: bandOf(lvlOf(f.second)) } : null;
  return { subject, skill, level, band, missed, concepts: shConcepts(subject, missed), second, kind: f.kind };
}
function shRecordsFor(data, subject, code, week, plan) {
  const base = { code, subject, skill: plan.skill, week, band: plan.band, level: plan.level, concepts: plan.concepts.join(" "),
    spiral: plan.second && !SH_PASSAGE_SKILLS.includes(plan.skill) && !SH_PASSAGE_SKILLS.includes(plan.second.skill) ? `${plan.second.skill}@${plan.second.band}` : "",
    gen: SHEET_GEN, status: "ready", right: null, answers: "", source: "", taken: null, created: data.today || "" };
  return [["pre", 0], ["practice", 1], ["practice", 2], ["post", 0]].map(([kind, part]) => ({ ...base, kind, part, total: 0, key: "" }));
}

// ---------- the week's items: one stream per student, skill and week, so the four sheets never repeat a question ----------
const shGroup = b => (b <= 1 ? "k1" : b === 2 ? "2" : b === 3 ? "3" : "45");
const shNItems = b => (b <= 1 ? 6 : 8);
function shTopics(subject, skill, band) {
  const all = subject === "math" ? SH_MATH.filter(t => (SH_SKILL_STRANDS[skill] || []).includes(t.strand)) : (SH_READ_KINDS[skill] || []);
  const dist = t => (band < t.b[0] ? t.b[0] - band : band > t.b[1] ? band - t.b[1] : 0);
  const best = Math.min(...all.map(dist));
  return all.filter(t => dist(t) === best);
}
function shMake(t, R, band) { const it = (t.gen || t.make).call(t, R, band); it.tag = it.tag || t.concept; it.topic = t.id; return it; }
const shQKey = it => it.stem + "|" + JSON.stringify(it.fig || null) + "|" + it.choices[it.key];
function shStream(subject, skill, band, concepts, seed, count, avoid) {
  const topics = shTopics(subject, skill, band);
  if (!topics.length) return [];
  const R = seeded(seed), deck = [];
  topics.forEach(t => { const w = 1 + (concepts.includes(t.concept) ? 3 : 0); for (let i = 0; i < w; i++) deck.push(t); });
  const order = shShuffle(R, deck), out = [], seen = new Set(avoid || []);
  for (let i = 0; out.length < count && i < count * 40; i++) {
    const t = order[i % order.length];
    let it = null;
    try { it = shMake(t, R, band); } catch (e) { continue; }
    if (seen.has(shQKey(it))) continue;
    seen.add(shQKey(it));
    out.push(it);
  }
  return out;
}
function shWeekItems(rec) {
  const key = [rec.code, rec.subject, rec.skill, rec.week, rec.band, rec.concepts, rec.spiral, rec.gen].join("|");
  if (shWeekItems.cache.has(key)) return shWeekItems.cache.get(key);
  const n = shNItems(rec.band), concepts = (rec.concepts || "").split(" ").filter(Boolean), seed = key;
  // pre and post are parallel forms: the same topic in each position, different numbers or words
  const pre = shStream(rec.subject, rec.skill, rec.band, concepts, seed + "|pre", n);
  const R = seeded(seed + "|post"), seen = new Set(pre.map(it => shQKey(it)));
  const topics = shTopics(rec.subject, rec.skill, rec.band);
  const post = pre.map(p => {
    const t = topics.find(x => x.id === p.topic) || topics[0];
    for (let k = 0; k < 80; k++) { const tt = k < 40 ? t : topics[k % topics.length]; let it; try { it = shMake(tt, R, rec.band); } catch (e) { continue; } const s = shQKey(it); if (!seen.has(s)) { seen.add(s); return it; } }
    return shMake(t, R, rec.band);
  });
  const p1 = shStream(rec.subject, rec.skill, rec.band, concepts, seed + "|p1", n, seen);
  p1.forEach(it => seen.add(shQKey(it)));
  let p2 = shStream(rec.subject, rec.skill, rec.band, concepts, seed + "|p2", rec.spiral ? n - 2 : n, seen);
  if (rec.spiral) {
    const [sk, sb] = rec.spiral.split("@");
    const rev = shStream(rec.subject, sk, Number(sb), [], seed + "|review", 2);
    rev.forEach(it => { it.review = sk; });
    p2 = p2.concat(rev);
  }
  const out = { pre, p1, p2, post };
  shWeekItems.cache.set(key, out);
  return out;
}
shWeekItems.cache = new Map();
const shWeekNo = week => Math.round(daysBetween(SH_EPOCH, week) / 7);
function shPassagesFor(rec) {
  const g = shGroup(rec.band), concepts = (rec.concepts || "").split(" ").filter(Boolean);
  let list = SH_PASSAGES.filter(p => p.skill === rec.skill && p.g === g);
  if (rec.skill === "AG" && !list.length) list = rec.band >= 3 ? SH_PASSAGES.filter(p => p.skill === "AG") : SH_PASSAGES.filter(p => p.skill === "LIT" && p.g === g);
  if (!list.length) list = SH_PASSAGES.filter(p => p.skill === rec.skill);
  const score = p => p.qs.filter(q => concepts.includes(q[3])).length;
  list = list.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.p);
  const o = ((shWeekNo(rec.week) % list.length) + list.length) % list.length, at = k => list[(o + k) % list.length];
  return { p1: at(0), p2: at(1), pre: at(2), post: at(3) };
}
function shPassageItems(p, seed) {
  const R = seeded(seed + "|" + p.id);
  return p.qs.map(([q, a, w, tag, why]) => shMC(R, q, a, w, { n: w.length + 1, tag, why, hint: "Look back at the text to find the answer." }));
}

// ---------- the sheet itself ----------
function shSkillName(subject, skill) { const r = subject === "reading" ? READING_LADDER.find(x => x.id === skill) : MATH_RUNGS[skill]; return r ? r.name : skill; }
function shLesson(rec, items) {
  const name = shSkillName(rec.subject, rec.skill);
  if (rec.subject === "math") {
    const cnt = {}; items.forEach(it => { cnt[it.topic] = (cnt[it.topic] || 0) + 1; });
    const ids = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]), t = SH_MATH.find(x => x.id === ids[0]) || shTopics(rec.subject, rec.skill, rec.band)[0];
    const ex = shMake(t, seeded(`${rec.code}|${rec.week}|${rec.skill}|learn`), rec.band);
    return { title: t.title, skill: name, steps: t.learn, example: { stem: ex.stem, fig: ex.fig || null, answer: ex.choices[ex.key], why: ex.why }, also: ids.slice(1, 4).map(id => SH_MATH.find(x => x.id === id).title), tip: ex.hint };
  }
  const L = SH_READ_LESSONS[rec.skill] || {}, keys = Object.keys(L).sort((a, b) => (a === "k1" ? 0 : Number(a)) - (b === "k1" ? 0 : Number(b)));
  const k = keys.filter(x => (x === "k1" ? 0 : Number(x)) <= rec.band).pop() || keys[0], les = L[k] || { title: name, steps: [] };
  let example = les.example ? { text: les.example.text, stem: les.example.q, answer: les.example.a, why: les.example.think } : null;
  if (!example && items.length) { const kind = (SH_READ_KINDS[rec.skill] || []).find(x => x.id === items[0].topic); if (kind) { const ex = shMake(kind, seeded(`${rec.code}|${rec.week}|${rec.skill}|learn`), rec.band); example = { stem: ex.stem, answer: ex.choices[ex.key], why: ex.why, say: ex.say }; } }
  return { title: les.title, skill: name, steps: les.steps, example, also: [], tip: items[0] && items[0].hint };
}
function shBuildSheet(rec) {
  if (rec.kind === "set") return shBuildSetSheet(rec);
  const ck = rec.id + "|" + [rec.code, rec.kind, rec.part, rec.week, rec.skill, rec.band, rec.concepts, rec.spiral, rec.gen].join("|");
  if (shBuildSheet.cache.has(ck)) return shBuildSheet.cache.get(ck);
  const name = shSkillName(rec.subject, rec.skill), slot = rec.kind === "practice" ? "p" + rec.part : rec.kind;
  const passageSkill = SH_PASSAGE_SKILLS.includes(rec.skill);
  let items, passage = null;
  if (passageSkill) { const p = shPassagesFor(rec)[slot]; passage = { title: p.title, text: p.text, poem: !!p.poem, id: p.id }; items = shPassageItems(p, `${rec.code}|${rec.week}|${slot}`); }
  else items = shWeekItems(rec)[slot] || [];
  const young = rec.band <= 1, readAloud = young && (passageSkill || items.some(it => it.read));
  const template = passageSkill ? (young ? "passage4" : "passage5") : (young ? "grid6" : "grid8");
  const reviewName = rec.spiral ? shSkillName(rec.subject, rec.spiral.split("@")[0]).toLowerCase() : "";
  const title = rec.kind === "practice" ? `Practice ${rec.part} · ${name}` : `${SH_KIND[rec.kind]} · ${name}`;
  const directions = [readAloud ? "Your teacher reads each question and the answers aloud." : "",
    rec.kind === "practice" && rec.part === 1 ? "Use the hints." : rec.kind === "practice" ? (rec.spiral ? `Try these on your own. The last two review ${reviewName}.` : "Try these on your own.") : "",
    "Fill in one bubble for each question. Use a pencil."].filter(Boolean).join(" ");
  const spec = { id: rec.id, code: rec.code, subject: rec.subject, skill: rec.skill, skillName: name, week: rec.week, kind: rec.kind, part: rec.part || 0, band: rec.band, level: rec.level,
    title, directions, template, readAloud, passage, items, total: items.length, key: items.map(it => SH_LETTERS[it.key]).join(""), hints: rec.kind === "practice" && rec.part === 1,
    learn: rec.kind === "practice" && rec.part === 1 ? shLesson(rec, items) : null };
  spec.layout = shLayout(spec);
  shBuildSheet.cache.set(ck, spec);
  return spec;
}
shBuildSheet.cache = new Map();
// 0.10: a sheet from a set. Its questions (or, for a worksheet, just the number of choices) come with the record, so the
// same sheet is drawn again in Odin, in DI-ana and on another computer. Up to 8 questions (6 with a passage) on a question
// sheet; up to 60 on a worksheet's answer sheet.
function shBuildSetSheet(rec) {
  const C = rec.custom || {}, keyStr = String(rec.key || "");
  const ck = "set|" + rec.id + "|" + rec.code + "|" + keyStr + "|" + shHash(JSON.stringify(C));
  if (shBuildSheet.cache.has(ck)) return shBuildSheet.cache.get(ck);
  const kidx = i => { const k = SH_LETTERS.indexOf(keyStr[i] || "?"); return k; };   // -1: not known yet
  let items, template, passage = null;
  if (Array.isArray(C.answers)) {
    items = C.answers.map((n, i) => ({ stem: "", choices: Array.from({ length: Math.max(2, Math.min(5, n | 0)) }, () => ""), key: kidx(i) }));
    template = "answers";
  } else {
    items = (C.items || []).map((it, i) => ({ stem: String(it.stem || ""), choices: (it.choices || []).map(String), key: kidx(i), hint: it.hint || "" }));
    if (C.passage && C.passage.text) passage = { title: String(C.passage.title || ""), text: String(C.passage.text), poem: false, id: "set" };
    const young = (rec.band | 0) <= 1;
    template = passage ? (young ? "passage4" : "passage5") : (young && items.length <= 6 ? "grid6" : "grid8");
  }
  const name = String(C.title || "").trim() || "Sheet", what = SH_SET_KIND[C.setKind] || "Sheet";
  const title = C.keySheet ? `Answer key · ${name}` : C.setKind === "worksheet" ? `Answers · ${name}` : `${what} · ${name}`;
  const directions = C.keySheet ? "Teacher: fill in the right answer to each question, then scan this sheet with the students' sheets. Keep it away from students."
    : C.setKind === "worksheet" ? "Answer the worksheet's questions here: fill in one bubble for each question. Use a pencil." : "Fill in one bubble for each question. Use a pencil.";
  const spec = { id: rec.id, code: rec.code, subject: rec.subject || C.subject || "", skill: rec.skill || "", skillName: name, week: rec.week, kind: "set", part: 0, band: rec.band | 0, level: rec.level,
    title, directions, template, readAloud: false, passage, items, total: items.length, key: keyStr, keyKnown: items.every(it => it.key >= 0), hints: C.setKind === "practice" && items.some(it => it.hint), learn: null,
    set: C.set || null, setKind: C.setKind || "", keySheet: !!C.keySheet };
  spec.layout = shLayout(spec);
  shBuildSheet.cache.set(ck, spec);
  return spec;
}
// 0.10: a set, as Odin's server sends it, as sheet records: its answer key sheet first, then each student's sheet.
function shSetRecs(set) {
  const custom = Object.assign({ set: set.id, setKind: set.kind, title: set.title, subject: set.subject || "" }, set.content || {});
  const base = { kind: "set", week: set.week, band: set.band | 0, subject: set.subject || "", key: set.key };
  return [Object.assign({}, base, { id: set.keySheet, code: "", custom: Object.assign({}, custom, { keySheet: true }) })]
    .concat((set.sheets || []).map(x => Object.assign({}, base, { id: x.id, code: x.code, custom, status: x.status, right: x.right })));
}
function shHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
function shScore(spec, answers) {
  const a = String(answers || ""), byTag = {};
  let right = 0;
  spec.items.forEach((it, i) => { const ok = it.key >= 0 && a[i] === SH_LETTERS[it.key]; if (ok) right++; const t = it.review ? "review" : it.tag || "other"; const e = byTag[t] || (byTag[t] = { right: 0, total: 0 }); e.total++; if (ok) e.right++; });
  return { right, total: spec.items.length, byTag };
}

// ---------- the sheet code: 34 squares across the top, read in any rotation ----------
function shCrc8(bytes) { let c = 0; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; } return c; }
function shCodeBits(id) {
  const crc = shCrc8([(id >> 16) & 255, (id >> 8) & 255, id & 255]), bits = [1, 0];
  for (let i = 23; i >= 0; i--) bits.push((id >> i) & 1);
  for (let i = 7; i >= 0; i--) bits.push((crc >> i) & 1);
  return bits;
}
function shCodeRead(bits) {
  if (!bits || bits.length !== SH_CODE.n || bits[0] !== 1 || bits[1] !== 0) return null;
  let id = 0, crc = 0;
  for (let i = 0; i < 24; i++) id = id * 2 + bits[2 + i];
  for (let i = 0; i < 8; i++) crc = crc * 2 + bits[26 + i];
  return shCrc8([(id >> 16) & 255, (id >> 8) & 255, id & 255]) === crc && id > 0 ? id : null;
}
const shCodeCells = () => Array.from({ length: SH_CODE.n }, (_, i) => ({ x: SH_CODE.x0 + i * SH_CODE.pitch, y: SH_CODE.cy - SH_CODE.h / 2, w: SH_CODE.w, h: SH_CODE.h, cx: SH_CODE.x0 + i * SH_CODE.pitch + SH_CODE.w / 2, cy: SH_CODE.cy }));

// ---------- page layout in millimetres: the printer, the screen and the scan reader all use this ----------
const SH_PT = 0.3528;   // mm per point
const shCharW = pt => pt * SH_PT * 0.56;   // a generous average character width, so text never overflows its box
function shWrap(text, widthMm, pt) {
  const per = Math.max(4, Math.floor(widthMm / shCharW(pt))), lines = [];
  for (const para of String(text).split("\n")) {
    let cur = "";
    for (const w of para.split(" ")) { const t = cur ? cur + " " + w : w; if (t.length > per && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
  }
  return lines;
}
const SH_FIG_H = { dots: 15, dots2: 11, base10: 19, groups: 13, fracbar: 9, fraccircle: 17, grid: 21, rect: 23, clock: 25, coins: 10, bars: 30, shape: 17, cubes: 17, linefig: 7, angle: 17, coord: 28 };
function shChoiceLayout(choices, x, y, w, pt, r, rowH) {
  const room = cw => Math.floor((cw - (2 * r + 3.2)) / shCharW(pt)) - 1, longest = Math.max(...choices.map(c => c.length)), n = choices.length;
  let cols = n, lines = 1;
  if (room(w / n) < longest) cols = n === 4 && room(w / 2) >= longest ? 2 : 1;
  if (cols === 1 && room(w) < longest) lines = 2;
  const rows = Math.ceil(n / cols), cw = w / cols, h = rowH + (lines - 1) * pt * SH_PT * 1.15;
  const cells = choices.map((c, i) => { const cx = x + (i % cols) * cw, cy = y + Math.floor(i / cols) * h; return { x: cx, y: cy, w: cw, h, bx: cx + r + 1.2, by: cy + h / 2, r, letter: SH_LETTERS[i], text: c, lines }; });
  return { cells, height: rows * h, cols };
}
function shLayout(spec) {
  const L = { template: spec.template, items: [], overflow: [] }, B = SH_BODY, BH = B.y1 - B.y0;
  const T = { grid8: { cols: 2, rows: 4, pt: 11, r: 2.4, rowH: 6.6 }, grid6: { cols: 2, rows: 3, pt: 14, r: 2.9, rowH: 8 },
    passage5: { pt: 10.5, ppt: 10.5, r: 2.3, rowH: 6.2 }, passage4: { pt: 13, ppt: 13, r: 2.9, rowH: 8 } }[spec.template];
  if (spec.template === "answers") {
    // a worksheet's answer sheet: numbered rows of bubbles in one to three columns
    const n = spec.items.length, cols = n <= 20 ? 1 : n <= 40 ? 2 : 3, rows = Math.ceil(n / cols), BW = B.x1 - B.x0;
    const rowH = Math.max(7, Math.min(11, BH / rows)), r = rowH >= 9 ? 2.7 : 2.4, pitch = r * 2 + 3.4, colW = BW / cols;
    spec.items.forEach((it, i) => {
      const col = Math.floor(i / rows), row = i % rows, x = B.x0 + col * colW, y = B.y0 + row * rowH, cy = y + rowH / 2;
      const choices = it.choices.map((c, k) => { const bx = x + 15 + r + k * pitch; return { x: bx - r - 1, y: cy - rowH / 2, w: pitch, h: rowH, bx, by: cy, r, letter: SH_LETTERS[k], text: "", lines: 1 }; });
      L.items.push({ n: i + 1, x, y, w: colW, h: rowH, pt: 11, lh: rowH, num: { x: x + 9, y: cy }, stem: { x: x, y, w: 0, h: 0, lines: [] }, hint: null, fig: null, choices, ccols: choices.length, row: true });
    });
    L.cols = cols; L.rows = rows; L.colW = colW; L.rowH = rowH;
    if (rows * rowH > BH + 0.5) L.overflow.push("answers");
  } else if (spec.template.startsWith("grid")) {
    const gap = 5, colW = (B.x1 - B.x0 - gap) / T.cols, rowH = BH / T.rows;
    spec.items.forEach((it, i) => {
      const col = i % T.cols, row = Math.floor(i / T.cols), x = B.x0 + col * (colW + gap), y = B.y0 + row * rowH;
      let pt = T.pt, ok = false, out;
      for (; pt >= T.pt - 2.5 && !ok; pt -= 0.5) {
        const lh = pt * SH_PT * 1.25, sx = x + 8, sw = colW - 10, stemLines = shWrap(it.stem + (it.review ? " [review]" : ""), sw, pt), stemH = stemLines.length * lh;
        const hintLines = spec.hints && it.hint ? shWrap("Hint: " + it.hint, sw, Math.max(8.5, pt - 2.5)) : [], hintH = hintLines.length * Math.max(8.5, pt - 2.5) * SH_PT * 1.25;
        const ch = shChoiceLayout(it.choices, x + 6, 0, colW - 7, pt, T.r, T.rowH), chH = ch.height;
        const avail = rowH - 3 - stemH - hintH - chH - 2.5;
        const figWant = it.fig ? SH_FIG_H[it.fig.t] || 15 : 0, figH = it.fig ? Math.min(figWant, avail) : 0;
        ok = avail >= (it.fig ? Math.min(figWant, 9) : 0);
        const cy = y + 1.5 + stemH + hintH + (it.fig ? Math.max(0, figH) + 2.5 : 1.2);
        ch.cells.forEach(c => { c.y += cy; c.by += cy; });
        out = { n: i + 1, x, y, w: colW, h: rowH, pt, lh, num: { x: x + 3, y: y + 1.5 + lh / 2 }, stem: { x: sx, y: y + 1.5, w: sw, h: stemH, lines: stemLines },
          hint: hintLines.length ? { x: sx, y: y + 1.5 + stemH, w: sw, h: hintH, pt: Math.max(8.5, pt - 2.5), lines: hintLines } : null,
          fig: it.fig ? { x: sx, y: y + 1.5 + stemH + hintH + 1, w: sw, h: Math.max(0, figH) } : null, choices: ch.cells, ccols: ch.cols };
      }
      if (!ok) L.overflow.push(i + 1);
      L.items.push(out);
    });
  } else {
    const P = spec.passage, w = B.x1 - B.x0;
    for (let shrink = 0; shrink <= 3; shrink++) {
      const ppt = T.ppt - shrink * 0.5, plh = ppt * SH_PT * 1.3, plines = shWrap(P.text, w - 8, ppt), ph = 6.5 + plines.length * plh + 4;
      const pt = T.pt - shrink * 0.5, lh = pt * SH_PT * 1.25, items = [];
      let y = B.y0 + ph + 3;
      spec.items.forEach((it, i) => {
        const lines = shWrap(it.stem, w - 9, pt), stemH = lines.length * lh, ch = shChoiceLayout(it.choices, B.x0 + 7, 0, w - 8, pt, T.r, T.rowH);
        ch.cells.forEach(c => { c.y += y + stemH + 0.8; c.by += y + stemH + 0.8; });
        items.push({ n: i + 1, x: B.x0, y, w, h: stemH + ch.height + 1, pt, lh, num: { x: B.x0 + 3, y: y + lh / 2 }, stem: { x: B.x0 + 8, y, w: w - 9, h: stemH, lines }, hint: null, fig: null, choices: ch.cells, ccols: ch.cols });
        y += stemH + ch.height + 2.6;
      });
      L.passage = { x: B.x0, y: B.y0, w, h: ph, pt: ppt, lh: plh, lines: plines, title: P.title, poem: P.poem };
      L.items = items;
      if (y <= B.y1 + 1) break;
      if (shrink === 3) L.overflow.push("passage");
    }
  }
  L.bubbles = L.items.flatMap((it, i) => it.choices.map((c, k) => ({ item: i, choice: k, x: c.bx, y: c.by, r: c.r })));
  return L;
}

// ---------- figures, drawn in millimetres (black, white and gray only, so they print and scan cleanly) ----------
function shFig(fig, wmm, hmm) {
  if (!fig) return "";
  const S = (vw, vh, body) => `<svg class="fig" viewBox="0 0 ${vw} ${vh}" width="${Math.min(wmm, (vw * hmm) / vh).toFixed(2)}mm" height="${Math.min(hmm, (vh * wmm) / vw).toFixed(2)}mm" role="img" aria-label="${shFigLabel(fig)}">${body}</svg>`;
  const T = (x, y, t, sz = 3, anchor = "middle", wt = 400) => `<text x="${x}" y="${y}" font-size="${sz}" text-anchor="${anchor}" font-weight="${wt}" fill="#222" font-family="Atkinson Hyperlegible Next, Arial, sans-serif">${t}</text>`;
  const dotsAt = (n, x0, y0) => Array.from({ length: n }, (_, i) => `<circle cx="${x0 + (i % 5) * 4.6 + 2.3}" cy="${y0 + Math.floor(i / 5) * 4.6 + 2.3}" r="1.7" fill="#333"/>`).join("");
  switch (fig.t) {
    case "dots": return S(23.5, Math.ceil(fig.n / 5) * 4.6 + 0.5, dotsAt(fig.n, 0, 0));
    case "dots2": { const ra = Math.ceil(fig.a / 5), rb = Math.ceil(fig.b / 5), h = Math.max(ra, rb) * 4.6 + 0.5; return S(56, h, dotsAt(fig.a, 0, 0) + T(28, h / 2 + 1.5, "+", 6) + dotsAt(fig.b, 32.5, 0)); }
    case "base10": { let s = ""; for (let i = 0; i < fig.tens; i++) { s += `<rect x="${i * 3.4}" y="0.5" width="2.6" height="18" fill="#ddd" stroke="#333" stroke-width="0.3"/>`; for (let k = 1; k < 10; k++) s += `<line x1="${i * 3.4}" x2="${i * 3.4 + 2.6}" y1="${0.5 + k * 1.8}" y2="${0.5 + k * 1.8}" stroke="#333" stroke-width="0.15"/>`; }
      const ox = fig.tens * 3.4 + 3; for (let j = 0; j < fig.ones; j++) s += `<rect x="${ox + Math.floor(j / 5) * 3.2}" y="${16.4 - (j % 5) * 3.2}" width="2.6" height="2.6" fill="#ddd" stroke="#333" stroke-width="0.3"/>`;
      return S(ox + Math.ceil(fig.ones / 5) * 3.2 + 1, 19, s); }
    case "groups": { let s = ""; for (let g = 0; g < fig.g; g++) { const cx = g * 14 + 6.5; s += `<circle cx="${cx}" cy="6.5" r="6" fill="none" stroke="#333" stroke-width="0.35"/>`;
        for (let e = 0; e < fig.e; e++) { const a = (2 * Math.PI * e) / fig.e - Math.PI / 2, rr = fig.e === 1 ? 0 : 3; s += `<circle cx="${(cx + rr * Math.cos(a)).toFixed(2)}" cy="${(6.5 + rr * Math.sin(a)).toFixed(2)}" r="1.2" fill="#333"/>`; } }
      return S(fig.g * 14, 13, s); }
    case "fracbar": { const W = 56, w = W / fig.n; let s = ""; for (let i = 0; i < fig.n; i++) s += `<rect x="${0.3 + i * w}" y="0.3" width="${w}" height="8" fill="${i < fig.k ? "#aaa" : "#fff"}" stroke="#222" stroke-width="0.4"/>`; return S(W + 0.6, 8.6, s); }
    case "fraccircle": { const c = 8, r = 7.4; let s = "";
      for (let i = 0; i < fig.n; i++) { const a0 = (2 * Math.PI * i) / fig.n - Math.PI / 2, a1 = (2 * Math.PI * (i + 1)) / fig.n - Math.PI / 2;
        s += `<path d="M ${c} ${c} L ${(c + r * Math.cos(a0)).toFixed(2)} ${(c + r * Math.sin(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(2)} ${(c + r * Math.sin(a1)).toFixed(2)} Z" fill="${i < fig.k ? "#aaa" : "#fff"}" stroke="#222" stroke-width="0.4"/>`; }
      return S(16, 16, s); }
    case "grid": { let s = ""; for (let r = 0; r < fig.h; r++) for (let c = 0; c < fig.w; c++) s += `<rect x="${0.3 + c * 4}" y="${0.3 + r * 4}" width="4" height="4" fill="#eee" stroke="#333" stroke-width="0.3"/>`; return S(fig.w * 4 + 0.6, fig.h * 4 + 0.6, s); }
    case "rect": { const k = Math.min(36 / fig.l, 16 / fig.w), rw = fig.l * k, rh = fig.w * k; return S(rw + 16, rh + 7, `<rect x="1" y="5" width="${rw}" height="${rh}" fill="#f1f1f1" stroke="#222" stroke-width="0.45"/>` + T(1 + rw / 2, 3.8, `${fig.l} ${fig.u}`, 3.2) + T(rw + 2.5, 5 + rh / 2 + 1.1, `${fig.w} ${fig.u}`, 3.2, "start")); }
    case "clock": { const c = 12.5, R0 = 12; let s = `<circle cx="${c}" cy="${c}" r="${R0}" fill="#fff" stroke="#222" stroke-width="0.5"/>`;
      for (let i = 1; i <= 12; i++) { const a = (i * Math.PI) / 6 - Math.PI / 2; s += T((c + 9.3 * Math.cos(a)).toFixed(2), (c + 9.3 * Math.sin(a) + 1.1).toFixed(2), i, 3); }
      const ha = (((fig.h % 12) + fig.m / 60) * Math.PI) / 6 - Math.PI / 2, ma = (fig.m * Math.PI) / 30 - Math.PI / 2;
      s += `<line x1="${c}" y1="${c}" x2="${(c + 5.5 * Math.cos(ha)).toFixed(2)}" y2="${(c + 5.5 * Math.sin(ha)).toFixed(2)}" stroke="#111" stroke-width="1.1" stroke-linecap="round"/>`;
      s += `<line x1="${c}" y1="${c}" x2="${(c + 8.6 * Math.cos(ma)).toFixed(2)}" y2="${(c + 8.6 * Math.sin(ma)).toFixed(2)}" stroke="#111" stroke-width="0.55" stroke-linecap="round"/><circle cx="${c}" cy="${c}" r="0.8" fill="#111"/>`;
      return S(25, 25, s); }
    case "coins": { const kinds = [["q", 4.3, "25¢"], ["d", 3.4, "10¢"], ["n", 3.9, "5¢"], ["p", 3.5, "1¢"]]; let x = 0, s = "";
      kinds.forEach(([k, r, lab]) => { for (let i = 0; i < fig[k]; i++) { s += `<circle cx="${x + r}" cy="5" r="${r}" fill="#eee" stroke="#333" stroke-width="0.35"/>` + T(x + r, 6.1, lab, r * 0.75); x += 2 * r + 1.2; } });
      return S(Math.max(x, 10), 10, s); }
    case "bars": { const mx = Math.max(...fig.values), top = Math.ceil(mx / fig.scale) * fig.scale, H = 20, W = 12 * fig.labels.length + 10; let s = `<line x1="8" y1="1" x2="8" y2="${H + 1}" stroke="#222" stroke-width="0.35"/><line x1="8" y1="${H + 1}" x2="${W}" y2="${H + 1}" stroke="#222" stroke-width="0.35"/>`;
      for (let v = 0; v <= top; v += fig.scale) { const y = H + 1 - (v / top) * H; s += `<line x1="7" x2="${W}" y1="${y}" y2="${y}" stroke="#ccc" stroke-width="0.2"/>` + T(5.8, y + 1, v, 2.6, "end"); }
      fig.labels.forEach((l, i) => { const h = (fig.values[i] / top) * H, x = 11 + i * 12; s += `<rect x="${x}" y="${H + 1 - h}" width="7" height="${h}" fill="#999" stroke="#222" stroke-width="0.3"/>` + T(x + 3.5, H + 5, l, 2.8); });
      return S(W + 1, H + 7, T(W / 2 + 4, 0, "", 2) + s); }
    case "shape": { const k = fig.k, c = 8; let s;
      if (k === "circle") s = `<circle cx="${c}" cy="${c}" r="7" fill="#eee" stroke="#222" stroke-width="0.5"/>`;
      else if (k === "square") s = `<rect x="1.5" y="1.5" width="13" height="13" fill="#eee" stroke="#222" stroke-width="0.5"/>`;
      else if (k === "rectangle") return S(26, 16, `<rect x="1" y="3" width="24" height="11" fill="#eee" stroke="#222" stroke-width="0.5"/>`);
      else { const n = { triangle: 3, pentagon: 5, hexagon: 6 }[k]; s = `<polygon points="${Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; return `${(c + 7.2 * Math.cos(a)).toFixed(2)},${(c + 7.2 * Math.sin(a) + (n === 3 ? 1.2 : 0)).toFixed(2)}`; }).join(" ")}" fill="#eee" stroke="#222" stroke-width="0.5"/>`; }
      return S(16, 16, s); }
    case "cubes": { const row = (n, y, lab) => T(0, y + 3.3, lab, 3, "start") + Array.from({ length: n }, (_, i) => `<rect x="${15 + i * 3.6}" y="${y}" width="3.4" height="3.4" fill="#ddd" stroke="#333" stroke-width="0.3"/>`).join("") + `<rect x="15" y="${y + 4.2}" width="${n * 3.6 - 0.2}" height="2" rx="1" fill="#777"/>`;
      return S(15 + Math.max(fig.a, fig.b) * 3.6 + 1, 16, row(fig.a, 0.5, fig.la) + row(fig.b, 9, fig.lb)); }
    case "linefig": { const k = fig.k, arrow = (x, dir) => `<polygon points="${x},3 ${x - 2.4 * dir},1.6 ${x - 2.4 * dir},4.4" fill="#222"/>`;
      let s = `<line x1="${k === "line" ? 3 : 4}" y1="3" x2="${k === "segment" ? 36 : 37}" y2="3" stroke="#222" stroke-width="0.5"/>`;
      if (k === "segment") s += `<circle cx="4" cy="3" r="1" fill="#222"/><circle cx="36" cy="3" r="1" fill="#222"/>`;
      if (k === "ray") s += `<circle cx="4" cy="3" r="1" fill="#222"/>` + arrow(39, 1);
      if (k === "line") s += arrow(1, -1) + arrow(39, 1);
      return S(40, 6, s); }
    case "angle": { const a = (fig.deg * Math.PI) / 180, x0 = fig.deg > 90 ? 12 : 3, y0 = 14, L0 = 11, ex = x0 + L0 * Math.cos(-a), ey = y0 + L0 * Math.sin(-a);
      const arc = `<path d="M ${x0 + 3.5} ${y0} A 3.5 3.5 0 ${fig.deg > 180 ? 1 : 0} 0 ${(x0 + 3.5 * Math.cos(-a)).toFixed(2)} ${(y0 + 3.5 * Math.sin(-a)).toFixed(2)}" fill="none" stroke="#555" stroke-width="0.35"/>`;
      return S(26, 16, `<line x1="${x0}" y1="${y0}" x2="${x0 + L0}" y2="${y0}" stroke="#222" stroke-width="0.5"/><line x1="${x0}" y1="${y0}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" stroke="#222" stroke-width="0.5"/>` + (fig.deg === 90 ? `<rect x="${x0}" y="${y0 - 2.4}" width="2.4" height="2.4" fill="none" stroke="#555" stroke-width="0.35"/>` : arc)); }
    case "coord": { const u = 2.6, o = 4; let s = "";
      for (let i = 0; i <= 9; i++) s += `<line x1="${o + i * u}" y1="${1}" x2="${o + i * u}" y2="${1 + 9 * u}" stroke="#ccc" stroke-width="0.2"/><line x1="${o}" y1="${1 + i * u}" x2="${o + 9 * u}" y2="${1 + i * u}" stroke="#ccc" stroke-width="0.2"/>`;
      s += `<line x1="${o}" y1="${1 + 9 * u}" x2="${o + 9 * u}" y2="${1 + 9 * u}" stroke="#222" stroke-width="0.4"/><line x1="${o}" y1="1" x2="${o}" y2="${1 + 9 * u}" stroke="#222" stroke-width="0.4"/>`;
      for (let i = 0; i <= 9; i += 1) s += T(o + i * u, 1 + 9 * u + 3, i, 2.2) + (i ? T(o - 1.2, 1 + (9 - i) * u + 0.8, i, 2.2, "end") : "");
      const px = o + fig.x * u, py = 1 + (9 - fig.y) * u;
      return S(o + 9 * u + 4, 9 * u + 5, s + `<circle cx="${px}" cy="${py}" r="1" fill="#111"/>` + T(px + 1.5, py - 1, "A", 3, "start", 700)); }
  }
  return "";
}
function shFigLabel(f) {
  return { dots: `${f.n} dots`, dots2: `${f.a} dots and ${f.b} dots`, base10: `${f.tens} tens rods and ${f.ones} ones cubes`, groups: `${f.g} groups of ${f.e} dots`, fracbar: `a bar in ${f.n} equal parts, ${f.k} shaded`, fraccircle: `a circle in ${f.n} equal parts, ${f.k} shaded`,
    grid: `a rectangle of unit squares, ${f.w} by ${f.h}`, rect: `a rectangle ${f.l} ${f.u} by ${f.w} ${f.u}`, clock: "a clock", coins: "coins", bars: "a bar graph of votes", shape: `a ${f.k}`, cubes: `a ${f.la} and a ${f.lb} measured with cubes`,
    linefig: "a figure", angle: "an angle", coord: "a coordinate grid with point A" }[f.t] || "a figure";
}
if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { SH_LETTERS, SH_SET_KIND, shBuildSetSheet, shSetRecs, shHash, SHEET_GEN, SH_PAGE, SH_MARK, SH_MARKS, SH_CODE, SH_BODY, shPlanFor, shRecordsFor, shBuildSheet, shWeekItems, shScore, shCodeBits, shCodeRead, shCodeCells, shLayout, shFig, shConcepts, shWrap, shPassagesFor });
