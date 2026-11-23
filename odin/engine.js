// Odin scoring engine (Project Cerberus demo). Plain code, no AI: exact and repeatable.
// Every result is converted to one grade-level scale, relative to each class's grade G (kindergarten = 0):
// G.0 = working at grade G standards, G.1 to G.9 = progress through the grade, G+1 = ready for the next grade.
// Below kindergarten level shows as Pre-K.

const gradeName = g => g === 0 ? "kindergarten" : `grade ${g}`;
const gradeShort = g => g === 0 ? "K" : String(g);
const gradeCode = g => g === 0 ? "K" : String(g);          // as it appears in B.E.S.T. codes, e.g. ELA.K.F.1.3

// ---- skill ladders, foundation first; reading is the same K-5, math changes with the grade ----
const READING_LADDER = [
  { id: "PA",  level: 1, name: "Phonological awareness", short: "Phon. aw." },
  { id: "PH",  level: 2, name: "Phonics and decoding", short: "Phonics" },
  { id: "HFW", level: 3, name: "High-frequency words", short: "HF words" },
  { id: "VOC", level: 4, name: "Vocabulary", short: "Vocab" },
  { id: "LIT", level: 5, name: "Reading literature", short: "Literature" },
  { id: "INF", level: 5, name: "Reading informational text", short: "Info text" },
  { id: "AG",  level: 6, name: "Reading across genres", short: "Across gen." }
];
const MATH_RUNGS = {
  NUM: { id: "NUM", level: 1, name: "Counting and place value", short: "Place value" },
  ADD: { id: "ADD", level: 2, name: "Adding and subtracting", short: "Add/sub" },
  MG2: { id: "MG2", level: 3, name: "Measurement, shapes and data", short: "Meas/shapes" },
  NS:  { id: "NS",  level: 1, name: "Number sense, adding and subtracting", short: "Add/sub" },
  MD:  { id: "MD",  level: 2, name: "Multiplying and dividing", short: "Mult/div" },
  FR:  { id: "FR",  level: 3, name: "Fractions", short: "Fractions" },
  MGD: { id: "MGD", level: 3, name: "Measurement, geometry and data", short: "Meas/geo" },
  WN:  { id: "WN",  level: 1, name: "Whole-number operations", short: "Whole nums" },
  FD:  { id: "FD",  level: 2, name: "Fractions and decimals", short: "Frac/dec" },
  AR:  { id: "AR",  level: 3, name: "Algebraic reasoning", short: "Algebra" },
  MG5: { id: "MG5", level: 3, name: "Measurement, geometry and data", short: "Meas/geo" }
};
const MATH_LADDER_IDS = { 0: ["NUM", "ADD", "MG2"], 1: ["NUM", "ADD", "MG2"], 2: ["NUM", "ADD", "MG2"],
  3: ["NS", "MD", "FR", "MGD"], 4: ["WN", "FD", "MG5"], 5: ["WN", "FD", "AR", "MG5"] };
function ladderFor(subject, G) {
  if (subject === "reading") return G >= 3 ? READING_LADDER : READING_LADDER.filter(r => r.id !== "AG");
  return MATH_LADDER_IDS[G].map(id => MATH_RUNGS[id]);
}
const LADDERS = { reading: READING_LADDER, math: MATH_LADDER_IDS[3].map(id => MATH_RUNGS[id]) }; // grade 3, kept for reference

// i-Ready Diagnostic domains behind each rung
const IREADY_READING = { PA: [["PA", "Phonological Awareness"]], PH: [["PH", "Phonics"]], HFW: [["HFW", "High-Frequency Words"]],
  VOC: [["VOC", "Vocabulary"]], LIT: [["LIT", "Comprehension: Literature"]], INF: [["INF", "Comprehension: Informational Text"]] };
const IREADY_MATH = {
  0: { NUM: [["NO", "Number and Operations"]], ADD: [["AAT", "Algebra and Algebraic Thinking"]], MG2: [["MD", "Measurement and Data"], ["GEO", "Geometry"]] },
  3: { NS: [["NO", "Number and Operations"]], MD: [["AAT", "Algebra and Algebraic Thinking"]], MGD: [["MD", "Measurement and Data"], ["GEO", "Geometry"]] },
  4: { WN: [["NO", "Number and Operations"], ["AAT", "Algebra and Algebraic Thinking"]], MG5: [["MD", "Measurement and Data"], ["GEO", "Geometry"]] },
  5: { WN: [["NO", "Number and Operations"]], AR: [["AAT", "Algebra and Algebraic Thinking"]], MG5: [["MD", "Measurement and Data"], ["GEO", "Geometry"]] }
};
const ireadyDomains = (subject, G) => subject === "reading" ? IREADY_READING : IREADY_MATH[G <= 2 ? 0 : G];

// FAST reporting categories behind each rung (grades 3-5; FLDOE FAST blueprints)
const FAST_CATS = {
  reading: { LIT: "Reading Prose and Poetry", INF: "Reading Informational Text", AG: "Reading Across Genres and Vocabulary" },
  math: {
    3: { NS: "Number Sense and Additive Reasoning", MD: "Number Sense and Multiplicative Reasoning", FR: "Fractional Reasoning", MGD: "Geometric Reasoning, Measurement, and Data Analysis and Probability" },
    4: { WN: "Number Sense and Operations with Whole Numbers", FD: "Number Sense and Operations with Fractions and Decimals", MG5: "Geometric Reasoning, Measurement, and Data Analysis and Probability" },
    5: { WN: "Number Sense and Operations with Whole Numbers", FD: "Number Sense and Operations with Fractions and Decimals", AR: "Algebraic Reasoning", MG5: "Geometric Reasoning, Measurement, and Data Analysis and Probability" }
  }
};
const fastCats = (subject, G) => G < 3 ? {} : subject === "reading" ? FAST_CATS.reading : FAST_CATS.math[G];

// ---- conversions to grade level (demo values; the school sets the real table) ----
const IREADY_OFFSET = {
  "Surpassed Level": 1.0, "Mid or Above Grade Level": 0.6, "Early On Grade Level": 0.1,
  "1 Grade Level Below": -0.5, "2 Grade Levels Below": -1.5, "3 or More Grade Levels Below": -2.5
};
// Kindergarten's lowest placement (1 Grade Level Below, Emerging K) sits well under kindergarten level.
const PREK = -0.9;
const iReadyGL = (place, G) => !(place in IREADY_OFFSET) ? null
  : G === 0 && place === "1 Grade Level Below" ? -0.8 : Math.max(-0.5, G + IREADY_OFFSET[place]);
const IREADY_ON_GRADE = ["Early On Grade Level", "Mid or Above Grade Level"];   // i-Ready's own "on grade level"
const FAST_CAT_OFFSET = { "Above": 0.8, "At/Near": 0.2, "Below": -0.8 };
// FAST achievement levels 1-5 (FLDOE 2026-27 fact sheet) and the grade-level span each maps to
const FAST_RANGES = {
  3: { reading: [[140, 185], [186, 200], [201, 212], [213, 224], [225, 260]], math: [[140, 182], [183, 197], [198, 208], [209, 224], [225, 260]] },
  4: { reading: [[154, 198], [199, 212], [213, 223], [224, 236], [237, 270]], math: [[155, 199], [200, 210], [211, 220], [221, 237], [238, 273]] },
  5: { reading: [[160, 205], [206, 221], [222, 231], [232, 245], [246, 279]], math: [[158, 206], [207, 221], [222, 233], [234, 245], [246, 285]] }
};
const FAST_SPANS = [[-2.0, -1.1], [-1.0, -0.1], [0.0, 0.4], [0.5, 0.9], [1.0, 1.9]];
const fastCuts = (subject, G) => (FAST_RANGES[G] ? FAST_RANGES[G][subject] : []).map(([lo, hi], i) => [lo, hi, G + FAST_SPANS[i][0], G + FAST_SPANS[i][1]]);
const PM_GL = (pct, G) => G - 1.5 + 2.5 * pct;   // 0% = G-1.5, 50% = G-0.25, 75% = G+0.4, 100% = G+1.0
const MIN_ITEMS = 3;                             // per skill, before Performance Matters counts
const MASTERY = { pct: 0.75, minItems: 2 };      // per standard
const BANDS_REL = { support: -0.5, ongrade: 0, above: 1 };   // relative to the class grade

const r1 = x => Math.round(x * 10) / 10;
function fastGL(subject, ss, G) {
  const cuts = fastCuts(subject, G);
  for (const [lo, hi, a, b] of cuts) if (ss <= hi) return r1(a + (b - a) * Math.max(0, ss - lo) / (hi - lo));
  return cuts.length ? cuts[cuts.length - 1][3] : null;
}
function fmtGL(g) {
  if (g == null) return "–";
  const v = r1(g);
  return v < 0 ? "Pre-K" : v < 1 ? "K." + Math.round(v * 10) : v.toFixed(1);
}
function band(g, G) {
  if (g == null) return "none";
  if (g < G + BANDS_REL.support) return "support";
  if (g < G + BANDS_REL.ongrade) return "approaching";
  if (g < G + BANDS_REL.above) return "ongrade";
  return "above";
}

// ---- curriculum roadmap: a standard counts as taught only when a lesson covering it is marked taught ----
function lessonStatus(data, lesson) {
  return (data.overrides && data.overrides[lesson.id]) || (lesson.date <= data.today ? "taught" : "upcoming");
}
function taughtInfo(data, subject) {
  const info = {};
  const lessons = ((data.roadmap || {})[subject] || { lessons: [] }).lessons;
  for (const ls of lessons) {
    const st = lessonStatus(data, ls);
    for (const c of ls.standards) {
      const x = info[c] || (info[c] = { taught: false, lessons: [], skipped: [], next: null, firstTaught: null });
      x.lessons.push(ls);
      if (st === "taught") { x.taught = true; if (!x.firstTaught || ls.date < x.firstTaught) x.firstTaught = ls.date; }
      else if (st === "nottaught") x.skipped.push(ls);
      else if (!x.next || ls.date < x.next) x.next = ls.date;
    }
  }
  return info;
}
// Standards catalog plus any codes an uploaded roadmap brings in
function catalog(data, subject) {
  const list = data.standards[subject].map(s => ({ ...s }));
  const known = new Set(list.map(s => s.code));
  for (const ls of ((data.roadmap || {})[subject] || { lessons: [] }).lessons)
    for (const c of ls.standards) if (!known.has(c)) { known.add(c); list.push({ code: c, label: ls.title, rung: null }); }
  return list;
}

