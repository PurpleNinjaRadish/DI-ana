// Makes DI-ana's demo: Odin's invented school, with this week's sheets made for every student who has a focus skill,
// the same way Odin's "Make sheets" does. The result has the same shape as Odin's /api/scanner, so the demo and the
// school's server go through the same code in the page. Every student here is invented.
//   node tools/demo_data.js > demo.json      (web/build.py runs this)
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const ENGINE = ["engine.js", "sheets_math.js", "sheets_reading.js", "sheets_passages.js", "sheets.js"];
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(ENGINE.map(f => fs.readFileSync(path.join(ROOT, "odin", f), "utf8")).join("\n;\n") +
  "\n;this.__api = { shPlanFor, shRecordsFor, shBuildSheet, mondayOf, ODIN_VERSION };", ctx);
const A = ctx.__api;
const school = JSON.parse(fs.readFileSync(path.join(ROOT, "odin/demo/school.json"), "utf8"));
const today = school.today || "2026-10-09", week = A.mondayOf(today);
let id = 100001;
const classes = school.classes.map(c => {
  const sheets = [];
  for (const subject of ["math", "reading"]) {
    for (const s of c.students) {
      const plan = A.shPlanFor(c, subject, s.code, week);
      if (!plan) continue;
      for (const r of A.shRecordsFor(c, subject, s.code, week, plan)) {
        r.id = 0;
        const sp = A.shBuildSheet(r);
        sheets.push({ id: id++, code: r.code, subject: r.subject, skill: r.skill, week: r.week, kind: r.kind, part: r.part || 0, band: r.band, level: r.level,
          concepts: r.concepts, spiral: r.spiral, gen: r.gen, total: sp.total, key: sp.key, title: sp.title, status: "ready", right: null, source: null, taken: null });
      }
    }
  }
  return { id: c.id, grade: c.grade, teacher: c.teacher, room: c.room, students: c.students.map(s => ({ code: s.code, name: s.name })), sheets };
});
process.stdout.write(JSON.stringify({ app: "Odin", version: A.ODIN_VERSION, school: school.school, today, demo: true, classes }));
