// ===== Odin 0.4: multiple-choice math items for individual practice sheets and checks =====
// Every item is generated from a seed, so a sheet can be rebuilt exactly from its record.
// Wrong answers come from common errors (no regrouping, swapped digits, wrong operation, place-value slips),
// so a missed item says something about what the student did. Each item carries a hint and a worked "why".
const shPick = (R, a) => a[Math.floor(R() * a.length)];
function shShuffle(R, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const shNear = (a, step = 1) => [a + step, a - step, a + 2 * step, a - 2 * step, a + 3 * step, a + 10 * step, a - 10 * step];
const shPad = m => String(m).padStart(2, "0");
// Build a multiple-choice item. wrong: distractor candidates in order of preference; duplicates, blanks and negatives are skipped.
function shMC(R, stem, ans, wrong, extra = {}) {
  const n = extra.n || 4, A = String(ans), seen = new Set([A]), ds = [];
  for (const w of wrong) {
    if (w == null || (typeof w === "number" && !isFinite(w))) continue;
    const s = String(w);
    if (!s || seen.has(s) || /^-/.test(s) || s === "NaN") continue;
    seen.add(s); ds.push(s);
    if (ds.length >= n - 1) break;
  }
  if (ds.length < n - 1) {   // fall back to nearby numbers in the same form: "15 square units" -> "16 square units"
    const m = A.match(/^(.*?)(\d+)(.*)$/);
    if (m) for (const dl of [1, -1, 2, -2, 3, 10, -3, 5]) {
      const v = Number(m[2]) + dl, t = m[1] + v + m[3];
      if (v < 0 || seen.has(t)) continue;
      seen.add(t); ds.push(t);
      if (ds.length >= n - 1) break;
    }
  }
  if (ds.length < n - 1) throw new Error("not enough distractors for: " + stem);
  const choices = shShuffle(R, [A, ...ds]);
  const it = { stem, choices, key: choices.indexOf(A) };
  for (const k of ["hint", "why", "fig", "read", "tag", "unit", "say"]) if (extra[k] != null) it[k] = extra[k];
  return it;
}
const SH_NAMES = ["Mia", "Leo", "Ana", "Sam", "Kai", "Zoe", "Eli", "Ivy", "Noah", "Lily", "Omar", "Rosa", "Ben", "Nia", "Luis", "Maya"];
const SH_THINGS = ["stickers", "shells", "apples", "marbles", "books", "crayons", "cards", "seeds", "rocks", "beads"];
const nc = b => (b <= 1 ? 3 : 4);   // kindergarten and grade 1 levels get three choices

// Math topics. strand: the skill family; b: the grade-level bands it covers (0 = K); concept: what a benchmark can point to.
const SH_MATH = [
  // ---------------- counting and place value ----------------
  { id: "count", strand: "place", b: [0, 0], concept: "count", title: "Count objects",
    learn: ["Touch each object as you count it.", "Say one number for each object.", "The last number you say tells how many."],
    gen(R, b) { const n = ri(R, 4, 15);
      return shMC(R, "How many dots?", n, shNear(n), { n: nc(b), fig: { t: "dots", n }, read: true, hint: "Touch each dot as you count.", why: `Count each dot one time: 1, 2, 3 … ${n}. There are ${n} dots.` }); } },
  { id: "next", strand: "place", b: [0, 1], concept: "count", title: "What comes next",
    learn: ["Read the numbers in order.", "Find the pattern: one more each time, or ten more.", "Use the pattern to find the next number."],
    gen(R, b) {
      if (b <= 0 || R() < 0.5) { const k = b <= 0 ? ri(R, 2, 16) : ri(R, 20, 116);
        return shMC(R, `What number comes next? ${k}, ${k + 1}, ${k + 2}, ___`, k + 3, [k + 2, k + 4, k + 1, k + 13], { n: nc(b), read: b <= 0, hint: "Each number is one more.", why: `Count on by ones: ${k}, ${k + 1}, ${k + 2}, ${k + 3}.` }); }
      const s = ri(R, 1, 8) * 10;
      return shMC(R, `Count by tens: ${s}, ${s + 10}, ${s + 20}, ___`, s + 30, [s + 21, s + 40, s + 3, s + 31], { n: nc(b), hint: "Each number is ten more.", why: `Add one ten each time: ${s + 20} + 10 = ${s + 30}.` }); } },
  { id: "compare", strand: "place", b: [0, 5], concept: "compare", title: "Compare numbers",
    learn: ["Line the numbers up by place value.", "Compare the digits from the left: the biggest place first.", "The first place where the digits differ tells which number is greater."],
    gen(R, b) {
      const most = R() < 0.7, word = most ? "greatest" : "least";
      if (b === 5) {   // decimals: a longer decimal is not always greater
        const w = ri(R, 0, 4), d1 = ri(R, 2, 8);
        const vals = [`${w}.${d1}`, `${w}.${d1 - 1}${ri(R, 5, 9)}`, `${w}.0${d1}${ri(R, 1, 9)}`, `${w}.${d1 - 1}${ri(R, 0, 4)}${ri(R, 1, 9)}`];
        const nums = vals.map(Number); const tgt = most ? Math.max(...nums) : Math.min(...nums);
        const ans = vals[nums.indexOf(tgt)];
        return shMC(R, `Which number is the ${word}?`, ans, vals.filter(v => v !== ans), { hint: "Compare tenths first, then hundredths, then thousandths.", why: `Line up the decimal points. Compare tenths, then hundredths: ${ans} is the ${word}.` });
      }
      const digits = [1, 2, 3, 4, 6][b] || 3;
      const base = []; while (base.length < Math.max(2, digits)) { const d = ri(R, 1, 9); if (!base.includes(d)) base.push(d); }
      const mk = arr => Number(arr.join(""));
      let vals;
      if (b === 0) { const s = new Set(); while (s.size < 3) s.add(ri(R, 2, 20)); vals = [...s]; }
      else { const perms = new Set([mk(base)]); let guard = 0; while (perms.size < 4 && guard++ < 50) perms.add(mk(shShuffle(R, base))); if (perms.size < 4) perms.add(mk(base) + 1); vals = [...perms].slice(0, 4); }
      const tgt = most ? Math.max(...vals) : Math.min(...vals);
      const fmt = v => nf(v);
      return shMC(R, `Which number is the ${word}?`, fmt(tgt), vals.filter(v => v !== tgt).map(fmt), { n: b <= 1 ? 3 : 4, read: b <= 0, hint: "Look at the digit in the biggest place first.", why: `Compare from the left. ${fmt(tgt)} has the ${most ? "largest" : "smallest"} digit in the first place that differs, so it is the ${word}.` }); } },
  { id: "tensones", strand: "place", b: [1, 1], concept: "placevalue", title: "Tens and ones",
    learn: ["A ten is a group of 10 ones.", "Count the tens: 10, 20, 30 …", "Add the ones to the tens."],
    gen(R, b) { const t = ri(R, 2, 9); let o = ri(R, 1, 9); if (o === t) o = t === 9 ? 8 : t + 1;
      return shMC(R, `What number is ${t} tens and ${o} ones?`, 10 * t + o, [10 * o + t, t + o, 100 * t + o, 10 * t + o + 10], { n: 3, fig: { t: "base10", tens: t, ones: o }, hint: "The tens digit goes first.", why: `${t} tens is ${10 * t}. ${10 * t} + ${o} = ${10 * t + o}.` }); } },
  { id: "placevalue", strand: "place", b: [2, 4], concept: "placevalue", title: "Value of a digit",
    learn: ["Name the place of the digit: ones, tens, hundreds, thousands …", "The value is the digit times its place.", "Example: in 3,642 the 6 is in the hundreds place, so it is worth 600."],
    gen(R, b) { const len = b === 2 ? 3 : b === 3 ? 4 : 6, ds = shShuffle(R, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, len), n = Number(ds.join(""));
      const pos = ri(R, 1, len - 1), d = ds[len - 1 - pos], val = d * 10 ** pos, names = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"];
      return shMC(R, `What is the value of the ${d} in ${nf(n)}?`, nf(val), [nf(d * 10 ** (pos - 1)), nf(d * 10 ** (pos + 1)), nf(d), nf(d * 10 ** (pos + 2))], { hint: "Count the places from the right: ones, tens, hundreds …", why: `The ${d} is in the ${names[pos]} place, so its value is ${d} × ${nf(10 ** pos)} = ${nf(val)}.` }); } },
  { id: "expanded", strand: "place", b: [2, 3], concept: "placevalue", title: "Expanded form",
    learn: ["Split the number by place value.", "Write each digit with its value: 500, 60, 3.", "Join the values with plus signs."],
    gen(R, b) { const len = b === 2 ? 3 : 4, ds = Array.from({ length: len }, () => ri(R, 1, 9)), n = Number(ds.join(""));
      const parts = ds.map((d, i) => d * 10 ** (len - 1 - i)), ex = parts.map(nf).join(" + ");
      return shMC(R, `Which shows ${nf(n)} in expanded form?`, ex, [ds.join(" + "), parts.map((p, i) => (i === 0 ? nf(p / 10) : nf(p))).join(" + "), parts.map((p, i) => (i === len - 2 ? nf(p / 10) : nf(p))).join(" + "), parts.map((p, i) => (i === len - 1 ? nf(p * 10) : nf(p))).join(" + ")], { hint: "Each part is a digit times its place.", why: `${nf(n)} = ${ex}.` }); } },
  { id: "round", strand: "place", b: [3, 5], concept: "round", title: "Round numbers",
    learn: ["Find the place you are rounding to.", "Look at the digit just to its right.", "5 or more: round up. 4 or less: keep the digit and make the rest zeros."],
    gen(R, b) {
      if (b === 5) { const x = ri(R, 1001, 9998) / 1000, toTenth = R() < 0.5, p = toTenth ? 1 : 2, f = 10 ** p;
        const ans = (Math.round(x * f + 1e-9) / f).toFixed(p), dn = (Math.floor(x * f) / f).toFixed(p), up = (Math.ceil(x * f) / f).toFixed(p);
        return shMC(R, `Round ${x.toFixed(3)} to the nearest ${toTenth ? "tenth" : "hundredth"}.`, ans, [ans === dn ? up : dn, (Math.round(x * 10 ** (3 - p)) / 10 ** (3 - p)).toFixed(3 - p), Math.round(x).toFixed(0), (Number(ans) + 1 / f).toFixed(p)], { hint: `Look at the digit after the ${toTenth ? "tenths" : "hundredths"} place.`, why: `The next digit is ${x.toFixed(3)[2 + p]}: ${Number(x.toFixed(3)[2 + p]) >= 5 ? "5 or more, so round up" : "4 or less, so keep the digit"}. The answer is ${ans}.` }); }
      const [lo, hi, places] = b === 3 ? [101, 989, [10, 100]] : [11000, 989000, [1000, 10000]];
      let n = ri(R, lo, hi); const p = shPick(R, places); if ((n / p) % 1 === 0) n += Math.round(p * 0.3);
      const ans = Math.round(n / p) * p, other = ans > n ? Math.floor(n / p) * p : Math.ceil(n / p) * p, other2 = Math.round(n / (p * 10)) * p * 10;
      const nextDigit = Math.floor((n % p) / (p / 10));
      return shMC(R, `Round ${nf(n)} to the nearest ${{ 10: "ten", 100: "hundred", 1000: "thousand", 10000: "ten thousand" }[p]}.`, nf(ans), [nf(other), other2 > 0 ? nf(other2) : null, nf(Math.round(n / (p / 10)) * (p / 10)), nf(n - (n % p)), nf(n), nf(ans + p), ans - p > 0 ? nf(ans - p) : null, nf(ans + 2 * p)], { hint: `Look at the digit to the right of the ${({ 10: "tens", 100: "hundreds", 1000: "thousands", 10000: "ten thousands" }[p])} place.`, why: `The digit to the right is ${nextDigit}: ${nextDigit >= 5 ? "5 or more, so round up" : "4 or less, so round down"}. ${nf(n)} rounds to ${nf(ans)}.` }); } },
  { id: "decread", strand: "decimals", b: [4, 5], concept: "decimals", title: "Read and write decimals",
    learn: ["The first place after the decimal point is tenths.", "The next place is hundredths, then thousandths.", "Write a zero in any empty place."],
    gen(R, b) {
      if (b === 4) { const t = ri(R, 1, 9); let h = ri(R, 1, 9); if (h === t) h = t === 9 ? 1 : t + 1;
        return shMC(R, `Which decimal shows ${t} tenths and ${h} hundredths?`, `0.${t}${h}`, [`0.${h}${t}`, `${t}.${h}`, `0.${t}0${h}`, `${t}${h}.0`], { hint: "Tenths come right after the decimal point.", why: `${t} tenths and ${h} hundredths is 0.${t}${h}.` }); }
      const w = ri(R, 1, 9), th = ri(R, 11, 99);
      return shMC(R, `Which number is ${w} and ${th} thousandths?`, `${w}.0${th}`, [`${w}.${th}`, `${w}.00${th}`, `${w}${th}`, `${w}.${th}0`], { hint: "Thousandths need three places after the decimal point.", why: `${th} thousandths fills three places: ${w}.0${th}.` }); } },
  // ---------------- adding and subtracting ----------------
  { id: "facts", strand: "addsub", b: [0, 1], concept: "facts", title: "Addition and subtraction facts",
    learn: ["Add: put the groups together and count all.", "Subtract: start with the whole and take some away.", "Check: the parts should make the whole."],
    gen(R, b) { const lim = b <= 0 ? 10 : 20, add = R() < 0.55;
      if (add) { const x = ri(R, 1, lim - 2), y = ri(R, 1, lim - x), s = x + y;
        return shMC(R, `${x} + ${y} = ___`, s, [s - 1, s + 1, Math.abs(x - y), s + 2], { n: nc(b), read: b <= 0, fig: b <= 0 && s <= 10 ? { t: "dots2", a: x, b: y } : null, hint: "Start with the bigger number and count on.", why: `Start at ${Math.max(x, y)} and count on ${Math.min(x, y)}: ${s}.` }); }
      const x = ri(R, 3, lim), y = ri(R, 1, x - 1), d = x - y;
      return shMC(R, `${x} − ${y} = ___`, d, [x + y, d + 1, d - 1, d + 2], { n: nc(b), read: b <= 0, hint: "Count back, or think: what adds to make the whole?", why: `${y} + ${d} = ${x}, so ${x} − ${y} = ${d}.` }); } },
  { id: "story", strand: "addsub", b: [0, 2], concept: "wordproblems", title: "Adding and subtracting stories",
    learn: ["Read the story and find what you need to know.", "Ask: are things joining, being taken away, or being compared?", "Write a number sentence, solve it, and check the answer makes sense."],
    gen(R, b) { const who = shPick(R, SH_NAMES), thing = shPick(R, SH_THINGS), lim = [10, 20, 99][Math.min(b, 2)], kind = ri(R, 0, 2);
      const a = ri(R, Math.max(2, Math.floor(lim / 3)), lim - 2), c = ri(R, 1, Math.min(lim - a, a - 1) || 1);
      if (kind === 0) return shMC(R, `${who} has ${a} ${thing}. ${who} gets ${c} more. How many ${thing} does ${who} have now?`, a + c, [a - c, a + c + 1, a + c - 1, a + c + 10], { n: nc(b), read: b <= 1, hint: "Gets more: add.", why: `${a} + ${c} = ${a + c}.` });
      if (kind === 1) return shMC(R, `${who} has ${a} ${thing}. ${who} gives away ${c}. How many ${thing} are left?`, a - c, [a + c, a - c + 1, a - c - 1, a - c + 10], { n: nc(b), read: b <= 1, hint: "Gives away: subtract.", why: `${a} − ${c} = ${a - c}.` });
      const other = shPick(R, SH_NAMES.filter(x => x !== who));
      return shMC(R, `${who} has ${a} ${thing}. ${other} has ${c}. How many more ${thing} does ${who} have?`, a - c, [a + c, a, a - c + 1, a - c - 1], { n: nc(b), read: b <= 1, hint: "How many more: find the difference.", why: `${a} − ${c} = ${a - c}, so ${who} has ${a - c} more.` }); } },
  { id: "add2", strand: "addsub", b: [2, 2], concept: "addsub", title: "Add two-digit numbers",
    learn: ["Line up the tens and the ones.", "Add the ones. If you get 10 or more, make a new ten.", "Add the tens, including the new ten."],
    gen(R, b) { const o1 = ri(R, 3, 9), o2 = ri(R, 10 - o1, 9), x = 10 * ri(R, 1, 6) + o1, y = 10 * ri(R, 1, 3) + o2, s = x + y;
      return shMC(R, `${x} + ${y} = ___`, s, [s - 10, s + 10, s + 1, Math.abs(x - y)], { hint: "Add the ones first. Did you make a new ten?", why: `Ones: ${o1} + ${o2} = ${o1 + o2}, write ${(o1 + o2) % 10} and carry 1 ten. Tens: ${Math.floor(x / 10)} + ${Math.floor(y / 10)} + 1 = ${Math.floor(s / 10)}. Answer: ${s}.` }); } },
  { id: "sub2", strand: "addsub", b: [2, 2], concept: "addsub", title: "Subtract two-digit numbers",
    learn: ["Line up the tens and the ones.", "If the top ones digit is smaller, trade 1 ten for 10 ones.", "Subtract the ones, then the tens."],
    gen(R, b) { const o1 = ri(R, 0, 6), o2 = ri(R, o1 + 1, 9), t1 = ri(R, 4, 9), t2 = ri(R, 1, t1 - 1), x = 10 * t1 + o1, y = 10 * t2 + o2, d = x - y;
      const sfl = 10 * (t1 - t2) + (o2 - o1);   // subtracted the smaller digit from the larger
      return shMC(R, `${x} − ${y} = ___`, d, [sfl, d + 10, d - 1, x + y], { hint: `Can you take ${o2} from ${o1}? If not, trade a ten.`, why: `Trade 1 ten: ${o1 + 10} − ${o2} = ${o1 + 10 - o2} ones. Tens: ${t1 - 1} − ${t2} = ${t1 - 1 - t2}. Answer: ${d}.` }); } },
  { id: "add3", strand: "addsub", b: [3, 3], concept: "addsub", title: "Add multi-digit numbers",
    learn: ["Line up the places: ones under ones, tens under tens.", "Add from the right. Carry when a place makes 10 or more.", "Estimate first to check your answer."],
    gen(R, b) { const big = R() < 0.4, x = big ? ri(R, 1200, 5800) : ri(R, 125, 689), y = big ? ri(R, 1100, 3900) : ri(R, 118, 299), s = x + y;
      const noCarry = Number(String(x).padStart(4, "0").split("").map((d, i) => (Number(d) + Number(String(y).padStart(4, "0")[i])) % 10).join(""));
      return shMC(R, `${nf(x)} + ${nf(y)} = ___`, nf(s), [nf(noCarry === s ? s + 100 : noCarry), nf(s - 10), nf(s + 100), nf(s - 100)], { hint: "Line up the places and carry when you make 10.", why: `Add each place from the right and carry the extra tens: ${nf(x)} + ${nf(y)} = ${nf(s)}.` }); } },
  { id: "sub3", strand: "addsub", b: [3, 3], concept: "addsub", title: "Subtract multi-digit numbers",
    learn: ["Line up the places.", "Start with the ones. Trade from the next place when the top digit is smaller.", "Check by adding your answer to the number you subtracted."],
    gen(R, b) { const x = ri(R, 402, 951), y = ri(R, 118, x - 120), d = x - y;
      const sx = String(x).padStart(3, "0"), sy = String(y).padStart(3, "0"), sfl = Number(sx.split("").map((c, i) => Math.abs(Number(c) - Number(sy[i]))).join(""));
      return shMC(R, `${nf(x)} − ${nf(y)} = ___`, nf(d), [nf(sfl === d ? d + 10 : sfl), nf(d + 10), nf(d - 100), nf(x + y)], { hint: "When the top digit is smaller, trade from the next place.", why: `Check: ${nf(d)} + ${nf(y)} = ${nf(x)}, so ${nf(x)} − ${nf(y)} = ${nf(d)}.` }); } },
  { id: "missing", strand: "addsub", b: [1, 3], concept: "addsub", title: "Find the missing number",
    learn: ["Read the number sentence.", "Think: what part is missing?", "Use the opposite operation: subtract to find a missing addend."],
    gen(R, b) { const [lo, hi] = b === 1 ? [3, 9] : b === 2 ? [15, 48] : [120, 480], x = ri(R, lo, hi), y = ri(R, lo, hi), s = x + y;
      return shMC(R, `${nf(x)} + ___ = ${nf(s)}`, nf(y), [nf(s + x), nf(y + 1), nf(y - 1), nf(y + 10)], { n: nc(b), hint: "Subtract the part you know from the total.", why: `${nf(s)} − ${nf(x)} = ${nf(y)}.` }); } },
  // ---------------- multiplying and dividing ----------------
  { id: "groups", strand: "multdiv", b: [1, 2], concept: "multiply", title: "Equal groups",
    learn: ["Equal groups have the same number in each group.", "Count the groups and how many are in each.", "Add the groups again and again, or skip-count."],
    gen(R, b) { const g = ri(R, 2, 5), e = ri(R, 2, 5);
      if (R() < 0.65) return shMC(R, `There are ${g} groups with ${e} in each group. How many in all?`, g * e, [g + e, g * e + e, g * e - 1, g * e + 1], { n: nc(b), fig: { t: "groups", g, e }, hint: `Skip-count by ${e}s, ${g} times.`, why: `${Array(g).fill(e).join(" + ")} = ${g * e}.` });
      return shMC(R, `${g * e} cookies are shared equally by ${g} friends. How many cookies does each friend get?`, e, [g * e - g, e + 1, g * e + g, g], { n: nc(b), hint: "Share them out one at a time.", why: `${g} groups of ${e} make ${g * e}, so each friend gets ${e}.` }); } },
  { id: "mfacts", strand: "multdiv", b: [3, 3], concept: "facts", title: "Multiplication facts",
    learn: ["Multiplication is equal groups: 6 × 7 means 6 groups of 7.", "Use a fact you know: 6 × 7 = 5 × 7 + 7.", "Check with the turnaround fact: 7 × 6 is the same."],
    gen(R, b) { const x = ri(R, 3, 9), y = ri(R, 4, 9), p = x * y;
      return shMC(R, `${x} × ${y} = ___`, p, [p - x, p + x, p + y, x + y, p - y], { hint: `Use a fact you know, like ${x} × ${y - 1} = ${x * (y - 1)}.`, why: `${x} × ${y - 1} = ${x * (y - 1)}, and one more ${x} is ${p}.` }); } },
  { id: "dfacts", strand: "multdiv", b: [3, 3], concept: "facts", title: "Division facts",
    learn: ["Division splits a total into equal groups.", "Think of the multiplication fact: 56 ÷ 8 asks 8 × ? = 56.", "Check by multiplying."],
    gen(R, b) { const x = ri(R, 3, 9), y = ri(R, 3, 9), p = x * y;
      return shMC(R, `${p} ÷ ${x} = ___`, y, [y + 1, y - 1, x === y ? y + 2 : x, p - x], { hint: `Think: ${x} × ? = ${p}.`, why: `${x} × ${y} = ${p}, so ${p} ÷ ${x} = ${y}.` }); } },
  { id: "mult10", strand: "multdiv", b: [3, 3], concept: "multiply", title: "Multiply by tens and hundreds",
    learn: ["Use the basic fact first: 6 × 4 = 24.", "40 is 4 tens, so 6 × 40 is 24 tens.", "24 tens is 240."],
    gen(R, b) { const x = ri(R, 2, 9), y = ri(R, 2, 9), z = shPick(R, [10, 10, 100]), p = x * y * z;
      return shMC(R, `${x} × ${nf(y * z)} = ___`, nf(p), [nf(x * y), nf(p * 10), `${x}${y * z}`, nf(p / 10 + x)], { hint: `Start with ${x} × ${y}.`, why: `${x} × ${y} = ${x * y}, and ${x * y} × ${z} = ${nf(p)}.` }); } },
  { id: "distrib", strand: "multdiv", b: [3, 3], concept: "properties", title: "Break apart to multiply",
    learn: ["Break one factor into two easier parts: 7 = 5 + 2.", "Multiply each part: 6 × 5 and 6 × 2.", "Add the two products."],
    gen(R, b) { const a = ri(R, 3, 9), f = ri(R, 6, 9), c = 5, d = f - c;
      const opts = [`${a} × ${c} + ${a} × ${d}`, `${a} × ${c} + ${d}`, `${a} + ${c} × ${d}`, `${c} × ${f} + ${d}`, `${a} × ${c} × ${d}`].filter((e, i) => i === 0 || evalSimple(e) !== a * f);
      return shMC(R, `Which is equal to ${a} × ${f}?`, opts[0], opts.slice(1), { hint: `Break ${f} into ${c} + ${d}.`, why: `${a} × ${f} = ${a} × ${c} + ${a} × ${d} = ${a * c} + ${a * d} = ${a * f}.` }); } },
  { id: "truefalse", strand: "multdiv", b: [3, 3], concept: "equations", title: "True equations",
    learn: ["The equal sign means both sides have the same value.", "Work out each side.", "If the sides match, the equation is true."],
    gen(R, b) { const x = ri(R, 3, 9), y = ri(R, 3, 9), p = x * y;
      return shMC(R, "Which equation is true?", `${x} × ${y} = ${p}`, [`${x} × ${y} = ${p + x}`, `${p} ÷ ${x} = ${y + 1}`, `${x} × ${y} = ${x + y}`, `${p} ÷ ${y} = ${x - 1}`], { hint: "Work out each side.", why: `${x} × ${y} is ${p}, so ${x} × ${y} = ${p} is true.` }); } },
  { id: "areaunits", strand: "multdiv", b: [3, 3], concept: "area", title: "Area with unit squares",
    learn: ["Area is how many unit squares cover a shape.", "Count the squares in one row, and count the rows.", "Multiply: rows × squares in each row."],
    gen(R, b) { const w = ri(R, 3, 7), h = ri(R, 2, 5);
      return shMC(R, "Each small square is 1 square unit. What is the area of the rectangle?", `${w * h} square units`, [`${2 * (w + h)} square units`, `${w + h} square units`, `${w * h + w} square units`, `${w * h - h} square units`], { fig: { t: "grid", w, h }, hint: "Rows times squares in each row.", why: `${h} rows of ${w} squares: ${h} × ${w} = ${w * h} square units.` }); } },
  { id: "multword", strand: "multdiv", b: [3, 4], concept: "wordproblems", title: "Multiplication stories",
    learn: ["Find the number of groups and the number in each group.", "Multiply to find the total.", "Check that your answer makes sense."],
    gen(R, b) { if (b === 3) { const g = ri(R, 3, 9), e = ri(R, 4, 9), thing = shPick(R, ["markers", "crayons", "stickers", "cards"]);
        return shMC(R, `There are ${g} boxes with ${e} ${thing} in each box. How many ${thing} are there in all?`, g * e, [g + e, g * e - e, g * e + e, g * e + 10], { hint: "Equal groups: multiply.", why: `${g} × ${e} = ${g * e}.` }); }
      const rows = ri(R, 12, 25), seats = ri(R, 14, 28), p = rows * seats;
      return shMC(R, `A theater has ${rows} rows with ${seats} seats in each row. How many seats are there?`, nf(p), [nf(rows + seats), nf(rows * seats - seats), nf(p + 10 * rows), nf(rows * (seats % 10) + (seats - (seats % 10)) * Math.floor(rows / 10))], { hint: "Rows times seats in each row.", why: `${rows} × ${seats} = ${nf(p)}.` }); } },
  { id: "mult2", strand: "multdiv", b: [4, 4], concept: "multiply", title: "Multiply larger numbers",
    learn: ["Break the numbers into tens and ones.", "Multiply each part (partial products).", "Add the partial products."],
    gen(R, b) { if (R() < 0.5) { const x = ri(R, 123, 789), y = ri(R, 3, 9), p = x * y;
        return shMC(R, `${x} × ${y} = ___`, nf(p), [nf(p - 100), nf(p + 10), nf(x * y + x), nf(p - 10 * y)], { hint: "Multiply ones, tens and hundreds, then add.", why: `${Math.floor(x / 100) * 100} × ${y} + ${Math.floor((x % 100) / 10) * 10} × ${y} + ${x % 10} × ${y} = ${nf(p)}.` }); }
      const x = ri(R, 21, 89), y = ri(R, 21, 89), t = Math.floor(y / 10), o = y % 10, p = x * y;
      return shMC(R, `${x} × ${y} = ___`, nf(p), [nf(x * t + x * o), nf(p + 100), nf(p - 10), nf(x * 10 * t + o)], { hint: `Multiply ${x} by ${o}, then by ${10 * t}, and add.`, why: `${x} × ${o} = ${x * o}; ${x} × ${10 * t} = ${nf(x * 10 * t)}; ${x * o} + ${nf(x * 10 * t)} = ${nf(p)}.` }); } },
  { id: "div1", strand: "multdiv", b: [4, 4], concept: "divide", title: "Divide by a one-digit number",
    learn: ["Think about how many equal groups.", "Divide the biggest place first, then bring down the next digit.", "Check: quotient × divisor (+ remainder) = the number you started with."],
    gen(R, b) { const d = ri(R, 3, 9), q = ri(R, 21, 99), r = R() < 0.5 ? 0 : ri(R, 1, d - 1), n = d * q + r, A = r ? `${q} R${r}` : String(q);
      return shMC(R, `${n} ÷ ${d} = ___`, A, r ? [`${q + 1} R${r}`, `${q - 1} R${r}`, `${q} R${r === 1 ? 2 : r - 1}`, `${q * 10} R${r}`] : [String(q + 1), String(q - 1), String(q + 10), `${q} R1`], { hint: `How many ${d}s fit into ${n}?`, why: `${d} × ${q} = ${d * q}${r ? `, and ${n} − ${d * q} = ${r} left over` : ""}. So ${n} ÷ ${d} = ${A}.` }); } },
  { id: "factors", strand: "multdiv", b: [4, 4], concept: "factors", title: "Factors and multiples",
    learn: ["A factor divides a number with nothing left over.", "A multiple is what you get when you multiply a number by 1, 2, 3 …", "Use multiplication facts to check."],
    gen(R, b) { if (R() < 0.5) { const n = shPick(R, [24, 28, 30, 32, 36, 40, 42, 45, 48, 54, 56, 63]), fs = [3, 4, 5, 6, 7, 8, 9].filter(f => n % f === 0), nf2 = [3, 4, 5, 6, 7, 8, 9, 10, 11].filter(f => n % f !== 0), f = shPick(R, fs);
        return shMC(R, `Which number is a factor of ${n}?`, f, shShuffle(R, nf2), { hint: "Which number divides evenly?", why: `${f} × ${n / f} = ${n}, so ${f} is a factor of ${n}.` }); }
      const k = ri(R, 3, 9), m = k * ri(R, 4, 9);
      return shMC(R, `Which number is a multiple of ${k}?`, m, [m + 1, m - 1, m + 2, m + k - 1].filter(v => v % k !== 0), { hint: `Skip-count by ${k}s.`, why: `${k} × ${m / k} = ${m}.` }); } },
  { id: "mult3", strand: "multdiv", b: [5, 5], concept: "multiply", title: "Multiply multi-digit numbers",
    learn: ["Multiply by the ones digit.", "Multiply by the tens digit and write a zero first, because you are multiplying by tens.", "Add the two partial products."],
    gen(R, b) { const x = ri(R, 123, 789), y = ri(R, 12, 48), t = Math.floor(y / 10), o = y % 10, p = x * y;
      return shMC(R, `${x} × ${y} = ___`, nf(p), [nf(x * o + x * t), nf(p + 100), nf(p - 10 * o), nf(x * o + x * t * 100)], { hint: "Did you write the zero when multiplying by the tens?", why: `${x} × ${o} = ${nf(x * o)}; ${x} × ${10 * t} = ${nf(x * 10 * t)}; total ${nf(p)}.` }); } },
  { id: "div2", strand: "multdiv", b: [5, 5], concept: "divide", title: "Divide multi-digit numbers",
    learn: ["Estimate: round the divisor to the nearest ten.", "Divide, multiply, subtract, bring down.", "Check by multiplying the quotient by the divisor."],
    gen(R, b) { const d = ri(R, 12, 38), q = ri(R, 21, 99), n = d * q;
      return shMC(R, `${nf(n)} ÷ ${d} = ___`, q, [q + 1, q - 1, q * 10, q + 10], { hint: `Estimate with ${Math.round(d / 10) * 10}.`, why: `${d} × ${q} = ${nf(n)}, so ${nf(n)} ÷ ${d} = ${q}.` }); } },
  // ---------------- fractions ----------------
  { id: "parts", strand: "fractions", b: [1, 2], concept: "unitfractions", title: "Equal parts",
    learn: ["A whole can be cut into equal parts.", "2 equal parts are halves, 3 are thirds, 4 are fourths.", "One shaded part out of the equal parts is one-half, one-third or one-fourth."],
    gen(R, b) {
      const names = { 2: "one-half", 3: "one-third", 4: "one-fourth" }, plural = { 2: "halves", 3: "thirds", 4: "fourths" }, kind = ri(R, 0, b >= 2 ? 4 : 2), n = shPick(R, [2, 3, 4]);
      const allNames = ["one-half", "one-third", "one-fourth", "two-thirds", "two-fourths", "three-fourths", "one whole"];
      if (kind === 1) { const m = ri(R, 2, 8);
        return shMC(R, "How many equal parts is this bar cut into?", m, [m + 1, m - 1, m + 2, 1], { n: nc(b), fig: { t: "fracbar", n: m, k: 0 }, read: b <= 1, hint: "Count every part, shaded or not.", why: `Count the parts: there are ${m}.` }); }
      if (kind === 2) { const who = shPick(R, SH_NAMES), obj = shPick(R, ["sandwich", "pizza", "cake", "pie", "tortilla"]);
        return shMC(R, `${who} cuts a ${obj} into ${n} equal parts and eats 1 part. What part did ${who} eat?`, names[n], shShuffle(R, [...allNames.filter(x => x !== names[n] && x !== "two-fourths"), ["two", "three", "four"][n - 2]]), { n: nc(b), read: b <= 1, hint: "1 part out of all the equal parts.", why: `${n} equal parts are ${plural[n]}; 1 of them is ${names[n]}.` }); }
      if (kind === 3) return shMC(R, `How many ${plural[n]} make one whole?`, n, [n + 1, n - 1, 1, n + 2], { n: nc(b), hint: `Think of a shape cut into ${plural[n]}.`, why: `${n} ${plural[n]} make one whole.` });
      if (kind === 4) { const [m, k, nm] = shPick(R, [[3, 2, "two-thirds"], [4, 3, "three-fourths"], [4, 2, "two-fourths"]]);
        return shMC(R, "What part of the shape is shaded?", nm, allNames.filter(x => x !== nm && !(nm === "two-fourths" && x === "one-half")), { n: nc(b), fig: { t: R() < 0.5 ? "fracbar" : "fraccircle", n: m, k }, hint: "Count the shaded parts and all the equal parts.", why: `${k} of the ${m} equal parts are shaded: ${nm}.` }); }
      return shMC(R, "What part of the shape is shaded?", names[n], [...Object.values(names).filter(x => x !== names[n]), "one whole", ["two", "three", "four"][n - 2]], { n: nc(b), fig: { t: R() < 0.5 ? "fracbar" : "fraccircle", n, k: 1 }, read: b <= 1, hint: "Count the equal parts.", why: `The shape has ${n} equal parts and 1 is shaded: ${names[n]}.` }); } },
  { id: "unitfrac", strand: "fractions", b: [3, 3], concept: "unitfractions", title: "Name fractions",
    learn: ["The bottom number (denominator) is how many equal parts.", "The top number (numerator) is how many parts are shaded.", "Write top over bottom: 3/4 means 3 of 4 equal parts."],
    gen(R, b) { const n = shPick(R, [3, 4, 6, 8]), k = ri(R, 1, n - 1);
      return shMC(R, "What fraction of the bar is shaded?", `${k}/${n}`, [`${n}/${k}`, `${n - k}/${n}`, `${k}/${n - k}`, `${k}/${n + 1}`, `1/${n}`], { fig: { t: "fracbar", n, k }, hint: "Count all the equal parts for the bottom number.", why: `${k} of the ${n} equal parts are shaded: ${k}/${n}.` }); } },
  { id: "comparefrac", strand: "fractions", b: [3, 4], concept: "comparefractions", title: "Compare fractions",
    learn: ["Same denominator: more parts means more.", "Same numerator: bigger pieces (smaller denominator) means more.", "Different both ways: compare each to 1/2, or make the denominators the same."],
    gen(R, b) { if (b === 3) { if (R() < 0.5) { const ds = shShuffle(R, [2, 3, 4, 6, 8]).slice(0, 4), mx = Math.min(...ds);
          return shMC(R, "Which fraction is the greatest?", `1/${mx}`, ds.filter(d => d !== mx).map(d => `1/${d}`), { hint: "Fewer equal parts means bigger parts.", why: `1/${mx} cuts the whole into the fewest parts, so each part is biggest.` }); }
        const d = shPick(R, [5, 6, 8, 10]), ks = shShuffle(R, Array.from({ length: d - 1 }, (_, i) => i + 1)).slice(0, 4), mk = Math.max(...ks);
        return shMC(R, "Which fraction is the greatest?", `${mk}/${d}`, ks.filter(k => k !== mk).map(k => `${k}/${d}`), { hint: "Same size parts: more parts is more.", why: `The parts are the same size, and ${mk}/${d} has the most of them.` }); }
      const big = shPick(R, ["5/8", "3/4", "4/6", "7/10", "2/3", "5/6"]);
      return shMC(R, "Which fraction is greater than 1/2?", big, shShuffle(R, ["3/8", "2/6", "1/4", "4/10", "2/5", "3/10"]), { hint: "Is the top number more than half the bottom number?", why: `${big}: the numerator is more than half the denominator, so it is greater than 1/2.` }); } },
  { id: "equivfrac", strand: "fractions", b: [3, 4], concept: "equivalent", title: "Equivalent fractions",
    learn: ["Equivalent fractions name the same amount.", "Multiply the top and bottom by the same number.", "Check with a picture: the shaded amount stays the same."],
    gen(R, b) { if (b === 3) { const [a, d] = shPick(R, [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]]), k = ri(R, 2, 3);
        return shMC(R, `Which fraction is equal to ${a}/${d}?`, `${a * k}/${d * k}`, [`${a + k}/${d + k}`, `${a * k}/${d}`, `${a}/${d * k}`, `${a * k + 1}/${d * k}`], { hint: "Multiply the top and bottom by the same number.", why: `${a} × ${k} = ${a * k} and ${d} × ${k} = ${d * k}: ${a}/${d} = ${a * k}/${d * k}.` }); }
      const d = shPick(R, [3, 4, 5, 6]), a = ri(R, 1, d - 1), k = ri(R, 2, 4);
      return shMC(R, `${a}/${d} = ?/${d * k}. What is the missing number?`, a * k, [a + k, a * k + 1, d * k - a, a * (k + 1)], { hint: `${d} times what makes ${d * k}?`, why: `${d} × ${k} = ${d * k}, so multiply the top by ${k} too: ${a} × ${k} = ${a * k}.` }); } },
  { id: "addlike", strand: "fractions", b: [4, 4], concept: "addfractions", title: "Add and subtract fractions",
    learn: ["When denominators are the same, the parts are the same size.", "Add or subtract the numerators.", "Keep the denominator the same."],
    gen(R, b) { const d = shPick(R, [5, 6, 8, 10, 12]), x = ri(R, 1, d - 2), y = ri(R, 1, d - 1 - x);
      if (R() < 0.6) return shMC(R, `${x}/${d} + ${y}/${d} = ___`, `${x + y}/${d}`, [`${x + y}/${2 * d}`, `${x * y}/${d}`, `${x + y + 1}/${d}`, `${x + y}/${d + 1}`], { hint: "Add the tops. Keep the bottom.", why: `${x} + ${y} = ${x + y} parts of size 1/${d}: ${x + y}/${d}.` });
      const s = x + y;
      return shMC(R, `${s}/${d} − ${x}/${d} = ___`, `${y}/${d}`, [`${y}/${2 * d}`, `${s + x}/${d}`, `${y + 1}/${d}`, `${y}/${d - 1}`], { hint: "Subtract the tops. Keep the bottom.", why: `${s} − ${x} = ${y}: ${y}/${d}.` }); } },
  { id: "fracdec", strand: "decimals", b: [4, 4], concept: "decimals", title: "Fractions as decimals",
    learn: ["Tenths: 7/10 = 0.7.", "Hundredths: 45/100 = 0.45.", "The number of places after the decimal point matches tenths or hundredths."],
    gen(R, b) { if (R() < 0.5) { const t = ri(R, 1, 9);
        return shMC(R, `Which decimal is equal to ${t}/10?`, `0.${t}`, [`${t}.0`, `0.0${t}`, `0.1${t}`, `${t}.10`], { hint: "Tenths use one place after the decimal point.", why: `${t}/10 is ${t} tenths: 0.${t}.` }); }
      let h = ri(R, 12, 98); if (h % 10 === 0 || h % 11 === 0) h += 1;
      return shMC(R, `Which decimal is equal to ${h}/100?`, `0.${h}`, [`${h}.0`, `0.0${h}`, `${Math.floor(h / 10)}.${h % 10}`, `0.${h % 10}${Math.floor(h / 10)}`], { hint: "Hundredths use two places after the decimal point.", why: `${h}/100 is ${h} hundredths: 0.${h}.` }); } },
  { id: "tenthmore", strand: "decimals", b: [4, 4], concept: "decimals", title: "A tenth or a hundredth more or less",
    learn: ["Find the tenths or hundredths place.", "Add or subtract 1 in that place only.", "The other digits stay the same, unless you have to regroup."],
    gen(R, b) { const w = ri(R, 1, 8), t = ri(R, 1, 8), h = ri(R, 1, 8), x = `${w}.${t}${h}`, more = R() < 0.6;
      return shMC(R, `What is 0.1 ${more ? "more" : "less"} than ${x}?`, `${w}.${t + (more ? 1 : -1)}${h}`, [`${w}.${t}${h + (more ? 1 : -1)}`, `${w + (more ? 1 : -1)}.${t}${h}`, `${w}.${t + (more ? -1 : 1)}${h}`, `${w}.${t}${h}1`], { hint: "0.1 is one tenth: change the tenths digit.", why: `Change the tenths digit by 1: ${x} → ${w}.${t + (more ? 1 : -1)}${h}.` }); } },
  { id: "addunlike", strand: "fractions", b: [5, 5], concept: "addfractions", title: "Add fractions with unlike denominators",
    learn: ["Find a common denominator.", "Rename each fraction with that denominator.", "Add the numerators and simplify if you can."],
    gen(R, b) { const [a, bb, c, d] = shPick(R, [[1, 2, 1, 4], [1, 3, 1, 6], [2, 3, 1, 6], [1, 2, 1, 3], [3, 4, 1, 8], [1, 4, 1, 3], [2, 5, 1, 10], [1, 2, 3, 8]]);
      const L = bb * d / gcd(bb, d), n = a * (L / bb) + c * (L / d), A = frac(n, L);
      const val = s => { const m = s.match(/^(\d+)(?: (\d+)\/(\d+))?$|^(\d+)\/(\d+)$/); if (!m) return NaN; return m[4] ? m[4] / m[5] : Number(m[1]) + (m[2] ? m[2] / m[3] : 0); };
      const wrong = [`${a + c}/${bb + d}`, `${a + c}/${bb * d}`, `${a + c}/${L}`, `${n}/${bb + d}`].filter(w => Math.abs(val(w) - n / L) > 1e-9);
      return shMC(R, `${a}/${bb} + ${c}/${d} = ___`, A, wrong, { hint: `Use ${L} as the denominator.`, why: `${a}/${bb} = ${a * (L / bb)}/${L} and ${c}/${d} = ${c * (L / d)}/${L}. ${a * (L / bb)}/${L} + ${c * (L / d)}/${L} = ${n}/${L}${frac(n, L) !== `${n}/${L}` ? ` = ${A}` : ""}.` }); } },
  { id: "multfrac", strand: "fractions", b: [5, 5], concept: "multiplyfractions", title: "Multiply fractions",
    learn: ["Whole number × fraction: multiply the whole number by the numerator.", "Fraction × fraction: multiply the tops, then multiply the bottoms.", "Simplify, and write improper fractions as mixed numbers."],
    gen(R, b) { if (R() < 0.5) { const w = ri(R, 2, 5), d = shPick(R, [3, 4, 5, 6, 8]), a = ri(R, 1, d - 1);
        return shMC(R, `${w} × ${a}/${d} = ___`, frac(w * a, d), [`${w * a}/${w * d}`, `${a}/${w * d}`, frac(w + a, d), `${w * a + 1}/${d}`], { hint: `Multiply ${w} by the numerator ${a}.`, why: `${w} × ${a} = ${w * a}, so ${w} × ${a}/${d} = ${w * a}/${d}${frac(w * a, d) !== `${w * a}/${d}` ? ` = ${frac(w * a, d)}` : ""}.` }); }
      const [a, bb, c, d] = shPick(R, [[1, 2, 3, 4], [2, 3, 1, 5], [3, 4, 1, 2], [1, 3, 2, 5], [2, 5, 1, 3], [3, 5, 1, 4]]);
      return shMC(R, `${a}/${bb} × ${c}/${d} = ___`, frac(a * c, bb * d), [`${a + c}/${bb + d}`, `${a * d}/${bb * c}`, `${a * c}/${bb + d}`, `${a + c}/${bb * d}`].filter(w => w !== frac(a * c, bb * d)), { hint: "Multiply top by top and bottom by bottom.", why: `${a} × ${c} = ${a * c}, ${bb} × ${d} = ${bb * d}: ${frac(a * c, bb * d)}.` }); } },
  { id: "divunit", strand: "fractions", b: [5, 5], concept: "dividefractions", title: "Divide with unit fractions",
    learn: ["1/4 ÷ 2 means split one-fourth into 2 equal parts: each is 1/8.", "3 ÷ 1/2 means how many halves fit in 3: 6.", "Draw a picture to check."],
    gen(R, b) { if (R() < 0.5) { const d = shPick(R, [2, 3, 4, 5]), w = ri(R, 2, 4);
        return shMC(R, `1/${d} ÷ ${w} = ___`, `1/${d * w}`, [frac(w, d), String(d * w), `1/${d + w}`, frac(d, w), `${w}/${d}`], { hint: `Split 1/${d} into ${w} equal parts.`, why: `Splitting 1/${d} into ${w} equal parts gives 1/${d * w}.` }); }
      const w = ri(R, 2, 6), d = shPick(R, [2, 3, 4]);
      return shMC(R, `${w} ÷ 1/${d} = ___`, w * d, [frac(w, d), `1/${w * d}`, w + d, w * d + 1], { hint: `How many 1/${d}s fit into ${w}?`, why: `Each whole holds ${d} pieces of 1/${d}, so ${w} wholes hold ${w * d}.` }); } },
  { id: "divasfrac", strand: "fractions", b: [5, 5], concept: "fractions", title: "Division as a fraction",
    learn: ["Sharing a things among b people gives each a/b.", "The number shared is the numerator.", "The number of people is the denominator."],
    gen(R, b) { const p = ri(R, 2, 5), f = ri(R, p + 1, 8);
      return shMC(R, `${f} friends share ${p} pizzas equally. How much pizza does each friend get?`, `${p}/${f}`, [frac(f, p), `1/${f}`, `1/${p}`, `${p}/${f + p}`], { hint: "Pizzas over friends.", why: `${p} ÷ ${f} = ${p}/${f} of a pizza each.` }); } },
  { id: "adddec", strand: "decimals", b: [5, 5], concept: "decimals", title: "Add and subtract decimals",
    learn: ["Line up the decimal points.", "Fill empty places with zeros.", "Add or subtract like whole numbers, then bring the decimal point straight down."],
    gen(R, b) { const a = ri(R, 111, 899) / 100, c = ri(R, 11, 59) / 10, add = R() < 0.6;
      if (add) { const s = (a + c).toFixed(2), mis = (a + c / 10).toFixed(2);
        return shMC(R, `${a.toFixed(2)} + ${c.toFixed(1)} = ___`, s, [mis, (a + c + 0.1).toFixed(2), (Math.abs(a - c)).toFixed(2), (a + c + 1).toFixed(2)], { hint: "Line up the decimal points first.", why: `${a.toFixed(2)} + ${c.toFixed(1)}0 = ${s}.` }); }
      const big = (a + c), s = a.toFixed(2);
      return shMC(R, `${big.toFixed(2)} − ${c.toFixed(1)} = ___`, s, [(big - c / 10).toFixed(2), (a + 0.1).toFixed(2), (big + c).toFixed(2), (a - 1).toFixed(2)], { hint: "Line up the decimal points first.", why: `${big.toFixed(2)} − ${c.toFixed(1)}0 = ${s}.` }); } },
  // ---------------- measurement, geometry and data ----------------
  { id: "shapes", strand: "measure", b: [0, 2], concept: "shapes", title: "Name shapes",
    learn: ["Count the sides and the corners.", "3 sides: triangle. 4 sides: square or rectangle. 5: pentagon. 6: hexagon.", "A circle has no sides or corners."],
    gen(R, b) { const S = [["triangle", 3], ["square", 4], ["rectangle", 4], ["pentagon", 5], ["hexagon", 6], ["circle", 0]], s = shPick(R, b <= 0 ? S.filter(x => ["triangle", "square", "rectangle", "circle"].includes(x[0])) : S);
      if (s[1] && R() < 0.5) return shMC(R, "How many sides does this shape have?", s[1], [s[1] + 1, s[1] - 1, s[1] + 2], { n: nc(b), fig: { t: "shape", k: s[0] }, read: b <= 1, hint: "Count each straight side.", why: `A ${s[0]} has ${s[1]} sides.` });
      return shMC(R, "What is the name of this shape?", s[0], shShuffle(R, S.map(x => x[0]).filter(x => x !== s[0] && !(s[0] === "square" && x === "rectangle"))), { n: nc(b), fig: { t: "shape", k: s[0] }, read: b <= 1, hint: "Count the sides and the corners.", why: s[1] ? `It has ${s[1]} sides${s[0] === "square" ? ", all the same length" : ""}: a ${s[0]}.` : "It is round with no sides: a circle." }); } },
  { id: "length", strand: "measure", b: [0, 1], concept: "measure", title: "Measure length",
    learn: ["Line up the end of the object with the start of the cubes.", "Count the cubes from one end to the other.", "To compare, find the difference between the two lengths."],
    gen(R, b) { const x = ri(R, 5, 10), y = ri(R, 2, x - 2), it = shPick(R, [["pencil", "crayon"], ["ribbon", "string"], ["train", "car"]]);
      if (b <= 0 || R() < 0.5) return shMC(R, `How many cubes long is the ${it[0]}?`, x, [x + 1, x - 1, y], { n: nc(b), read: b <= 0, fig: { t: "cubes", a: x, b: y, la: it[0], lb: it[1] }, hint: "Count the cubes next to it.", why: `The ${it[0]} is as long as ${x} cubes.` });
      return shMC(R, `How many cubes longer is the ${it[0]} than the ${it[1]}?`, x - y, [x + y, x, y], { n: nc(b), fig: { t: "cubes", a: x, b: y, la: it[0], lb: it[1] }, hint: "Find the difference.", why: `${x} − ${y} = ${x - y} cubes longer.` }); } },
  { id: "time", strand: "measure", b: [1, 2], concept: "time", title: "Tell time",
    learn: ["The short hand shows the hour.", "The long hand shows the minutes: each number is 5 minutes.", "Say the hour first, then the minutes."],
    gen(R, b) { const h = ri(R, 1, 12), m = b <= 1 ? shPick(R, [0, 30]) : ri(R, 1, 11) * 5, t = `${h}:${shPad(m)}`;
      const swapped = `${m === 0 ? 12 : m / 5}:${shPad((h * 5) % 60)}`, nextH = `${h === 12 ? 1 : h + 1}:${shPad(m)}`;
      return shMC(R, "What time does the clock show?", t, [swapped, nextH, `${h}:${shPad((m + 15) % 60)}`, `${h}:${shPad(m === 30 ? 0 : 30)}`], { n: nc(b), fig: { t: "clock", h, m }, hint: "Short hand: hour. Long hand: minutes, 5 for each number.", why: `The short hand is ${m >= 30 ? "past" : "at"} ${h}, and the long hand points to ${m === 0 ? 12 : m / 5}, which is ${m} minutes: ${t}.` }); } },
  { id: "money", strand: "measure", b: [2, 2], concept: "money", title: "Count money",
    learn: ["Start with the coin worth the most.", "Quarter 25¢, dime 10¢, nickel 5¢, penny 1¢.", "Count on: 25, 35, 40, 41 …"],
    gen(R, b) { const q = ri(R, 0, 3), d = ri(R, 1, 3), n = ri(R, 0, 2), p = ri(R, 1, 4), tot = 25 * q + 10 * d + 5 * n + p, cnt = q + d + n + p;
      return shMC(R, "How much money is shown?", `${tot}¢`, [`${cnt}¢`, `${tot + 5}¢`, `${tot - 10}¢`, `${tot + 10}¢`], { fig: { t: "coins", q, d, n, p }, hint: "Start with the quarters, then dimes, nickels and pennies.", why: `${[q && `${q} × 25¢`, d && `${d} × 10¢`, n && `${n} × 5¢`, p && `${p} × 1¢`].filter(Boolean).join(" + ")} = ${tot}¢.` }); } },
  { id: "graph", strand: "measure", b: [1, 3], concept: "data", title: "Read a bar graph",
    learn: ["Read the title and the labels.", "Find the top of each bar and read across to the numbers.", "To compare, subtract the two amounts."],
    gen(R, b) { const labels = shShuffle(R, ["Cats", "Dogs", "Fish", "Birds"]).slice(0, b <= 1 ? 3 : 4), scale = b >= 3 ? shPick(R, [2, 5]) : 1;
      const vals = labels.map(() => ri(R, 1, b <= 1 ? 7 : 10) * scale); while (new Set(vals).size < vals.length) vals[ri(R, 0, vals.length - 1)] += scale;
      const i = vals.indexOf(Math.max(...vals)), j = vals.indexOf(Math.min(...vals));
      if (R() < 0.4) return shMC(R, "Which pet has the most votes?", labels[i], labels.filter((_, k) => k !== i), { n: labels.length, fig: { t: "bars", labels, values: vals, scale }, hint: "Find the tallest bar.", why: `${labels[i]} has the tallest bar, ${vals[i]} votes.` });
      const dif = vals[i] - vals[j];
      return shMC(R, `How many more votes did ${labels[i]} get than ${labels[j]}?`, dif, [vals[i] + vals[j], vals[i], dif + scale, Math.max(1, dif - scale)], { n: nc(b), fig: { t: "bars", labels, values: vals, scale }, hint: "Subtract the smaller amount from the bigger one.", why: `${vals[i]} − ${vals[j]} = ${dif}.` }); } },
  { id: "areaperim", strand: "measure", b: [3, 5], concept: "area", title: "Area and perimeter",
    learn: ["Perimeter is the distance around: add all the sides.", "Area is the space inside: length × width.", "Area uses square units; perimeter uses plain units."],
    gen(R, b) { const l = ri(R, 4, 12), w = ri(R, 2, l - 1), u = shPick(R, ["cm", "m", "ft", "in"]), area = R() < 0.5;
      if (area) return shMC(R, `What is the area of the rectangle?`, `${l * w} sq ${u}`, [`${2 * (l + w)} sq ${u}`, `${l + w} sq ${u}`, `${l * w + l} sq ${u}`, `${2 * l * w} sq ${u}`], { fig: { t: "rect", l, w, u }, hint: "Area = length × width.", why: `${l} × ${w} = ${l * w} square ${u}.`, tag: "area" });
      return shMC(R, `What is the perimeter of the rectangle?`, `${2 * (l + w)} ${u}`, [`${l * w} ${u}`, `${l + w} ${u}`, `${2 * l + w} ${u}`, `${2 * (l + w) + 2} ${u}`], { fig: { t: "rect", l, w, u }, hint: "Add all four sides.", why: `${l} + ${w} + ${l} + ${w} = ${2 * (l + w)} ${u}.`, tag: "perimeter" }); } },
  { id: "linesrays", strand: "measure", b: [3, 3], concept: "geometry", title: "Points, lines and rays",
    learn: ["A line segment has two endpoints.", "A ray has one endpoint and goes on forever in one direction.", "A line goes on forever in both directions."],
    gen(R, b) { const k = shPick(R, ["segment", "ray", "line"]), names = { segment: "line segment", ray: "ray", line: "line" };
      return shMC(R, "What is this figure called?", names[k], [...Object.values(names).filter(x => x !== names[k]), "angle", "point"], { fig: { t: "linefig", k }, hint: "Look at the ends: dots or arrows?", why: { segment: "It has two endpoints, so it is a line segment.", ray: "It has one endpoint and one arrow, so it is a ray.", line: "It has arrows on both ends, so it is a line." }[k] }); } },
  { id: "tools", strand: "measure", b: [3, 3], concept: "measure", title: "Units and tools",
    learn: ["Length: rulers, in centimeters, meters, inches or feet.", "Liquid volume: measuring cups, in milliliters or liters.", "Mass: scales, in grams or kilograms. Temperature: thermometers."],
    gen(R, b) { const Q = [["Which unit is best for the water in a bathtub?", "liters", ["milliliters", "grams", "meters"]], ["Which tool measures how hot it is outside?", "thermometer", ["ruler", "scale", "measuring cup"]],
        ["Which unit is best for the length of a pencil?", "centimeters", ["kilometers", "liters", "kilograms"]], ["Which unit is best for the mass of a paper clip?", "grams", ["kilograms", "liters", "meters"]],
        ["Which tool measures the mass of an apple?", "scale", ["ruler", "thermometer", "clock"]], ["Which unit is best for the medicine in a spoon?", "milliliters", ["liters", "grams", "meters"]],
        ["Which unit is best for the length of a classroom?", "meters", ["centimeters", "liters", "grams"]], ["Which unit is best for the mass of a dog?", "kilograms", ["grams", "liters", "meters"]]];
      const q = shPick(R, Q); return shMC(R, q[0], q[1], q[2], { hint: "Think about what you are measuring: length, liquid, mass or temperature.", why: `${q[1].charAt(0).toUpperCase() + q[1].slice(1)} fits best.` }); } },
  { id: "elapsed", strand: "measure", b: [3, 4], concept: "time", title: "Elapsed time",
    learn: ["Start at the beginning time.", "Count on the hours, then the minutes.", "When the minutes reach 60, add an hour."],
    gen(R, b) { const h = ri(R, 1, 10), m = ri(R, 0, 11) * 5, dur = b === 3 ? ri(R, 2, 9) * 5 : ri(R, 5, 22) * 5, tot = m + dur, eh = h + Math.floor(tot / 60), em = tot % 60;
      const fmt = (H, M) => `${((H - 1) % 12) + 1}:${shPad(M)}`, durTxt = dur >= 60 ? `${Math.floor(dur / 60)} hour ${dur % 60} minutes` : `${dur} minutes`, act = shPick(R, ["A science lab", "A soccer practice", "A movie", "A field trip bus ride"]);
      return shMC(R, `${act} starts at ${fmt(h, m)} and lasts ${durTxt}. What time does it end?`, fmt(eh, em), [fmt(h, tot % 60), fmt(eh + 1, em), fmt(eh, (em + 10) % 60), fmt(h + Math.floor(dur / 60), m)], { hint: "Count on the hours, then the minutes.", why: `From ${fmt(h, m)}, count on ${durTxt}: ${fmt(eh, em)}.` }); } },
  { id: "convert", strand: "measure", b: [4, 5], concept: "convert", title: "Convert units",
    learn: ["Know the unit facts: 1 foot = 12 inches, 1 meter = 100 centimeters.", "Big unit to small unit: multiply.", "Small unit to big unit: divide."],
    gen(R, b) { const U = [["feet", "inches", 12], ["yards", "feet", 3], ["meters", "centimeters", 100], ["kilometers", "meters", 1000], ["kilograms", "grams", 1000], ["liters", "milliliters", 1000], ["hours", "minutes", 60], ["minutes", "seconds", 60], ...(b >= 5 ? [["pounds", "ounces", 16], ["gallons", "quarts", 4]] : [])];
      const [big, small, f] = shPick(R, U), n = ri(R, 2, 9);
      return shMC(R, `How many ${small} are in ${n} ${big}?`, nf(n * f), [nf(n + f), nf(n * f * 10), nf(f), nf(n * 10), nf(n * f + f)], { hint: `1 ${{ feet: "foot", yards: "yard", meters: "meter", kilometers: "kilometer", kilograms: "kilogram", liters: "liter", hours: "hour", minutes: "minute", pounds: "pound", gallons: "gallon" }[big]} = ${f} ${small}.`, why: `${n} × ${f} = ${nf(n * f)} ${small}.` }); } },
  { id: "angles", strand: "measure", b: [4, 4], concept: "angles", title: "Angles",
    learn: ["A right angle is 90°, like the corner of a page.", "Acute: less than 90°. Obtuse: more than 90° but less than 180°.", "A straight angle is 180°."],
    gen(R, b) { const deg = shPick(R, [30, 45, 60, 90, 110, 135, 150, 180]), kind = deg < 90 ? "acute" : deg === 90 ? "right" : deg < 180 ? "obtuse" : "straight";
      return shMC(R, `This angle measures ${deg}°. What kind of angle is it?`, kind, ["acute", "right", "obtuse", "straight"].filter(k => k !== kind), { fig: { t: "angle", deg }, hint: "Compare it with a right angle, 90°.", why: `${deg}° is ${deg < 90 ? "less than 90°" : deg === 90 ? "exactly 90°" : deg < 180 ? "more than 90° and less than 180°" : "180°"}: ${kind}.` }); } },
  { id: "stats", strand: "measure", b: [4, 5], concept: "data", title: "Mode, median, range and mean",
    learn: ["Put the numbers in order.", "Median: the middle number. Mode: the number that shows up most.", "Range: biggest minus smallest. Mean: add them all, then divide by how many."],
    gen(R, b) { let v; do { v = Array.from({ length: 5 }, () => ri(R, 2, 15)); v[1] = v[0]; } while (new Set(v).size < 4);
      const s = [...v].sort((x, y) => x - y), med = s[2], cnt = {}; v.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; }); const mode = Number(Object.keys(cnt).find(k => cnt[k] === Math.max(...Object.values(cnt))));
      const range = s[4] - s[0], sum = v.reduce((x, y) => x + y, 0), stat = shPick(R, b >= 5 && sum % 5 === 0 ? ["mean", "median", "range"] : ["median", "mode", "range"]);
      const vals = { median: med, mode, range, mean: sum / 5 }, A = vals[stat];
      return shMC(R, `Data: ${v.join(", ")}. What is the ${stat}?`, A, [...Object.entries(vals).filter(([k, x]) => k !== stat && Number.isInteger(x)).map(([, x]) => x), v[2], s[4], A + 1], { hint: stat === "range" ? "Biggest minus smallest." : stat === "mode" ? "Which number shows up most?" : stat === "mean" ? "Add them all and divide by 5." : "Put them in order and find the middle.", why: stat === "range" ? `${s[4]} − ${s[0]} = ${range}.` : stat === "mode" ? `${mode} shows up most often.` : stat === "mean" ? `${sum} ÷ 5 = ${sum / 5}.` : `In order: ${s.join(", ")}. The middle number is ${med}.` }); } },
  { id: "volume", strand: "measure", b: [5, 5], concept: "volume", title: "Volume of a box",
    learn: ["Volume is how many unit cubes fill a box.", "Multiply length × width × height.", "Write the answer in cubic units."],
    gen(R, b) { const l = ri(R, 3, 9), w = ri(R, 2, 6), h = ri(R, 2, 5), u = shPick(R, ["cm", "in", "m"]);
      return shMC(R, `A box is ${l} ${u} long, ${w} ${u} wide and ${h} ${u} tall. What is its volume?`, `${l * w * h} cubic ${u}`, [`${l + w + h} cubic ${u}`, `${l * w} cubic ${u}`, `${2 * (l * w + l * h + w * h)} cubic ${u}`, `${l * w * h + l} cubic ${u}`], { hint: "Length × width × height.", why: `${l} × ${w} × ${h} = ${l * w * h} cubic ${u}.` }); } },
  { id: "coords", strand: "measure", b: [5, 5], concept: "coordinates", title: "The coordinate plane",
    learn: ["Start at (0, 0).", "The first number tells how far to go right (x).", "The second number tells how far to go up (y)."],
    gen(R, b) { const x = ri(R, 1, 8); let y = ri(R, 1, 8); if (y === x) y = x === 8 ? 2 : x + 1;
      return shMC(R, "What are the coordinates of point A?", `(${x}, ${y})`, [`(${y}, ${x})`, `(${x}, ${x})`, `(${x + 1}, ${y})`, `(${x}, ${y - 1})`], { fig: { t: "coord", x, y }, hint: "Go across first, then up.", why: `Point A is ${x} to the right and ${y} up: (${x}, ${y}).` }); } },
  { id: "classify", strand: "measure", b: [5, 5], concept: "geometry", title: "Classify shapes",
    learn: ["Look at the sides: how many, and are any equal or parallel?", "Look at the angles: right, acute or obtuse?", "Use the most exact name that fits."],
    gen(R, b) { const Q = [["A quadrilateral has 4 right angles and 4 equal sides. What is it?", "square", ["trapezoid", "rhombus", "pentagon"]], ["A quadrilateral has exactly one pair of parallel sides. What is it?", "trapezoid", ["square", "rectangle", "rhombus"]],
        ["A triangle has one right angle. What kind of triangle is it?", "right triangle", ["acute triangle", "obtuse triangle", "equilateral triangle"]], ["A triangle has three equal sides. What kind of triangle is it?", "equilateral triangle", ["scalene triangle", "right triangle", "obtuse triangle"]],
        ["A triangle has one angle greater than 90°. What kind of triangle is it?", "obtuse triangle", ["acute triangle", "right triangle", "equilateral triangle"]], ["A quadrilateral has 4 right angles, but its sides are not all equal. What is it?", "rectangle", ["square", "trapezoid", "rhombus"]]];
      const q = shPick(R, Q); return shMC(R, q[0], q[1], q[2], { hint: "Check the sides, then the angles.", why: `That description fits a ${q[1]}.` }); } },
  // ---------------- algebraic reasoning ----------------
  { id: "pattern", strand: "algebra", b: [1, 5], concept: "patterns", title: "Number patterns",
    learn: ["Look at how each number changes to the next.", "Name the rule: add 5, multiply by 2 …", "Use the rule to find the next number."],
    gen(R, b) { let seq, rule;
      if (b <= 2) { const s = ri(R, 1, 20), k = shPick(R, b <= 1 ? [2, 5, 10] : [3, 4, 5, 10]); seq = [s, s + k, s + 2 * k, s + 3 * k]; rule = `add ${k}`; }
      else if (b <= 4) { if (R() < 0.5) { const s = ri(R, 2, 5); seq = [s, 2 * s, 4 * s, 8 * s]; rule = "multiply by 2"; } else { const s = ri(R, 3, 30), k = ri(R, 6, 12); seq = [s, s + k, s + 2 * k, s + 3 * k]; rule = `add ${k}`; } }
      else { const s = ri(R, 1, 5); seq = [s, 2 * s + 1, 2 * (2 * s + 1) + 1, 2 * (2 * (2 * s + 1) + 1) + 1]; rule = "multiply by 2, then add 1"; }
      const A = seq[3], d = seq[2] - seq[1];
      return shMC(R, `Rule: ${rule}. What comes next? ${seq.slice(0, 3).join(", ")}, ___`, A, [seq[2] + d + 1, seq[2] + (seq[1] - seq[0]), A + 1, A - 1, seq[2] * 2], { n: nc(b), hint: "Use the rule on the last number.", why: `${seq[2]}: ${rule} → ${A}.` }); } },
  { id: "orderops", strand: "algebra", b: [5, 5], concept: "orderofoperations", title: "Order of operations",
    learn: ["Do what is inside parentheses first.", "Then multiply and divide, left to right.", "Then add and subtract, left to right."],
    gen(R, b) { const a = ri(R, 2, 9), c = ri(R, 2, 6), d = ri(R, 2, 5);
      if (R() < 0.5) return shMC(R, `${a} + ${c} × ${d} = ___`, a + c * d, [(a + c) * d, a + c + d, a * c + d, a * c * d], { hint: "Multiply before you add.", why: `${c} × ${d} = ${c * d}, then ${a} + ${c * d} = ${a + c * d}.` });
      return shMC(R, `(${a} + ${c}) × ${d} = ___`, (a + c) * d, [a + c * d, a + c + d, a * d + c, a * c * d], { hint: "Parentheses first.", why: `${a} + ${c} = ${a + c}, then ${a + c} × ${d} = ${(a + c) * d}.` }); } },
  { id: "expression", strand: "algebra", b: [5, 5], concept: "expressions", title: "Write expressions",
    learn: ["Find the operations and their order in the words.", "Use parentheses for the step done first when it is not multiplication.", "Read your expression back to check."],
    gen(R, b) { const a = ri(R, 2, 9), c = ri(R, 2, 9), k = ri(R, 2, 5);
      if (R() < 0.5) return shMC(R, `Which expression means "add ${a} and ${c}, then multiply by ${k}"?`, `(${a} + ${c}) × ${k}`, [`${a} + ${c} × ${k}`, `${k} × ${a} + ${c}`, `${a} × ${c} + ${k}`], { hint: "The step done first goes in parentheses.", why: `Adding first needs parentheses: (${a} + ${c}) × ${k}.` });
      return shMC(R, `Which expression means "${k} times the difference of ${a + c} and ${c}"?`, `${k} × (${a + c} − ${c})`, [`${k} × ${a + c} − ${c}`, `${k} + (${a + c} − ${c})`, `${a + c} − ${c} × ${k}`, `${k} × ${a + c} + ${c}`], { hint: "The difference is found first.", why: `The difference ${a + c} − ${c} is found first, so it goes in parentheses: ${k} × (${a + c} − ${c}).` }); } },
  { id: "multistep", strand: "algebra", b: [4, 5], concept: "wordproblems", title: "Multi-step word problems",
    learn: ["Read the whole problem and list what you know.", "Plan the steps: what do you find first?", "Solve each step and check the answer makes sense."],
    gen(R, b) { const who = shPick(R, SH_NAMES), p = ri(R, 3, 8), e = shPick(R, [6, 8, 10, 12]), g = ri(R, 3, p * e - 5), A = p * e - g;
      return shMC(R, `${who} buys ${p} packs of ${e} pencils and gives away ${g}. How many pencils does ${who} have left?`, A, [p * e + g, p * e, p + e - g > 0 ? p + e - g : p * e - g + e, A - 1, A + 10], { hint: "First find the total, then subtract.", why: `${p} × ${e} = ${p * e}; ${p * e} − ${g} = ${A}.` }); } },
  { id: "missingx", strand: "algebra", b: [3, 5], concept: "equations", title: "Unknown numbers",
    learn: ["Read the equation and find the unknown.", "Use the opposite operation, or a fact you know.", "Put your answer back in to check."],
    gen(R, b) { if (b <= 4) { const x = ri(R, 3, 9), y = ri(R, 3, 9);
        return shMC(R, `${x} × ___ = ${x * y}`, y, [x * y - x, y + 1, x * y + x, y - 1], { hint: `Think: ${x * y} ÷ ${x}.`, why: `${x} × ${y} = ${x * y}.` }); }
      const n = ri(R, 2, 9), m = ri(R, 2, 5), c = ri(R, 1, 9);
      return shMC(R, `If n = ${n}, what is ${m} × n + ${c}?`, m * n + c, [Number(`${m}${n}`) + c, m * (n + c), m + n + c, m * n], { hint: `Replace n with ${n}.`, why: `${m} × ${n} = ${m * n}; ${m * n} + ${c} = ${m * n + c}.` }); } }
];
// a tiny evaluator for "a × b + c × d" style strings (no eval, so it works under the server's content policy)
function evalSimple(e) {
  const t = e.replace(/\s+/g, "").replace(/−/g, "-");
  if (!/^[\d+\-×]+$/.test(t)) return NaN;
  let total = 0;
  for (const term of t.match(/[+-]?[^+-]+/g) || []) total += (term[0] === "-" ? -1 : 1) * term.replace(/^[+-]/, "").split("×").reduce((a, x) => a * Number(x), 1);
  return total;
}
const SH_SKILL_STRANDS = { NUM: ["place"], ADD: ["addsub"], MG2: ["measure"], NS: ["place", "addsub"], MD: ["multdiv"], FR: ["fractions"], MGD: ["measure"],
  WN: ["place", "multdiv"], FD: ["fractions", "decimals"], AR: ["algebra"], MG5: ["measure"] };
if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { SH_MATH, shMC, shShuffle, shPick, evalSimple, SH_SKILL_STRANDS });