// Build the evidence for one student, one skill, from the files that are switched on.
function evidence(data, subject, code, rungId, taught) {
  const G = data.grade;
  taught = taught || taughtInfo(data, subject);
  const lines = [];
  const files = data.files.filter(f => f.active && f.subject === subject);
  for (const f of files) {
    const row = f.rows[code];
    if (!row) continue;
    if (f.source === "i-Ready") {
      const doms = ireadyDomains(subject, G)[rungId] || [];
      if (!doms.length) continue;
      const parts = doms.map(([k, label]) => ({ label, value: row[k], gl: iReadyGL(row[k], G) })).filter(p => p.gl != null);
      if (!parts.length) continue;
      lines.push({ source: "i-Ready", file: f.name, win: (f.what || "").split(" · ")[0], detail: parts, gl: r1(parts.reduce((a, p) => a + p.gl, 0) / parts.length), counted: true });
    } else if (f.source === "FAST") {
      const cat = fastCats(subject, G)[rungId];
      if (!cat || !(row[rungId] in FAST_CAT_OFFSET)) continue;
      lines.push({ source: "FAST", file: f.name, win: (f.what || "").split(" · ")[0], detail: [{ label: cat, value: row[rungId] }], gl: r1(G + FAST_CAT_OFFSET[row[rungId]]), counted: true });
    }
  }
  const items = [], untaught = [];
  for (const f of files.filter(f => f.source === "Performance Matters")) {
    f.items.forEach((it, k) => {
      if (it.rung !== rungId || !f.rows[code]) return;
      const row = { ...it, file: f.name, correct: f.rows[code][k] };
      (taught[it.code] && taught[it.code].taught ? items : untaught).push(row);
    });
  }
  if (items.length || untaught.length) {
    const right = items.reduce((a, it) => a + it.correct, 0);
    const pct = items.length ? right / items.length : 0;
    lines.push({ source: "Performance Matters", items, untaught, right, total: items.length, pct: Math.round(pct * 100), gl: items.length ? r1(PM_GL(pct, G)) : null, counted: items.length >= MIN_ITEMS });
  }
  const counted = lines.filter(l => l.counted);
  const gl = counted.length ? r1(counted.reduce((a, l) => a + l.gl, 0) / counted.length) : null;
  return { lines, gl, band: band(gl, G) };
}

// Overall level for a subject: average of the whole-test results (i-Ready overall placement, FAST scale score).
function overall(data, subject, code) {
  const G = data.grade, parts = [];
  for (const f of data.files.filter(f => f.active && f.subject === subject)) {
    const row = f.rows[code];
    if (!row) continue;
    if (f.source === "i-Ready" && iReadyGL(row.overall, G) != null) parts.push({ source: "i-Ready overall", raw: row.overall, gl: iReadyGL(row.overall, G) });
    if (f.source === "FAST" && fastGL(subject, row.ss, G) != null) parts.push({ source: "FAST " + ((f.what || "").split(" · ")[0] || ""), raw: `${row.ss}, Level ${row.level}`, gl: fastGL(subject, row.ss, G) });
  }
  const gl = parts.length ? r1(parts.reduce((a, p) => a + p.gl, 0) / parts.length) : null;
  return { gl, band: band(gl, G), parts };
}

// Walk the ladder from the bottom. P1 = lowest skill below grade level; P2 = the next one up.
// If fewer than two are below, skills just below grade level fill in, lowest first.
function profile(data, subject, code) {
  const taught = taughtInfo(data, subject);
  const rungs = ladderFor(subject, data.grade).map((r, idx) => ({ ...r, idx, ...evidence(data, subject, code, r.id, taught) }));
  const order = [...rungs].sort((a, b) => a.level - b.level || (a.gl ?? 99) - (b.gl ?? 99));
  const picks = [...order.filter(r => r.band === "support"), ...order.filter(r => r.band === "approaching")].slice(0, 2);
  rungs.forEach(r => { r.tag = null; });
  if (picks[0]) picks[0].tag = "P1";
  if (picks[1]) picks[1].tag = "P2";
  rungs.forEach(r => { if (!r.tag && r.band === "support") r.tag = "Waits"; });
  return { rungs, p1: picks[0] || null, p2: picks[1] || null, overall: overall(data, subject, code) };
}

// Standards mastery: Mastered, Needs remediation, Not taught yet, or Taught but not checked yet.
// "Taught" comes from the roadmap and the teacher's marks, never from a test date.
function standards(data, subject, code, taught) {
  const G = data.grade;
  taught = taught || taughtInfo(data, subject);
  const files = data.files.filter(f => f.active && f.subject === subject);
  const phonicsCode = `ELA.${gradeCode(G)}.F.1.3`;
  return catalog(data, subject).map(st => {
    const t = taught[st.code] || { taught: false, lessons: [], skipped: [], next: null };
    const items = [];
    for (const f of files.filter(f => f.source === "Performance Matters")) {
      f.items.forEach((it, k) => { if (it.code === st.code && f.rows[code]) items.push({ ...it, file: f.name, correct: f.rows[code][k] }); });
    }
    let status, basis;
    const ir = st.code === phonicsCode ? files.find(f => f.source === "i-Ready") : null;
    if (!t.taught) {
      status = "nottaught";
      basis = t.skipped.length ? `On the roadmap ${t.skipped[0].date}, marked not taught` + (t.next ? `; rescheduled ${t.next}` : "")
        : t.next ? `Planned ${t.next}` : "Not on the roadmap";
      if (items.length) basis += ` · ${items.length} test item${items.length > 1 ? "s" : ""} not counted`;
    } else if (ir && ir.rows[code]) {
      const v = ir.rows[code].PH;
      status = iReadyGL(v, G) >= G ? "mastered" : "remediate";
      basis = "i-Ready Phonics: " + v;
    } else if (items.length >= MASTERY.minItems) {
      const right = items.reduce((a, it) => a + it.correct, 0);
      status = right / items.length >= MASTERY.pct ? "mastered" : "remediate";
      basis = `${right} of ${items.length} items right`;
    } else {
      status = "nocheck";
      basis = items.length ? `Only ${items.length} item so far` : "No test item yet";
    }
    return { ...st, taught: t.taught, firstTaught: t.firstTaught || null, next: t.next, skipped: t.skipped, lessons: t.lessons, items, status, basis };
  });
}

// ---- intervention format: whole class, small group or one-on-one ----
function recommendFormat(nShare, classSize) {
  if (nShare >= classSize / 2) return "whole";
  if (nShare >= 2) return "small";
  return "one";
}

// ---- IEP goal drafts: condition, behavior, accuracy criterion, measurement, date ----
const IEP_TEMPLATES = {
  PA:  { condition: "10 spoken words with 3 to 5 sounds", behavior: "segment and blend each word orally", target: 90, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes", task: "spoken words segmented and blended correctly" },
  PH:  { condition: "a list of 20 two-syllable decodable words", behavior: "read each word aloud correctly", target: 90, trials: "4 of 5 weekly probes", measure: "teacher-recorded word-reading probes", task: "decodable words read correctly" },
  HFW: { condition: "the grade-level high-frequency word list", behavior: "read each word aloud within 3 seconds", target: 95, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes", task: "high-frequency words read within 3 seconds" },
  VOC: { condition: "10 unfamiliar words in grade-level sentences", behavior: "explain each word's meaning using word parts or context clues", target: 80, trials: "4 of 5 trials", measure: "teacher-made vocabulary checks", task: "word meanings explained correctly" },
  LIT: { condition: "a grade-level literary passage and 5 questions", behavior: "describe the characters, setting and events and state the lesson with two supporting details", target: 80, trials: "4 of 5 trials", measure: "teacher-made comprehension checks", task: "questions answered correctly" },
  INF: { condition: "a grade-level informational passage and 5 questions", behavior: "identify the central idea and two supporting details", target: 80, trials: "4 of 5 trials", measure: "teacher-made comprehension checks", task: "questions answered correctly" },
  AG:  { condition: "a grade-level passage", behavior: "write a summary of 20 words or fewer that includes the key points", target: 80, trials: "4 of 5 trials", measure: "a summary rubric and Performance Matters items", task: "summaries scored proficient" },
  NUM: { condition: "10 grade-level number tasks (count, read, write and compare numbers)", behavior: "complete each task correctly", target: 90, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes", task: "number tasks completed correctly" },
  ADD: { condition: "20 grade-level addition and subtraction problems", behavior: "solve each problem correctly", target: 85, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes", task: "problems solved correctly" },
  MG2: { condition: "10 measurement, shape and graph tasks", behavior: "complete each task correctly", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks", task: "tasks completed correctly" },
  NS:  { condition: "10 addition and subtraction problems within 1,000", behavior: "solve each problem using place-value strategies", target: 80, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes", task: "problems solved correctly" },
  MD:  { condition: "20 multiplication and division facts from 0 to 12", behavior: "answer each fact correctly", target: 90, trials: "4 of 5 weekly probes", measure: "timed fact probes", task: "facts answered correctly" },
  FR:  { condition: "10 fraction tasks with models or number lines", behavior: "represent, place and compare unit fractions", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks and Performance Matters items", task: "fraction tasks completed correctly" },
  MGD: { condition: "10 measurement tasks with rulers, beakers and thermometers", behavior: "measure and record each quantity with the correct unit", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks", task: "measurements recorded correctly" },
  WN:  { condition: "10 multi-digit multiplication and division problems", behavior: "solve each problem correctly", target: 80, trials: "4 of 5 weekly probes", measure: "teacher-recorded probes and Performance Matters items", task: "problems solved correctly" },
  FD:  { condition: "10 grade-level fraction and decimal tasks with models or number lines", behavior: "complete each task correctly", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks and Performance Matters items", task: "tasks completed correctly" },
  AR:  { condition: "5 multi-step word problems", behavior: "write an expression and solve each problem", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks and Performance Matters items", task: "problems solved correctly" },
  MG5: { condition: "10 grade-level measurement, geometry and data tasks", behavior: "complete each task with the correct unit", target: 80, trials: "4 of 5 trials", measure: "teacher-made checks", task: "tasks completed correctly" }
};
function iepTemplate(id, G) {
  const t = { ...IEP_TEMPLATES[id] };
  if (id === "PH" && G <= 1) t.condition = "a list of 20 grade-level decodable words";
  if (id === "LIT" && G >= 3) t.behavior = "explain how a character changes and state the theme with two supporting details";
  if ((id === "LIT" || id === "INF") && G >= 3) t.measure = "teacher-made comprehension checks and Performance Matters items";
  return t;
}
// The standards a goal on this rung lines up with, taken from the class's own standards list
function alignFor(data, subject, id) {
  const list = data.standards[subject];
  let hit = list.filter(s => s.rung === id);
  if (!hit.length && (id === "PA" || id === "HFW")) hit = list.filter(s => s.rung === "PH");
  return hit.slice(0, 2).map(s => s.code);
}

const round5 = x => Math.round(x / 5) * 5;
function addMonths(iso, m) {
  const [y, mo, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + m, d));
  return t.toISOString().slice(0, 10);
}
function iepGoal(data, subject, code) {
  const s = data.students.find(x => x.code === code);
  if (!s || !s.ese) return null;
  const p = profile(data, subject, code);
  if (!p.p1) return { none: true, overall: p.overall };
  const r = p.p1, tpl = iepTemplate(r.id, data.grade);
  let baseline = null;
  const probe = s.ese.probes && s.ese.probes[r.id];
  if (probe) baseline = { pct: Math.round((probe.right / probe.total) * 100), source: "probe", date: probe.date, right: probe.right, total: probe.total };
  else {
    const pm = r.lines.find(l => l.source === "Performance Matters" && l.total);
    if (pm) baseline = { pct: pm.pct, source: "pm", right: pm.right, total: pm.total, codes: [...new Set(pm.items.map(i => i.code))] };
  }
  let target = tpl.target;
  if (baseline && baseline.pct >= target - 5) target = Math.min(100, round5(baseline.pct + 15));
  const start = s.ese.review, end = addMonths(s.ese.review, 12);
  const benchmarks = baseline ? [1, 2].map(k => ({ date: addMonths(start, 4 * k), pct: round5(baseline.pct + ((target - baseline.pct) * k) / 3) })) : [];
  return { rung: r, p, tpl, target, baseline, start, end, benchmarks, align: alignFor(data, subject, r.id) };
}

if (typeof module !== "undefined") module.exports = { lessonStatus, taughtInfo, catalog, recommendFormat, IEP_TEMPLATES, iepTemplate, iepGoal, addMonths,
  ladderFor, LADDERS, IREADY_OFFSET, iReadyGL, IREADY_ON_GRADE, FAST_CAT_OFFSET, FAST_RANGES, fastCuts, PM_GL, MIN_ITEMS, MASTERY, BANDS_REL,
  fastGL, fmtGL, band, evidence, overall, profile, standards, gradeName, gradeShort, gradeCode };

// Offline resource library (demo). In the real build these are the teacher's own saved materials.
const LIBRARY = {
  PA: {
    iv: {"one": "Sound boxes with counters: segment 5 words, then blend them back, 10 minutes", "small": "Oral sound play with whiteboards: add, drop or swap one sound, 3 to 5 students", "whole": "Two-minute phonemic awareness warm-up before every reading block"},
    en: "hearing and working with the sounds in words", es: "escuchar y manipular los sonidos de las palabras",
    esName: "conciencia fonológica",
    goal: "Segment and blend spoken words, 9 of 10 correct on a weekly check.",
    strategies: ["Sound boxes: segment and blend spoken words, 5 minutes a day",
                 "Oral warm-ups: drop or swap one sound in a word (stamp to tamp)"],
    homeEn: "Play quick sound games: say a word and ask what it sounds like without its first sound.",
    homeEs: "Jueguen con los sonidos: digan una palabra y pregunten cómo suena sin el primer sonido."
  },
  PH: {
    iv: {"one": "Word building with letter tiles, then read the same words in a decodable passage", "small": "Phonics pattern sort, then a decodable passage read twice, 15 minutes", "whole": "Daily 10-minute phonics mini-lesson with choral reading"},
    en: "sounding out words", es: "leer palabras parte por parte",
    esName: "fonética y decodificación",
    goal: "Read grade-level decodable words, 18 of 20 correct on a weekly check.",
    strategies: ["Explicit phonics lessons with word building and blending",
                 "Decodable passages: read once, then reread for accuracy"],
    homeEn: "Read together for 10 minutes. When a hard word appears, cover part of it and sound it out one chunk at a time.",
    homeEs: "Lean juntos 10 minutos. Cuando aparezca una palabra difícil, tapen una parte y léanla por partes."
  },
  HFW: {
    iv: {"one": "Heart-word mapping on 3 new words, then a quick review of known words", "small": "Sight-word phrase relay with a one-minute timed read", "whole": "Word-wall chant and phrase-reading warm-up"},
    en: "reading common words quickly", es: "leer con rapidez las palabras de uso frecuente",
    esName: "palabras de uso frecuente",
    goal: "Read the grade-level high-frequency word list with 95% accuracy.",
    strategies: ["Heart-word mapping: mark the regular and the tricky part of each word",
                 "One-minute phrase reading with sight-word phrases, graphed weekly"],
    homeEn: "Practice 5 word cards a night and put the ones read quickly in a done pile.",
    homeEs: "Practiquen 5 tarjetas de palabras cada noche y separen las que lee rápido en una pila de listas."
  },
  VOC: {
    iv: {"one": "Word-part detective: build and define 5 words from one base word", "small": "Context-clue cards: predict the meaning, then check with a partner", "whole": "Word of the day with a picture and a sentence map"},
    en: "figuring out what new words mean", es: "descubrir el significado de palabras nuevas",
    esName: "vocabulario",
    goal: "Use word parts and context clues to explain new words, 4 of 5 correct on a weekly check.",
    strategies: ["Word-part lessons with word building",
                 "Context-clue think-alouds using sentences from class texts"],
    homeEn: "When you read or watch something together, stop at one new word and guess its meaning from the sentence.",
    homeEs: "Cuando lean o vean algo juntos, deténganse en una palabra nueva y adivinen su significado por la oración. Busquen palabras parecidas en español e inglés, como familia y family."
  },
  LIT: {
    iv: {"one": "Reread a short story with the teacher and fill a story map", "small": "Guided reading with sentence starters, for example: The character learns that...", "whole": "Interactive read-aloud with think-alouds on characters and the lesson"},
    en: "understanding characters and lessons in stories", es: "comprender los personajes y el mensaje de los cuentos",
    esName: "lectura de cuentos",
    goal: "Retell a story and state its lesson with two details, 3 of 4 on the class rubric.",
    strategies: ["Story maps: characters, setting and events, with one detail each",
                 "Lesson or theme statements backed by two details from the text"],
    homeEn: "After a story or show, ask how the main character changed and what lesson they learned.",
    homeEs: "Después de un cuento o programa, pregunten cómo cambió el personaje principal y qué lección aprendió."
  },
  INF: {
    iv: {"one": "Highlight and label: central idea in one color, details in another", "small": "Close reading of a short article with a central idea organizer", "whole": "Shared reading of a nonfiction text with a class central-idea anchor chart"},
    en: "finding the main idea in nonfiction", es: "encontrar la idea principal en textos informativos",
    esName: "lectura de textos informativos",
    goal: "State the central idea and two supporting details in 4 of 5 short passages.",
    strategies: ["Central idea plus two details organizer",
                 "Text-feature hunts: headings, captions, diagrams and bold words"],
    homeEn: "Read a short article or a label together and ask what it is mostly about.",
    homeEs: "Lean juntos un artículo corto o una etiqueta y pregunten de qué se trata principalmente."
  },
  AG: {
    iv: {"one": "Retell aloud in three sentences, then write it as a 20-word summary", "small": "Summary relay: each student adds one key point, then the group trims to 20 words", "whole": "Figurative-language hunt in a mentor text with partner talk"},
    en: "summarizing and understanding figurative language", es: "resumir y entender el lenguaje figurado",
    esName: "resumir y comparar textos",
    goal: "Write a 20-word summary that keeps the key points in 4 of 5 passages.",
    strategies: ["20-word summaries after each section of a text",
                 "Figurative-language sort: metaphor, personification, hyperbole"],
    homeEn: "Ask your child to retell a story or movie in three sentences.",
    homeEs: "Pidan a su hijo o hija que cuente un cuento o una película en tres oraciones."
  },
  NUM: {
    iv: {"one": "Count and build numbers with ten-frames and base-ten blocks, then write them", "small": "Hundred-chart and number-line games: find, compare and order numbers, 3 to 5 students", "whole": "Daily counting routine: count on and back by ones and tens from any number"},
    en: "counting and understanding place value", es: "contar y entender el valor posicional",
    esName: "conteo y valor posicional",
    goal: "Count, read and compare grade-level numbers, 9 of 10 correct on a weekly check.",
    strategies: ["Ten-frames and base-ten blocks to build numbers as tens and ones",
                 "Hundred-chart and number-line games to compare and order numbers"],
    homeEn: "Count real things together, like steps or coins, and group them in tens.",
    homeEs: "Cuenten cosas reales juntos, como escalones o monedas, y agrúpenlas de diez en diez."
  },
  ADD: {
    iv: {"one": "Solve addition and subtraction stories with counters, then write the equation", "small": "Fact-strategy games: make ten, doubles and count on, 3 to 5 students", "whole": "Daily number talk on adding and subtracting strategies"},
    en: "adding and subtracting", es: "sumar y restar",
    esName: "suma y resta",
    goal: "Add and subtract within the grade-level range, 9 of 10 correct on a weekly check.",
    strategies: ["Make-ten and doubles strategies with ten-frames",
                 "Act out and draw word problems before writing the equation"],
    homeEn: "Make up quick story problems at dinner: 5 forks, take away 2, how many are left?",
    homeEs: "Inventen problemas cortos en la cena: 5 tenedores, quitamos 2, ¿cuántos quedan?"
  },
  MG2: {
    iv: {"one": "Measure and compare objects with cubes or a ruler, then record the result", "small": "Shape and measurement stations: sort shapes, compare lengths, read a clock", "whole": "Class data question turned into a picture graph together"},
    en: "measuring, shapes and reading simple graphs", es: "medir, las figuras y leer gráficas sencillas",
    esName: "medición, figuras y datos",
    goal: "Measure, name shapes and read simple graphs, 4 of 5 correct on a weekly check.",
    strategies: ["Measure real objects and compare which is longer or shorter",
                 "Sort and name shapes, then build picture graphs from class data"],
    homeEn: "Find shapes around the house and compare which things are longer or shorter.",
    homeEs: "Busquen figuras en la casa y comparen qué cosas son más largas o más cortas."
  },
  NS: {
    iv: {"one": "Base-ten blocks: build, add and regroup numbers with the teacher", "small": "Open number line practice with 3-digit addition and subtraction", "whole": "Number talk on mental addition and subtraction strategies"},
    en: "place value and adding and subtracting larger numbers", es: "el valor posicional y sumar y restar números grandes",
    esName: "sumar y restar",
    goal: "Add and subtract multi-digit numbers, 9 of 10 correct on a weekly check.",
    strategies: ["Place-value charts and base-ten blocks to 10,000",
                 "Open number lines for multi-digit addition and subtraction"],
    homeEn: "Add up prices at the store and estimate the total before checkout.",
    homeEs: "Sumen precios en la tienda y estimen el total antes de pagar."
  },
  MD: {
    iv: {"one": "Array cards: build the array, write the fact and its related division fact", "small": "Fact-family games with one target set of facts at a time", "whole": "Daily multiplication fluency routine with skip-counting"},
    en: "multiplication and division facts", es: "las tablas de multiplicar y dividir",
    esName: "multiplicar y dividir",
    goal: "Multiply and divide facts 0 to 12, 9 of 10 correct on a weekly check.",
    strategies: ["Arrays and area models to build facts 0 to 12",
                 "Fact families: link each multiplication fact to its division facts"],
    homeEn: "Practice one fact family a night, like 3 × 4 = 12 and 12 ÷ 3 = 4.",
    homeEs: "Practiquen una familia de operaciones cada noche, como 3 × 4 = 12 y 12 ÷ 3 = 4."
  },
  FR: {
    iv: {"one": "Fold paper strips into equal parts and name each part", "small": "Fraction strips on a number line: place, compare and explain", "whole": "Fraction of the day: show a model, then write and compare as a class"},
    en: "understanding fractions", es: "entender las fracciones",
    esName: "fracciones",
    goal: "Place and compare fractions with the same numerator or denominator, 4 of 5 correct on a weekly check.",
    strategies: ["Fraction strips and number lines for unit fractions",
                 "Compare fractions with the same numerator or the same denominator"],
    homeEn: "Cut food into equal parts and name each piece: one-fourth, one-third.",
    homeEs: "Corten la comida en partes iguales y nombren cada pedazo: un cuarto, un tercio."
  },
  MGD: {
    iv: {"one": "Measure classroom objects together and record each with its unit", "small": "Measurement stations: ruler, beaker and thermometer", "whole": "Class survey turned into a bar graph built together"},
    en: "measuring, shapes and reading graphs", es: "medir, las figuras y leer gráficas",
    esName: "medición, geometría y datos",
    goal: "Measure length, liquid volume and temperature with tools, 4 of 5 correct.",
    strategies: ["Measure real objects with rulers, beakers and thermometers",
                 "Build and read bar graphs and line plots from class data"],
    homeEn: "Measure things at home together: a table with a ruler, water in a measuring cup.",
    homeEs: "Midan cosas en casa: una mesa con una regla, agua en una taza de medir."
  },
  WN: {
    iv: {"one": "Area model and partial products: one multiplication or division problem step by step", "small": "Multi-digit multiplication and division with area models, then the standard algorithm", "whole": "Number talk on estimating products and quotients"},
    en: "place value and multiplying and dividing larger numbers", es: "el valor posicional y multiplicar y dividir números grandes",
    esName: "operaciones con números enteros",
    goal: "Multiply and divide multi-digit whole numbers, 4 of 5 correct on a weekly check.",
    strategies: ["Area models and partial products before the standard algorithm",
                 "Estimate first, then check the answer against the estimate"],
    homeEn: "Estimate costs at the store: about how much would 3 of these cost?",
    homeEs: "Estimen precios en la tienda: ¿cuánto costarían más o menos 3 de estos?"
  },
  FD: {
    iv: {"one": "Fraction strips and a hundredths grid: model it, then write the fraction or decimal", "small": "Number-line work: place, compare and add fractions and decimals", "whole": "Fraction or decimal of the day with a model and a number line"},
    en: "fractions and decimals", es: "las fracciones y los decimales",
    esName: "fracciones y decimales",
    goal: "Compare and compute with grade-level fractions and decimals, 4 of 5 correct on a weekly check.",
    strategies: ["Fraction strips, area models and number lines before rules",
                 "Connect fractions and decimals with tenths and hundredths grids"],
    homeEn: "Use measuring cups when cooking and talk about halves, thirds and fourths.",
    homeEs: "Usen tazas de medir al cocinar y hablen de mitades, tercios y cuartos."
  },
  AR: {
    iv: {"one": "Bar model for one multi-step word problem, then write the expression", "small": "Expression and pattern sorts: write, evaluate and explain", "whole": "Daily which-one-doesn't-belong routine with expressions"},
    en: "word problems, expressions and patterns", es: "problemas, expresiones y patrones",
    esName: "razonamiento algebraico",
    goal: "Write and solve expressions for multi-step problems, 4 of 5 correct on a weekly check.",
    strategies: ["Bar models to plan multi-step word problems",
                 "Write and evaluate expressions using the order of operations"],
    homeEn: "Look for number patterns together, like the cost of 1, 2 and 3 tickets.",
    homeEs: "Busquen patrones de números juntos, como el precio de 1, 2 y 3 boletos."
  },
  MG5: {
    iv: {"one": "Measure angles, area or volume with tools and record each with its unit", "small": "Geometry and data stations: protractor, area grid, coordinate plane, line plot", "whole": "Class data project with a line plot and a short write-up"},
    en: "measurement, geometry and data", es: "la medición, la geometría y los datos",
    esName: "medición, geometría y datos",
    goal: "Solve grade-level measurement, geometry and data problems, 4 of 5 correct on a weekly check.",
    strategies: ["Hands-on measuring with protractors, grids and unit cubes",
                 "Build and read line plots and tables from class data"],
    homeEn: "Measure things at home together and talk about the units: inches, feet, cups.",
    homeEs: "Midan cosas en casa y hablen de las unidades: pulgadas, pies, tazas."
  }
};

// ===== Odin 0.3: progress monitoring, weekly focus, interests and content matching =====
// Plain code, no AI. Every number on screen can be traced to a row in the data.
const ODIN_VERSION = "0.9.5-alpha";
const CHECK_PASS = 0.8;   // a post-check at or above 80% means the weekly skill is met
const CHECK_LOW = 0.6;    // two post-checks in a row under 60% on the same skill: not responding yet
const YEAR_GROWTH = 1.0;  // a typical year of growth on the grade-level scale

const avgOf = a => a.reduce((x, y) => x + y, 0) / a.length;
function addDaysISO(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(iso) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
const daysBetween = (a, b) => (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000;
const fileGrade = (data, f) => (f.grade != null ? f.grade : data.grade);
const fileLabel = f => (f.what || "").split(" · ")[0] || f.source;
const rungOf = (subject, G, id) => ladderFor(subject, G).find(r => r.id === id);

// ---------- progress monitoring ----------
// Every result for one student and subject, current and past, converted to the grade-level scale.
// gl is absolute (3.4 = grade 3, fourth tenth); rel is gl minus the grade the student was in when tested.
function progressPoints(data, subject, code) {
  const G = data.grade, L = ladderFor(subject, G), out = [];
  for (const f of data.files) {
    if (f.subject !== subject || f.pending) continue;
    const row = f.rows[code];
    if (!row) continue;
    const Gt = fileGrade(data, f);
    const base = { date: f.date, file: f.name, source: f.source, label: fileLabel(f), Gt, history: !!f.history, active: !!f.active };
    const add = (skill, gl, raw) => { if (gl != null && isFinite(gl)) out.push({ ...base, skill, gl: r1(gl), rel: r1(gl - Gt), raw }); };
    if (f.source === "i-Ready") {
      add("overall", iReadyGL(row.overall, Gt), row.overall);
      const doms = ireadyDomains(subject, G);
      for (const r of L) {
        const ds = (doms[r.id] || []).filter(([k]) => iReadyGL(row[k], Gt) != null);
        if (ds.length) add(r.id, avgOf(ds.map(([k]) => iReadyGL(row[k], Gt))), ds.map(([k]) => row[k]).join(" / "));
      }
    } else if (f.source === "FAST") {
      add("overall", fastGL(subject, row.ss, Gt), `${row.ss}, Level ${row.level}`);
      const cats = fastCats(subject, Gt);
      for (const r of L) if (cats[r.id] && row[r.id] in FAST_CAT_OFFSET) add(r.id, Gt + FAST_CAT_OFFSET[row[r.id]], row[r.id]);
    } else if (f.source === "Performance Matters") {
      for (const r of L) {
        const ks = f.items.map((it, k) => (it.rung === r.id ? k : -1)).filter(k => k >= 0);
        if (ks.length >= MIN_ITEMS) { const right = ks.reduce((a, k) => a + (row[k] || 0), 0); add(r.id, PM_GL(right / ks.length, Gt), `${right} of ${ks.length} items`); }
      }
    } else if (f.source === "Retired test") {
      if (row.overall != null) add("overall", PM_GL(row.overall / 100, Gt), row.overall + "%");
      for (const r of L) if (row[r.id] != null) add(r.id, PM_GL(row[r.id] / 100, Gt), row[r.id] + "%");
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
}

// Growth from the whole-test results: a straight-line fit when there are 3 or more results over at least 3 months.
function growthSummary(points) {
  const pts = points.filter(p => p.skill === "overall");
  if (!pts.length) return { n: 0 };
  const first = pts[0], latest = pts[pts.length - 1];
  const months = daysBetween(first.date, latest.date) / 30.44;
  const out = { n: pts.length, first, latest, months: Math.round(months), change: r1(latest.gl - first.gl), gapChange: r1(latest.rel - first.rel) };
  if (pts.length >= 2 && months >= 3) {
    const xs = pts.map(p => daysBetween(first.date, p.date) / 365.25), ys = pts.map(p => p.gl);
    const mx = avgOf(xs), my = avgOf(ys);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    out.perYear = sxx ? r1(xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx) : null;
    out.status = out.perYear == null ? "soon" : out.perYear >= YEAR_GROWTH + 0.15 ? "faster" : out.perYear >= YEAR_GROWTH - 0.15 ? "typical" : "slow";
  } else out.status = "soon";
  return out;
}
// Growth in words, with the student's place in mind: slow growth while on grade level is a watch, not a widening gap.
function growthWords(g) {
  const on = g.latest && g.latest.rel >= 0;
  if (g.status === "faster") return on ? "Growing faster than a year per year: moving ahead" : "Growing faster than a year per year: closing the gap";
  if (g.status === "typical") return on ? "About a year of growth per year: staying on grade level" : "About a year of growth per year: the gap is holding";
  if (g.status === "slow") return on ? "Growing slower than a year per year: on grade level now, watch it" : "Growing slower than a year per year: the gap is widening";
  return "Too soon to measure growth: needs results at least 3 months apart";
}
const GROWTH_WORDS = {
  faster: "Growing faster than a year per year: closing the gap",
  typical: "About a year of growth per year: the gap is holding",
  slow: "Growing slower than a year per year: the gap is widening",
  soon: "Too soon to measure growth: needs results at least 3 months apart"
};

// Each weekly check this student took on one skill: pre and post, by week.
function studentChecks(data, subject, code) {
  const by = {};
  for (const c of data.checks || []) {
    if (c.subject !== subject || c.scores[code] == null) continue;
    const k = c.week + "|" + c.skill;
    const e = by[k] || (by[k] = { week: c.week, skill: c.skill, pre: null, post: null });
    e[c.kind] = { right: c.scores[code], total: c.total, pct: c.scores[code] / c.total, form: c.form, id: c.id };
  }
  return Object.values(by).sort((a, b) => a.week.localeCompare(b.week) || a.skill.localeCompare(b.skill));
}

// The weakness finder: patterns across every result, not just the latest test.
function findIssues(data, subject, code, pts) {
  pts = pts || progressPoints(data, subject, code);
  const L = ladderFor(subject, data.grade), issues = [];
  const name = id => (L.find(r => r.id === id) || { name: id }).name;
  for (const r of L) {
    const s = pts.filter(p => p.skill === r.id);
    if (!s.length) continue;
    const last = s.slice(-3), low = last.filter(p => p.rel < BANDS_REL.support);
    if (last.length >= 2 && low.length >= 2 && last[last.length - 1].rel < BANDS_REL.support)
      issues.push({ kind: "persistent", skill: r.id, sev: 3, title: `${r.name}: still below grade level`,
        text: `Below grade level in ${low.length} of the last ${last.length} results, starting ${low[0].label} (${low[0].date.slice(0, 7)}).` });
    if (s.length >= 2) {
      // slipping: the latest result is lower than the previous result from the same test (i-Ready to i-Ready, FAST to FAST),
      // on the absolute grade-level scale, so different tests disagreeing is not counted as a drop
      const b = s[s.length - 1], a = [...s.slice(0, -1)].reverse().find(x => x.source === b.source && x.date < b.date);
      if (a && b.gl - a.gl <= -0.4) issues.push({ kind: "slipping", skill: r.id, sev: 2, title: `${r.name}: slipping`,
        text: `Down ${r1(a.gl - b.gl).toFixed(1)} of a grade level on ${b.source}, from ${a.label} (${a.date.slice(0, 7)}) to ${b.label} (${b.date.slice(0, 7)}).` });
      if (s[0].rel < BANDS_REL.support && b.rel >= 0) issues.push({ kind: "improving", skill: r.id, sev: 0, title: `${r.name}: caught up`,
        text: `Below grade level on ${s[0].label}, at grade level on ${b.label}.` });
    }
  }
  const bm = {};
  for (const f of data.files) {
    if (f.subject !== subject || f.source !== "Performance Matters" || f.pending || !f.rows[code]) continue;
    f.items.forEach((it, k) => { const e = bm[it.code] || (bm[it.code] = { label: it.label, right: 0, total: 0, rung: it.rung }); e.right += f.rows[code][k] || 0; e.total += 1; });
  }
  Object.entries(bm).forEach(([c, e]) => {
    if (e.total >= 3 && e.right / e.total < 0.6) issues.push({ kind: "benchmark", skill: e.rung, sev: 2, title: `${c} ${e.label}: missed items`,
      text: `${e.right} of ${e.total} Performance Matters items right (${Math.round((100 * e.right) / e.total)}%) across every test that asked about it.` });
  });
  const sc = studentChecks(data, subject, code);
  const bySkill = {};
  sc.forEach(c => { if (c.post) (bySkill[c.skill] = bySkill[c.skill] || []).push(c.post.pct); });
  Object.entries(bySkill).forEach(([id, a]) => {
    if (a.length >= 2 && a[a.length - 1] < CHECK_LOW && a[a.length - 2] < CHECK_LOW)
      issues.push({ kind: "stuck", skill: id, sev: 3, title: `${name(id)}: not responding yet`,
        text: `Post-checks under ${Math.round(CHECK_LOW * 100)}% for ${a.length >= 3 && a[a.length - 3] < CHECK_LOW ? 3 : 2} weeks in a row. Change the approach: a different format, more time, or a different resource.` });
  });
  return issues.sort((a, b) => b.sev - a.sev);
}

// ---------- weekly focus ----------
// A skill stays the weekly focus until a post-check shows it met (80% or more): then the next need moves up.
// When the roadmap teaches the student's secondary-need skill this week or next, that skill moves up for
// pre-teaching and the old focus becomes the secondary focus until the lesson has passed.
function focusFor(data, subject, code, week) {
  const p = profile(data, subject, code);
  const sc = studentChecks(data, subject, code);
  const before = sc.filter(c => c.week < week);
  const latestPost = id => { const a = before.filter(c => c.skill === id && c.post); return a.length ? a[a.length - 1].post : null; };
  const met = p.rungs.filter(r => { const lp = latestPost(r.id); return lp && lp.pct >= CHECK_PASS; }).map(r => r.id);
  const order = [...p.rungs].sort((a, b) => a.level - b.level || (a.gl ?? 99) - (b.gl ?? 99));
  const cands = [...order.filter(r => r.band === "support"), ...order.filter(r => r.band === "approaching")].filter(r => !met.includes(r.id));
  let focus = cands[0] || null, second = cands[1] || null, kind = "need", preTeach = null;
  if (second && data.roadmap && data.roadmap[subject]) {
    const cat = catalog(data, subject), end = addDaysISO(week, 13);
    const l = data.roadmap[subject].lessons.filter(x => x.date >= week && x.date <= end && lessonStatus(data, x) !== "nottaught")
      .sort((a, b) => a.date.localeCompare(b.date))
      .find(x => x.standards.some(c => (cat.find(z => z.code === c) || {}).rung === second.id));
    if (l) {
      const c = l.standards.find(z => (cat.find(y => y.code === z) || {}).rung === second.id);
      preTeach = { rung: second, code: c, label: (cat.find(z => z.code === c) || {}).label || c, date: l.date, lesson: l.title, was: focus };
      [focus, second] = [second, focus];
      kind = "preteach";
    }
  }
  const track = kind === "preteach" ? second : focus;
  let weeksOn = 0;
  if (track) for (let w = addDaysISO(week, -7); before.some(c => c.week === w && c.skill === track.id); w = addDaysISO(w, -7)) weeksOn++;
  const lastPost = track ? latestPost(track.id) : null;
  const posts = track ? before.filter(c => c.skill === track.id && c.post).map(c => c.post.pct) : [];
  const stuck = posts.length >= 2 && posts[posts.length - 1] < CHECK_LOW && posts[posts.length - 2] < CHECK_LOW;
  const status = !focus ? "none" : kind === "preteach" ? "preteach" : stuck ? "stuck" : weeksOn === 0 ? "new" : "continue";
  const thisWeek = sc.filter(c => c.week === week);
  return { focus, second, kind, preTeach, weeksOn, lastPost, met, status, thisWeek, p };
}
const FOCUS_STATUS = { new: "New focus this week", continue: "Continue: not met yet", stuck: "Not responding yet: change the approach",
  preteach: "Pre-teach: the roadmap teaches the secondary need soon", none: "No focus: every skill at grade level or met" };

// The class view of one week: groups by focus skill, and what the roadmap brings in the next weeks.
function weekPlan(data, subject, week) {
  const rows = data.students.map(s => ({ s, f: focusFor(data, subject, s.code, week) }));
  const groups = {};
  rows.forEach(x => { const k = x.f.focus ? x.f.focus.id : "none"; (groups[k] = groups[k] || []).push(x); });
  const L = ladderFor(subject, data.grade);
  const list = Object.entries(groups).map(([id, members]) => {
    const r = L.find(z => z.id === id);
    return { key: id, id, rung: r || null, preteach: members.filter(x => x.f.kind === "preteach").length, members };
  }).sort((a, b) => (a.id === "none") - (b.id === "none") || ((a.rung || {}).level || 99) - ((b.rung || {}).level || 99));
  const cat = catalog(data, subject);
  const ahead = [0, 1, 2, 3].map(k => {
    const ws = addDaysISO(week, 7 * k), we = addDaysISO(ws, 6);
    const lessons = ((data.roadmap || {})[subject] || { lessons: [] }).lessons.filter(l => l.date >= ws && l.date <= we && lessonStatus(data, l) !== "nottaught");
    const codes = [...new Set(lessons.flatMap(l => l.standards))];
    const tiers = [...new Set(codes.map(c => (cat.find(x => x.code === c) || {}).rung).filter(Boolean))];
    const weak = tiers.map(t => ({ id: t, rung: L.find(r => r.id === t), codes: rows.filter(x => (x.f.p.rungs.find(r => r.id === t) || {}).band === "support").map(x => x.s.code) }));
    return { week: ws, lessons, codes, weak };
  });
  return { rows, groups: list, ahead };
}

// ---------- interest inventory ----------
const INTEREST_TOPICS = [
  { id: "animals", label: "Animals", icon: "🐾", g: [0, 5] }, { id: "pets", label: "Pets", icon: "🐶", g: [0, 5] },
  { id: "ocean", label: "Ocean life", icon: "🐠", g: [0, 5] }, { id: "dinosaurs", label: "Dinosaurs", icon: "🦕", g: [0, 5] },
  { id: "space", label: "Space", icon: "🚀", g: [0, 5] }, { id: "weather", label: "Weather and storms", icon: "⛈️", g: [0, 5] },
  { id: "nature", label: "Nature and plants", icon: "🌱", g: [0, 5] }, { id: "florida", label: "Florida and the Everglades", icon: "🐊", g: [0, 5] },
  { id: "soccer", label: "Soccer", icon: "⚽", g: [0, 5] }, { id: "basketball", label: "Basketball", icon: "🏀", g: [0, 5] },
  { id: "baseball", label: "Baseball", icon: "⚾", g: [0, 5] }, { id: "football", label: "Football", icon: "🏈", g: [0, 5] },
  { id: "building", label: "Building games", icon: "🧱", g: [0, 5] }, { id: "videogames", label: "Video games", icon: "🎮", g: [0, 5] },
  { id: "art", label: "Art and drawing", icon: "🎨", g: [0, 5] }, { id: "music", label: "Music", icon: "🎵", g: [0, 5] },
  { id: "dance", label: "Dance", icon: "💃", g: [0, 5] }, { id: "cooking", label: "Cooking and food", icon: "🍳", g: [0, 5] },
  { id: "vehicles", label: "Cars, trucks and planes", icon: "🚗", g: [0, 5] }, { id: "robots", label: "Robots and technology", icon: "🤖", g: [0, 5] },
  { id: "science", label: "Science experiments", icon: "🧪", g: [0, 5] }, { id: "heroes", label: "Heroes and adventure", icon: "🦸", g: [0, 5] },
  { id: "funny", label: "Funny stories and jokes", icon: "😂", g: [0, 5] }, { id: "friends", label: "Friends and family stories", icon: "🤝", g: [0, 5] },
  { id: "coding", label: "Coding", icon: "💻", g: [2, 5] }, { id: "mystery", label: "Mysteries", icon: "🔍", g: [2, 5] },
  { id: "history", label: "History and how people lived", icon: "🏛️", g: [2, 5] }, { id: "fashion", label: "Fashion and design", icon: "👗", g: [2, 5] },
  { id: "travel", label: "Places around the world", icon: "🗺️", g: [2, 5] }
];
const READ_FORMATS = [
  { id: "comics", label: "Comics and graphic novels", icon: "💬" }, { id: "facts", label: "Fact books", icon: "📘" },
  { id: "stories", label: "Story books", icon: "📖" }, { id: "poems", label: "Poems and songs", icon: "🎶" },
  { id: "articles", label: "Magazines and articles", icon: "📰" }, { id: "audio", label: "Audiobooks", icon: "🎧" }
];
const LEARN_STYLES = [
  { id: "games", label: "Games", icon: "🎲" }, { id: "handson", label: "Building and hands-on", icon: "🛠️" },
  { id: "drawing", label: "Drawing it out", icon: "✏️" }, { id: "partner", label: "Talking with a partner", icon: "💬" },
  { id: "videos", label: "Videos", icon: "📺" }, { id: "tablet", label: "Tablet or computer", icon: "📱" },
  { id: "moving", label: "Moving and acting it out", icon: "🤸" }
];
const topicsFor = G => INTEREST_TOPICS.filter(t => G >= t.g[0] && G <= t.g[1]);
const topicLabel = id => (INTEREST_TOPICS.find(t => t.id === id) || { label: id }).label;

// ---------- 0.3.1: family consent and records requests ----------
// The interest inventory (survey, paper inventory, write-ins, trend list, family consent) is NOT in this version:
// it is a roadmap option that needs the school's written approval. The code stays, switched off here.
const FEATURE_INTERESTS = false;
// When it is switched on, interest answers are collected and used only while the family's answer is yes.
const consentOk = s => FEATURE_INTERESTS && !!(s && s.consent && s.consent.status === "granted");
const CONSENT_WORDS = { granted: "Yes", pending: "Not returned", declined: "No" };
const REQUEST_DAYS = 30;   // Florida: answer a records request within 30 days (rule 6A-1.0955)
const REQUEST_KINDS_ALL = [{ id: "see", label: "See the records" }, { id: "copy", label: "Get a copy" },
  { id: "correct", label: "Ask for a correction" }, { id: "withdraw", label: "Withdraw consent and delete interest answers" }];
const REQUEST_KINDS = REQUEST_KINDS_ALL.filter(k => FEATURE_INTERESTS || k.id !== "withdraw");

function interestProfile(all) {
  const students = all.filter(consentOk);
  const n = students.filter(s => s.interests && (s.interests.topics || []).length).length;
  const count = (list, key) => list.map(t => ({ ...t, count: students.filter(s => s.interests && (s.interests[key] || []).includes(t.id)).length }))
    .filter(t => t.count).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const w = {}, pending = [], hidden = [];
  students.forEach(s => (s.interests && s.interests.writeins || []).forEach(x => {
    if (x.ok === true) { const k = x.text.trim().toLowerCase(); w[k] = (w[k] || 0) + 1; }
    else if (x.ok === false) hidden.push({ code: s.code, text: x.text });
    else pending.push({ code: s.code, text: x.text });
  }));
  return { n, topics: count(INTEREST_TOPICS, "topics"), read: count(READ_FORMATS, "read"), learn: count(LEARN_STYLES, "learn"),
    writeins: Object.entries(w).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)), pending, hidden };
}
const approvedWriteins = s => ((s.interests && s.interests.writeins) || []).filter(x => x.ok === true).map(x => x.text);

// ---------- content matching ----------
// Only the skill, the item topics (benchmarks), the working level, the grade, interest topics, approved write-ins
// and the school's trend tags for the grade are used.
const trendTags = (trends, G) => (trends || []).filter(t => G >= t.g[0] && G <= t.g[1]).map(t => t.tag);
// No name, code or score leaves this function. Paid products the school has not bought are left out.
function matchContent(resources, q, limit = 4) {
  const band = Math.max(0, Math.min(8, Math.floor(q.level + 1e-6)));
  const fmt = q.format || "small";
  let hidden = 0;
  const out = [];
  for (const r of resources || []) {
    if (r.subject !== q.subject) continue;
    const skillHit = r.skills.includes(q.skill);
    const stdHit = (r.standards || []).filter(c => (q.standards || []).includes(c));
    if (!skillHit && !stdHit.length) continue;
    if (r.access === "not-owned") { hidden++; continue; }
    if (q.grade < r.age[0] || q.grade > r.age[1]) continue;
    const fit = band >= r.level[0] && band <= r.level[1] ? 2 : band === r.level[0] - 1 || band === r.level[1] + 1 ? 1 : 0;
    if (!fit) continue;
    const ints = (r.interests || []).filter(i => (q.interests || []).includes(i));
    const kws = (r.keywords || []).filter(k => (q.keywords || []).some(w => { const a = w.toLowerCase(), b = k.toLowerCase(); return a.includes(b) || b.includes(a); }));
    // current trends: the school's trend list for this grade (kept by an administrator; Odin never looks online)
    const trs = (q.trends || []).filter(t => (r.keywords || []).some(k => { const a = t.toLowerCase(), b = k.toLowerCase(); return a.includes(b) || b.includes(a); }));
    const score = (skillHit ? 40 : 0) + (stdHit.length ? 15 : 0) + (fit === 2 ? 20 : 8) + 8 * Math.min(ints.length, 3) + (kws.length ? 6 : 0) + (trs.length ? 4 : 0) + ((r.formats || []).includes(fmt) ? 5 : 0);
    const why = [];
    if (skillHit) why.push("skill");
    if (stdHit.length) why.push("benchmark " + stdHit.join(", "));
    why.push(fit === 2 ? "fits the level" : "one level off");
    ints.forEach(i => why.push(topicLabel(i)));
    kws.forEach(k => why.push("“" + k + "”"));
    if (trs.length) why.push("trending: " + trs[0]);
    out.push({ r, score, why, fit });
  }
  out.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title));
  // keep the list varied: no more than two of the same kind
  const picked = [], kinds = {};
  for (const o of out) { if ((kinds[o.r.kind] || 0) >= 2) continue; kinds[o.r.kind] = (kinds[o.r.kind] || 0) + 1; picked.push(o); if (picked.length >= limit) break; }
  return { options: picked, total: out.length, hidden, band };
}
// The query for a group of students sharing one focus skill: median level, shared interests, approved write-ins.
function groupQuery(data, subject, skillId, codes, standardsHint) {
  const ss = data.students.filter(s => codes.includes(s.code)), ok = ss.filter(consentOk);
  const lv = ss.map(s => { const p = profile(data, subject, s.code); const r = p.rungs.find(z => z.id === skillId); return r && r.gl != null ? r.gl : p.overall.gl; }).filter(v => v != null).sort((a, b) => a - b);
  const level = lv.length ? lv[Math.floor((lv.length - 1) / 2)] : data.grade;
  const cnt = {};
  ok.forEach(s => ((s.interests && s.interests.topics) || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
  const interests = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([t]) => t);
  const keywords = [...new Set(ok.flatMap(approvedWriteins).map(w => w.toLowerCase()))].slice(0, 6);
  return { subject, skill: skillId, standards: standardsHint || [], level, grade: data.grade, interests, keywords, format: recommendFormat(codes.length, data.students.length) };
}
// Benchmarks behind a skill the student or group missed most often: the "item topics".
function missedBenchmarks(data, subject, skillId, codes) {
  const m = {};
  for (const f of data.files) {
    if (f.subject !== subject || f.source !== "Performance Matters" || f.pending) continue;
    f.items.forEach((it, k) => { if (it.rung !== skillId) return; codes.forEach(c => { if (f.rows[c] && f.rows[c][k] === 0) m[it.code] = (m[it.code] || 0) + 1; }); });
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
}

if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { ODIN_VERSION, CHECK_PASS, CHECK_LOW, addDaysISO, mondayOf,
  progressPoints, growthSummary, growthWords, studentChecks, findIssues, focusFor, weekPlan, interestProfile, matchContent, groupQuery, missedBenchmarks,
  INTEREST_TOPICS, READ_FORMATS, LEARN_STYLES, topicsFor, trendTags, consentOk, CONSENT_WORDS, REQUEST_DAYS, REQUEST_KINDS, REQUEST_KINDS_ALL, FEATURE_INTERESTS });

// ===== Odin 0.3: quick checks for the weekly focus skill =====
// Form A is the pre-check (Monday), Form B the post-check (Friday): same skill, same difficulty, different items.
// The level band comes from the student's or group's working level in that skill, so the check fits their ability.
// Math items are generated from a fixed seed, so every form and its answer key are always the same.
function seeded(str) { let s = 2166136261; for (const ch of str) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; } return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
function frac(n, d) { const g = gcd(n, d); n /= g; d /= g; if (d === 1) return String(n); if (n > d) return `${Math.floor(n / d)} ${n % d}/${d}`; return `${n}/${d}`; }
const nf = n => n.toLocaleString("en-US");
const bandOf = level => Math.max(0, Math.min(5, Math.floor((level == null ? 0 : level) + 1e-6)));
const BAND_WORD = b => (b === 0 ? "kindergarten level" : `grade ${b} level`);

// ---------- reading banks (word lists from the public-domain Dolch lists; items written for Odin) ----------
const PA_FORMS = {
  basic: {
    A: [["Blend these sounds: /m/ /a/ /p/", "map"], ["Blend these sounds: /s/ /t/ /o/ /p/", "stop"], ["How many sounds in “sun”? Say each one.", "3: /s/ /u/ /n/"],
        ["How many sounds in “fish”? Say each one.", "3: /f/ /i/ /sh/"], ["Say “cat” without the /k/.", "at"]],
    B: [["Blend these sounds: /d/ /o/ /g/", "dog"], ["Blend these sounds: /f/ /l/ /a/ /t/", "flat"], ["How many sounds in “bed”? Say each one.", "3: /b/ /e/ /d/"],
        ["How many sounds in “chip”? Say each one.", "3: /ch/ /i/ /p/"], ["Say “meat” without the /m/.", "eat"]]
  },
  advanced: {
    A: [["Blend these sounds: /s/ /p/ /l/ /a/ /sh/", "splash"], ["How many sounds in “frost”? Say each one.", "5: /f/ /r/ /o/ /s/ /t/"],
        ["Say “snail” without the /n/.", "sail"], ["Say “cast”. Change /k/ to /f/.", "fast"], ["Say “trip” without the /r/.", "tip"]],
    B: [["Blend these sounds: /s/ /t/ /r/ /i/ /p/", "strip"], ["How many sounds in “blend”? Say each one.", "5: /b/ /l/ /e/ /n/ /d/"],
        ["Say “slip” without the /l/.", "sip"], ["Say “mist”. Change /m/ to /l/.", "list"], ["Say “brag” without the /r/.", "bag"]]
  }
};
const PH_WORDS = {
  0: { A: "cat sit hop bed run map pig fox web cup", B: "hat lip dot net bug pan wig box ten mud", note: "short-vowel words (consonant-vowel-consonant)" },
  1: { A: "ship frog chin stamp lake bike rope thin crab flute", B: "shop plum chat crisp cake kite home thick drum cube", note: "digraphs, blends and silent e" },
  2: { A: "rain boat seed park storm turn napkin rabbit cupcake sunset", B: "train coat feet barn horn bird basket picnic pancake contest", note: "vowel teams, r-controlled vowels and two-syllable words" },
  3: { A: "tiger music robot explain reptile unhappy careful problem fantastic important", B: "pilot baby lemon complain inflate unlock helpful kitten remember invention", note: "multisyllable words: open, closed and vowel-consonant-e syllables, prefixes and suffixes" }
};
const HFW_WORDS = {
  0: { A: "the and see my can go look said you here", B: "we is it come play down little where help make", list: "Dolch pre-primer and primer" },
  1: { A: "after again could every from know once them were when", B: "any ask give going live of open over think walk", list: "Dolch first grade" },
  2: { A: "always around because been before does many their would which", B: "both buy found goes these those very wash write your", list: "Dolch second grade" },
  3: { A: "about bring carry eight laugh myself never only together warm", B: "better done draw full grow hurt kind light shall today", list: "Dolch third grade" }
};
const VOC_FORMS = {
  0: {
    A: [["Tell me a word that means the opposite of “big”.", "small or little"], ["Tell me the opposite of “hot”.", "cold"], ["Name two animals.", "any two animals"],
        ["Tell me a word that means the same as “happy”.", "glad, joyful or similar"], ["Which one does not belong: apple, banana, chair?", "chair"]],
    B: [["Tell me the opposite of “up”.", "down"], ["Tell me the opposite of “fast”.", "slow"], ["Name two foods.", "any two foods"],
        ["Tell me a word that means the same as “little”.", "small or tiny"], ["Which one does not belong: dog, cat, car?", "car"]]
  },
  2: {
    A: [["What does un- mean in “unhappy”?", "not"], ["What does re- mean in “redo”?", "again"], ["What does -ful mean in “careful”?", "full of"],
        ["What does -less mean in “fearless”?", "without"], ["“The enormous elephant could not fit through the door.” What does enormous mean?", "very big"]],
    B: [["What does dis- mean in “disagree”?", "not or the opposite of"], ["What does pre- mean in “preview”?", "before"], ["What does -er mean in “teacher”?", "one who"],
        ["What does -able mean in “readable”?", "can be"], ["“The damp towel was still drying in the sun.” What does damp mean?", "a little wet"]]
  },
  4: {
    A: [["What does mis- mean in “misread”?", "wrongly"], ["What does -ment mean in “enjoyment”?", "the state or result of"], ["What does the root port mean in “transport”?", "carry"],
        ["What does the root graph mean in “autograph”?", "write"], ["“The hikers were exhausted after climbing all day.” What does exhausted mean?", "very tired"]],
    B: [["What does inter- mean in “international”?", "between"], ["What does -ology mean in “biology”?", "the study of"], ["What does the root spect mean in “inspect”?", "look"],
        ["What does the root tele mean in “telescope”?", "far"], ["“Maria was reluctant to jump into the cold pool.” What does reluctant mean?", "not wanting to"]]
  }
};
const COMP_STEMS = {
  LIT: {
    low: { A: ["Who is the story about?", "Where does the story happen?", "What problem does the character have?", "How is the problem solved?", "What lesson does the character learn?"],
           B: ["Name a character and tell one thing they do.", "When and where does the story take place?", "What happens first, next and last?", "How does the character feel at the end, and why?", "What is the big idea or lesson of the story?"] },
    high: { A: ["Who is the main character? Give one trait and a detail that shows it.", "How does the setting matter to the story?", "What is the main problem, and why is it hard?", "How does the main character change from beginning to end?", "What is the theme? Give two details that support it."],
            B: ["Describe a character's motivation with a detail from the text.", "What event is the turning point? Why?", "From whose point of view is the story told? How do you know?", "Compare how two characters respond to the problem.", "State the theme in one sentence and support it with two details."] }
  },
  INF: {
    low: { A: ["What is this text mostly about?", "Tell one fact you learned.", "What does a picture or caption show?", "Find one word in bold or a heading. What does it tell you?", "Why did the author write this?"],
           B: ["What is the topic of this text?", "Tell two facts from the text.", "What do the headings help you find?", "What is one new word, and what does it mean?", "What did the author want you to learn?"] },
    high: { A: ["What is the central idea?", "Give two details that support the central idea.", "How is the text organized (sequence, cause and effect, compare, problem and solution)?", "What does a text feature (diagram, chart, sidebar) add?", "What is the author's purpose, and how do you know?"],
            B: ["State the central idea in your own words.", "Which two details best support it? Why?", "Find a cause and its effect in the text.", "Explain what a graphic or caption shows and how it connects to the text.", "Is the author informing, persuading or explaining? Give evidence."] }
  },
  AG: {
    high: { A: ["Summarize the passage in 20 words or fewer.", "Find a simile or metaphor. What does it mean?", "Paraphrase one important sentence.", "How do two texts on the same topic present it differently?", "What words or phrases show the author's opinion?"],
            B: ["Write a 3-sentence summary with the key points.", "Find personification or hyperbole. Explain it.", "Retell one paragraph in your own words.", "What is one way the two texts agree and one way they differ?", "Which idea from both texts matters most? Why?"] }
  }
};

// ---------- math generators: each returns [question, answer] ----------
const MATH_GEN = {
  NUM(R, b) {
    if (b <= 0) { const n = ri(R, 6, 15), a = ri(R, 2, 19), c0 = ri(R, 2, 19), c = c0 === a ? (a === 19 ? 18 : a + 1) : c0, k = ri(R, 5, 18), t = ri(R, 1, 9);
      return [[`Count the dots: ${"●".repeat(n)}`, n], [`Which is greater, ${a} or ${c}?`, Math.max(a, c)], [`What number comes right after ${k}?`, k + 1],
        [`What number comes right before ${k + 2}?`, k + 1], [`What number is 1 ten and ${t} ones?`, 10 + t]]; }
    if (b === 1) { const t = ri(R, 2, 9), o = ri(R, 0, 9), x = ri(R, 2, 9), y = ri(R, 1, 9), n = ri(R, 21, 89), m = ri(R, 21, 89), s = ri(R, 1, 6) * 10;
      const p = 10 * x + y, q = 10 * y + x === p ? p + 1 : 10 * y + x;
      return [[`What number is ${t} tens and ${o} ones?`, 10 * t + o], [`Which is greater, ${p} or ${q}?`, Math.max(p, q)], [`What is 10 more than ${n}?`, n + 10],
        [`What is 10 less than ${m}?`, m - 10], [`Count by tens: ${s}, ${s + 10}, ${s + 20}, ___`, s + 30]]; }
    const h = ri(R, 1, 9), t = ri(R, 0, 9), o = ri(R, 0, 9), n = ri(R, 100, 899), a = ri(R, 100, 999), c = ri(R, 100, 999), e = ri(R, 101, 999), s = ri(R, 2, 20) * 5;
    const ex = [Math.floor(e / 100) * 100, Math.floor((e % 100) / 10) * 10, e % 10].filter(Boolean).join(" + ");
    return [[`Write ${h} hundreds, ${t} tens and ${o} ones as a number.`, 100 * h + 10 * t + o], [`What is 100 more than ${n}?`, n + 100],
      [`Compare with <, > or =: ${a} ___ ${c}`, a > c ? ">" : a < c ? "<" : "="], [`Write ${e} in expanded form.`, ex], [`Count by fives: ${s}, ${s + 5}, ${s + 10}, ___`, s + 15]];
  },
  ADD(R, b) {
    const lim = b <= 0 ? 10 : b === 1 ? 20 : 100, out = [];
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) { const x = ri(R, lim === 100 ? 15 : 1, lim === 100 ? 68 : Math.floor(lim / 2)), y = ri(R, lim === 100 ? 17 : 1, lim - x); out.push([`${x} + ${y} = ___`, x + y]); }
      else { const x = ri(R, lim === 100 ? 41 : 3, lim), y = ri(R, lim === 100 ? 12 : 1, x - 1); out.push([`${x} − ${y} = ___`, x - y]); }
    }
    const a = ri(R, 2, lim === 100 ? 45 : Math.floor(lim / 2)), c = ri(R, 2, lim === 100 ? 45 : Math.floor(lim / 2));
    out.push([`Mia has ${a} stickers. She gets ${c} more. How many stickers does she have now?`, a + c]);
    return out;
  },
  MG2(R, b) {
    const shapes = [["triangle", 3], ["square", 4], ["hexagon", 6], ["rectangle", 4], ["pentagon", 5]];
    const sh = shapes[ri(R, 0, 4)], x = ri(R, 5, 12), y = ri(R, 2, x - 1), h = ri(R, 1, 11), cats = ri(R, 2, 6), dogs = cats + ri(R, 1, 5);
    if (b <= 1) return [[`How many sides does a ${sh[0]} have?`, sh[1]], [`A pencil is ${x} cubes long. A crayon is ${y} cubes long. How many cubes longer is the pencil?`, x - y],
      [`The short hand points to ${h} and the long hand points to 12. What time is it?`, `${h}:00`], [`A graph shows ${cats} cats and ${dogs} dogs. How many more dogs than cats?`, dogs - cats],
      [`A graph shows ${cats} cats and ${dogs} dogs. How many pets in all?`, cats + dogs]];
    const q = ri(R, 1, 3), d = ri(R, 1, 4), r1n = ri(R, 20, 60), r2n = ri(R, 5, r1n - 5);
    return [[`What time is half past ${h}?`, `${h}:30`], [`What time is a quarter past ${h}?`, `${h}:15`], [`How many cents are ${q} quarters and ${d} dimes?`, 25 * q + 10 * d],
      [`A ribbon is ${r1n} cm long. Another is ${r2n} cm long. How much longer is the first ribbon?`, `${r1n - r2n} cm`], [`How many sides does a ${sh[0]} have?`, sh[1]]];
  },
  NS(R, b) {
    const d = b <= 2 ? [10, 99] : b === 3 ? [100, 999] : [1000, 9999], out = [];
    const a1 = ri(R, d[0], Math.floor(d[1] * 0.6)), a2 = ri(R, d[0], d[1] - a1); out.push([`${nf(a1)} + ${nf(a2)} = ___`, nf(a1 + a2)]);
    const s1 = ri(R, Math.floor(d[1] * 0.5), d[1]), s2 = ri(R, d[0], s1 - 1); out.push([`${nf(s1)} − ${nf(s2)} = ___`, nf(s1 - s2)]);
    const r10 = ri(R, 101, 989); out.push([`Round ${r10} to the nearest ten.`, Math.round(r10 / 10) * 10]);
    const r100 = ri(R, 101, 989); out.push([`Round ${r100} to the nearest hundred.`, Math.round(r100 / 100) * 100]);
    const w1 = ri(R, d[0], Math.floor(d[1] * 0.5)), w2 = ri(R, d[0], Math.floor(d[1] * 0.4));
    out.push([`A school library has ${nf(w1)} fiction books and ${nf(w2)} nonfiction books. How many books in all?`, nf(w1 + w2)]);
    return out;
  },
  MD(R, b) {
    if (b <= 2) { const g = ri(R, 2, 5), e = ri(R, 2, 5), rw = ri(R, 2, 4), cl = ri(R, 2, 6), t = ri(R, 2, 5), k = ri(R, 2, 4);
      return [[`${g} groups of ${e}. How many in all?`, g * e], [`An array has ${rw} rows of ${cl}. How many in all?`, rw * cl], [`Skip-count by ${t}s: ${t}, ${2 * t}, ${3 * t}, ___`, 4 * t],
        [`${k * 3} apples shared equally in 3 bags. How many in each bag?`, k], [`${e} + ${e} + ${e} = ___ × ${e}`, 3]]; }
    const out = [];
    for (let i = 0; i < 2; i++) { const x = ri(R, 3, 10), y = ri(R, 3, 10); out.push([`${x} × ${y} = ___`, x * y]); }
    const x = ri(R, 3, 10), y = ri(R, 3, 10); out.push([`${x * y} ÷ ${x} = ___`, y]);
    const m = ri(R, 3, 9), n = ri(R, 3, 9); out.push([`${m} × ___ = ${m * n}`, n]);
    const f = ri(R, 3, 8), e = ri(R, 3, 9); out.push([`${f * e} cookies are shared equally by ${f} friends. How many cookies does each friend get?`, e]);
    return out;
  },
  FR(R, b) {
    if (b <= 2) return [["A pizza is cut into 4 equal parts. What is one part called?", "one-fourth (1/4)"], ["How many halves make one whole?", 2],
      ["Which is more of the same sandwich: one-half or one-fourth?", "one-half"], ["A shape is cut into 3 equal parts. What is each part called?", "one-third (1/3)"],
      ["Are these equal parts: a cake cut into 2 pieces of different sizes?", "no"]];
    const ds = [2, 3, 4, 6, 8], a = ds[ri(R, 0, 4)]; let c = ds[ri(R, 0, 4)]; if (c === a) c = a === 8 ? 4 : 8;
    const den = [3, 4, 6, 8][ri(R, 0, 3)], k = ri(R, 1, den - 1), x = ri(R, 1, den - 1); let y = ri(R, 1, den - 1); if (y === x) y = x === 1 ? 2 : x - 1;
    return [[`Which is greater: 1/${a} or 1/${c}?`, `1/${Math.min(a, c)}`], [`How many 1/${den}s make one whole?`, den],
      [`A pizza is cut into ${den} equal slices. You eat ${k}. What fraction did you eat?`, `${k}/${den}`],
      [`Which is greater: ${x}/${den} or ${y}/${den}?`, `${Math.max(x, y)}/${den}`], [`On a number line from 0 to 1, is ${k}/${den} closer to 0 or to 1?`, k / den < 0.5 ? "0" : k / den > 0.5 ? "1" : "halfway"]];
  },
  MGD(R, b) {
    const l = ri(R, 3, 9), w = ri(R, 2, 8), pl = ri(R, 3, 12), pw = ri(R, 2, 9), h = [8, 9, 10, 11, 1, 2][ri(R, 0, 5)], m0 = [0, 15, 30][ri(R, 0, 2)], dur = [10, 15, 20, 25][ri(R, 0, 3)];
    const end = m0 + dur, endH = h + Math.floor(end / 60), endM = end % 60;
    return [[`A rectangle is ${l} units long and ${w} units wide. What is its area?`, `${l * w} square units`], [`A rectangle is ${pl} cm long and ${pw} cm wide. What is its perimeter?`, `${2 * (pl + pw)} cm`],
      [`A science lab starts at ${h}:${String(m0).padStart(2, "0")} and lasts ${dur} minutes. When does it end?`, `${endH > 12 ? endH - 12 : endH}:${String(endM).padStart(2, "0")}`],
      ["Which unit fits the water in a bathtub: liters or milliliters?", "liters"], ["Which tool measures the temperature outside?", "a thermometer"]];
  },
  WN(R, b) {
    const out = [];
    if (b <= 3) { const x = ri(R, 12, 49), y = ri(R, 2, 6); out.push([`${x} × ${y} = ___`, x * y]); const p = ri(R, 21, 89), q = ri(R, 3, 9); out.push([`${p} × ${q} = ___`, p * q]);
      const d = ri(R, 2, 5), qq = ri(R, 11, 24); out.push([`${d * qq} ÷ ${d} = ___`, qq]); const n = ri(R, 1100, 9800); out.push([`Round ${nf(n)} to the nearest thousand.`, nf(Math.round(n / 1000) * 1000)]);
      const bx = ri(R, 3, 8), per = ri(R, 12, 24); out.push([`There are ${bx} boxes with ${per} markers in each. How many markers?`, bx * per]); return out; }
    if (b === 4) { const x = ri(R, 123, 789), y = ri(R, 3, 9); out.push([`${x} × ${y} = ___`, nf(x * y)]); const p = ri(R, 21, 89), q = ri(R, 21, 89); out.push([`${p} × ${q} = ___`, nf(p * q)]);
      const d = ri(R, 3, 9), qq = ri(R, 41, 199), r = ri(R, 1, d - 1); out.push([`${d * qq + r} ÷ ${d} = ___ (with a remainder)`, `${qq} R ${r}`]);
      const n = ri(R, 11000, 98000); out.push([`Round ${nf(n)} to the nearest thousand.`, nf(Math.round(n / 1000) * 1000)]);
      const rows = ri(R, 12, 25), seats = ri(R, 14, 28); out.push([`A theater has ${rows} rows of ${seats} seats. How many seats?`, rows * seats]); return out; }
    const x = ri(R, 123, 789), y = ri(R, 12, 48); out.push([`${x} × ${y} = ___`, nf(x * y)]);
    const d = ri(R, 12, 38), qq = ri(R, 21, 99); out.push([`${nf(d * qq)} ÷ ${d} = ___`, qq]);
    const p = ri(R, 1021, 4879), q = ri(R, 3, 9); out.push([`${nf(p)} × ${q} = ___`, nf(p * q)]);
    const n = ri(R, 110000, 980000); out.push([`Round ${nf(n)} to the nearest ten thousand.`, nf(Math.round(n / 10000) * 10000)]);
    const tk = ri(R, 12, 36), price = ri(R, 14, 45); out.push([`A class buys ${tk} tickets at $${price} each. What is the total cost?`, `$${nf(tk * price)}`]);
    return out;
  },
  FD(R, b) {
    if (b <= 3) { const a = [2, 3, 4, 5, 6][ri(R, 0, 4)], c = [2, 3, 4, 5, 6].filter(z => z !== a)[ri(R, 0, 3)], t = ri(R, 1, 9);
      return [[`Which is greater: 1/${a} or 1/${c}?`, `1/${Math.min(a, c)}`], ["Fill in the blank: 1/2 = ___/4", 2], [`Write ${t}/10 as a decimal.`, `0.${t}`],
        ["Fill in the blank: 1/3 = ___/6", 2], [`Which is greater: ${t}/10 or 5/10?`, t > 5 ? `${t}/10` : t < 5 ? "5/10" : "they are equal"]]; }
    if (b === 4) { const d = [3, 4, 5][ri(R, 0, 2)], k = ri(R, 2, 3), n = ri(R, 1, d - 1), x = ri(R, 1, 4), y = ri(R, 1, 4), dd = 8, h = ri(R, 11, 89), t2 = ri(R, 1, 9);
      return [[`Fill in the blank: ${n}/${d} = ___/${d * k}`, n * k], ["Which is greater: 2/3 or 3/4?", "3/4"], [`${x}/${dd} + ${y}/${dd} = ___`, frac(x + y, dd)],
        [`Which is greater: 0.${h} or 0.${t2}?`, h / 100 > t2 / 10 ? `0.${h}` : h / 100 < t2 / 10 ? `0.${t2}` : "they are equal"], [`Write 0.${t2} as hundredths: ___/100`, t2 * 10]]; }
    const pairs = [[2, 4], [3, 6], [2, 6], [4, 8], [3, 12]], pr = pairs[ri(R, 0, 4)], a = ri(R, 1, pr[0] - 1), c = ri(R, 1, pr[1] - 1);
    const w = ri(R, 2, 5), fn = ri(R, 1, 4), fd = 5, dA = ri(R, 11, 49) / 10, dB = ri(R, 101, 399) / 100, dm = ri(R, 101, 999) / 100;
    return [[`${a}/${pr[0]} + ${c}/${pr[1]} = ___`, frac(a * (pr[1] / pr[0]) + c, pr[1])], [`${w} × ${fn}/${fd} = ___`, frac(w * fn, fd)],
      [`${dA.toFixed(1)} + ${dB.toFixed(2)} = ___`, (Math.round((dA + dB) * 100) / 100).toFixed(2)], [`${dm.toFixed(2)} × 10 = ___`, (Math.round(dm * 1000) / 100).toFixed(1)],
      [`A recipe uses 3/4 cup of milk. You make it twice. How much milk?`, frac(6, 4) + " cups"]];
  },
  AR(R, b) {
    const a = ri(R, 2, 9), c = ri(R, 2, 6), d = ri(R, 2, 5), s = ri(R, 1, 9), k = ri(R, 3, 8), n = ri(R, 3, 9), m = ri(R, 12, 40), x = ri(R, 2, 9);
    if (b <= 4) return [[`${n} + ___ = ${n + m}`, m], [`Start at ${s} and add ${k} each time: ${s}, ${s + k}, ${s + 2 * k}, ___`, s + 3 * k], [`${a} × (${c} + ${d}) = ___`, a * (c + d)],
      [`${a} + ${c} × ${d} = ___`, a + c * d], [`Each box holds ${k} crayons. How many crayons in ${n} boxes? Write an equation and solve.`, `${n} × ${k} = ${n * k}`]];
    return [[`${a} + ${c} × ${d} = ___`, a + c * d], [`(${a} + ${c}) × ${d} = ___`, (a + c) * d], ["Write an expression for “5 more than 3 times a number n”.", "3 × n + 5"],
      [`If n = ${x}, what is 3 × n + 5?`, 3 * x + 5], [`Rule: multiply by 2, then add 1. Start with ${s}: ${s}, ${2 * s + 1}, ___`, 2 * (2 * s + 1) + 1]];
  },
  MG5(R, b) {
    const l = ri(R, 4, 12), w = ri(R, 3, 9), h = ri(R, 2, 6), px = ri(R, 1, 9), py = ri(R, 1, 9), ft = ri(R, 2, 6), mt = ri(R, 2, 9);
    if (b <= 4) return [[`A rectangle is ${l} m long and ${w} m wide. What is its area?`, `${l * w} square meters`], [`What is the perimeter of that same rectangle (${l} m by ${w} m)?`, `${2 * (l + w)} m`],
      ["How many degrees is a right angle?", 90], [`How many inches are in ${ft} feet?`, ft * 12], ["How many degrees is a straight angle?", 180]];
    return [[`A box is ${l} cm long, ${w} cm wide and ${h} cm tall. What is its volume?`, `${l * w * h} cubic cm`], [`The point (${px}, ${py}): how far right and how far up from (0, 0)?`, `${px} right, ${py} up`],
      [`How many centimeters are in ${mt} meters?`, mt * 100], [`How many inches are in ${ft} feet?`, ft * 12], [`A rectangle is ${l} m by ${w} m. What is its area?`, `${l * w} square meters`]];
  }
};

// One quick check: subject, skill tier id, working level (grade-level number), form "A" (pre) or "B" (post).
function quickCheck(subject, skill, level, form) {
  const b = bandOf(level), F = form === "B" ? "B" : "A";
  const name = (subject === "reading" ? READING_LADDER.find(r => r.id === skill) : MATH_RUNGS[skill]) || { name: skill };
  const base = { subject, skill, form: F, band: b, kind: F === "A" ? "pre" : "post", title: `${name.name} quick check · Form ${F} (${F === "A" ? "pre-check" : "post-check"})`, level: BAND_WORD(b) };
  let items = [], admin = "student", directions = "", note = "";
  if (subject === "reading") {
    if (skill === "PA") { const set = b <= 1 ? "basic" : "advanced"; items = PA_FORMS[set][F]; admin = "teacher";
      directions = "Teacher-led, one student at a time. Say each item aloud; the student answers aloud. Mark each item right or wrong."; }
    else if (skill === "PH") { const k = Math.min(b, 3), w = PH_WORDS[k]; items = w[F].split(" ").map(x => [x, "read correctly"]); admin = "teacher";
      directions = `The student reads each word aloud. Mark a word right only if it is read correctly the first time or self-corrected within 3 seconds. Words: ${w.note}.`; }
    else if (skill === "HFW") { const k = Math.min(b, 3), w = HFW_WORDS[k]; items = w[F].split(" ").map(x => [x, "read within 3 seconds"]); admin = "teacher";
      directions = `The student reads each word aloud. Mark it right if read correctly within 3 seconds. List: ${w.list}.`; }
    else if (skill === "VOC") { const k = b <= 1 ? 0 : b <= 3 ? 2 : 4; items = VOC_FORMS[k][F]; admin = k === 0 ? "teacher" : "student";
      directions = k === 0 ? "Teacher-led and oral. Accept any reasonable answer." : "The student writes or says each answer. Accept answers with the same meaning."; }
    else { const set = COMP_STEMS[skill] || COMP_STEMS.INF, lvl = skill === "AG" || b >= 3 ? "high" : "low"; items = (set[lvl] || set.high)[F].map(q => [q, "use the rubric: right if supported by the text"]);
      directions = `Use one short ${skill === "LIT" ? "story" : skill === "INF" ? "informational passage" : "pair of passages"} at the student's level (${BAND_WORD(b)}), a different one for Form A and Form B. The student answers each question; mark it right when the answer is supported by the text.`;
      note = "Pick the passage from this week's matched content or the classroom library."; admin = b <= 1 ? "teacher" : "student"; }
  } else {
    const gen = MATH_GEN[skill];
    if (gen) { const R = seeded(`${skill}|${b}|${F}`); items = gen(R, b).map(([q, a]) => [q, String(a)]); }
    directions = b <= 1 ? "Read each item aloud if needed. The student answers on paper or aloud." : "The student solves each problem on paper. No calculator.";
  }
  const total = items.length;
  return { ...base, admin, directions, note, items: items.map(([q, a], i) => ({ n: i + 1, q, a })), total, pass: Math.ceil(total * CHECK_PASS) };
}
if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { quickCheck, bandOf, MATH_GEN });
