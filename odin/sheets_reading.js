// ===== Odin 0.4: multiple-choice reading items and leveled passages for individual sheets =====
// Word-level skills (phonological awareness, phonics, high-frequency words, vocabulary) are generated from word banks.
// Comprehension skills use short leveled passages written for Odin, each with its own questions.
// read: true marks items the teacher reads aloud (kindergarten and grade 1 levels); in student mode a speaker button reads them.
const SH_RHYME = { at: "cat hat bat mat sat rat", an: "can fan man pan van ran", ig: "pig wig big dig fig", op: "hop mop top pop stop", ug: "bug hug mug rug jug",
  en: "hen pen ten men", ed: "bed red fed sled", ot: "dot hot pot not", un: "sun bun run fun", ip: "lip dip hip ship zip", ake: "cake lake rake snake", ing: "ring king sing wing" };
const SH_FIRST = { b: "ball bat bed bus big box", m: "map mop man milk moon mud", s: "sun sit sock sand seal six", t: "top ten tub toy tent tag", f: "fish fan fox fun feet fork",
  p: "pig pan pen pot pie park", d: "dog dig duck desk door dot", l: "leg log lip lamp lake leaf", h: "hat hen hop hug house hill", r: "rug run red ring rock rain" };
const SH_LAST = { t: "cat hot net sit boat feet", g: "dog big rug leg flag frog", n: "sun pen fan ten rain moon", p: "cap top lip cup ship soap", d: "bed mud red kid road seed", m: "ham drum swim gum broom team" };
// word: [sounds, similar words for blending distractors]
const SH_PHON = {
  0: { cat: ["k a t", "cap hat cot"], sun: ["s u n", "sit bun son"], map: ["m a p", "mop nap cap"], dog: ["d o g", "dig log dot"], fish: ["f i sh", "dish fist wish"], ship: ["sh i p", "shop chip sip"],
       bed: ["b e d", "bad red bell"], pig: ["p i g", "pin big peg"], hot: ["h o t", "hat pot hop"], go: ["g o", "no got goat"], me: ["m e", "my men meet"], see: ["s ee", "sea seed bee"] },
  1: { frog: ["f r o g", "fog from flog"], stop: ["s t o p", "step top spot"], flag: ["f l a g", "flat bag flap"], chip: ["ch i p", "ship chin cap"], lamp: ["l a m p", "limp camp lap"], tent: ["t e n t", "ten tint bent"],
       crab: ["k r a b", "cab grab crib"], nest: ["n e s t", "net best next"], cake: ["k a k", "lake cape cook"], bike: ["b i k", "bake like bite"], boat: ["b oa t", "bat goat boot"], rain: ["r ai n", "ran train rail"] },
  2: { plant: ["p l a n t", "pant plan slant"], splash: ["s p l a sh", "slash splat flash"], strip: ["s t r i p", "trip strap string"], blend: ["b l e n d", "bend blond lend"], frost: ["f r o s t", "fist frog front"],
       stamp: ["s t a m p", "stomp tamp camp"], crust: ["k r u s t", "rust crush cost"], train: ["t r ai n", "rain drain trail"], sleep: ["s l ee p", "slip seep sheep"], black: ["b l a k", "back block slack"] }
};
const SH_DELETE = [["cat", "k", "at", "hat an it"], ["meat", "m", "eat", "meet ate me"], ["snail", "n", "sail", "nail snake sell"], ["trip", "r", "tip", "rip trap top"], ["stop", "s", "top", "spot tap pot"],
  ["frog", "r", "fog", "fig rug dog"], ["spin", "p", "sin", "pin spit skin"], ["slip", "l", "sip", "lip ship sap"], ["bland", "l", "band", "land blend bad"], ["fox", "f", "ox", "box fix fog"], ["seat", "s", "eat", "sit set tea"], ["stack", "t", "sack", "tack snack stick"]];
const SH_SUBST = [["cat", "k", "h", "hat", "cap hot at"], ["map", "m", "t", "tap", "mat top nap"], ["fish", "f", "d", "dish", "fist wish dash"], ["pig", "p", "w", "wig", "pin big wag"], ["sun", "s", "r", "run", "sum ran bun"],
  ["bed", "b", "r", "red", "bad rod fed"], ["cast", "k", "f", "fast", "cost last fist"], ["mist", "m", "l", "list", "mast lost must"], ["hop", "h", "m", "mop", "hip map top"], ["lake", "l", "b", "bake", "like back bike"],
  ["ten", "t", "p", "pen", "tan pin hen"], ["sock", "s", "r", "rock", "sick rack lock"]];
const SH_SYLL = { cat: 1, sun: 1, dog: 1, frog: 1, apple: 2, pencil: 2, rabbit: 2, tiger: 2, monkey: 2, window: 2, banana: 3, elephant: 3, butterfly: 3, dinosaur: 3, computer: 3, kangaroo: 3, alligator: 4, watermelon: 4, caterpillar: 4, helicopter: 4 };
const SH_SYLL_BIG = { fantastic: 3, important: 3, remember: 3, invention: 3, helicopter: 4, unhappy: 3, careful: 2, reptile: 2, music: 2, calculator: 4, information: 4, vacation: 3, umbrella: 3, magnificent: 4, adventure: 3, celebration: 4 };
const SH_VOWEL = { a: "map bag hat fan jam sad", e: "bed pen wet leg red ten", i: "pig sit fin lip kid wig", o: "hot dog mop box pot log", u: "sun cup bug rug hut mud" };
const SH_CVC_SENT = [["The cat sat on the ___.", "mat", ["mud", "men"]], ["I can ___ fast.", "run", ["rub", "rat"]], ["The pig is in the ___.", "mud", ["mad", "map"]], ["The sun is ___.", "hot", ["hat", "hit"]],
  ["A ___ can fly.", "bug", ["bag", "big"]], ["Sit on the ___.", "rug", ["rub", "run"]], ["The fox sat in a ___.", "box", ["fix", "six"]], ["Dad has a red ___.", "hat", ["hit", "hop"]],
  ["I can ___ the ball.", "hit", ["hat", "hot"]], ["The dog sat on a ___.", "log", ["leg", "lip"]], ["Mom cooks in a ___.", "pot", ["pet", "pin"]], ["I nap in my ___.", "bed", ["bad", "bud"]]];
const SH_LONG = { a: ["cake", "lake gate name tape cave", "cap bat pan sad"], i: ["bike", "kite time pine ride", "bit pin kid sit"], o: ["rope", "home bone note rose", "rob hot not pop"], u: ["cube", "mule tube cute", "cub hut tub cut"] };
const SH_DIGRAPH = { sh: ["ship", "shop shell sheep shut"], ch: ["chip", "chin chop chick chair"], th: ["thin", "thick thumb think"], wh: ["whale", "wheel when white"] };
const SH_DIGRAPH_OTHER = "sip cop tin hen sock cot tick win";
const SH_BLEND_SENT = [["The ___ jumped into the pond.", "frog", ["flag", "from"]], ["The ___ waves on the pole.", "flag", ["frog", "flat"]], ["A ___ walks sideways on the sand.", "crab", ["grab", "crib"]],
  ["Please ___ the door.", "shut", ["chat", "shop"]], ["The ___ swims in the sea.", "fish", ["dish", "fist"]], ["I can ___ a kite.", "fly", ["fry", "flag"]], ["A ___ says quack.", "duck", ["dock", "deck"]],
  ["The baby sleeps in a ___.", "crib", ["crab", "crop"]], ["Brush your ___ every day.", "teeth", ["three", "thick"]], ["We ___ our hands to the song.", "clap", ["clip", "slap"]]];
const SH_TEAMS = { rain: ["train paint day play tail", "ran pan ring rent"], seed: ["feet tree read beach team", "bed set fit sad"], boat: ["coat road snow grow toad", "cot rod cut bat"],
  night: ["light high fly sky", "nit fit lid net"], moon: ["food spoon room pool", "mom sun man mine"] };
const SH_RCTRL = { "ar in park": ["barn car star farm", "or er"], "or in corn": ["fork horn storm sport", "ar er"], "er in her": ["bird turn girl fern", "ar or"] };
const SH_RWORDS = { ar: "barn car star farm", or: "fork horn storm sport", er: "bird turn girl fern" };
const SH_SPLIT = { napkin: "nap-kin", rabbit: "rab-bit", basket: "bas-ket", picnic: "pic-nic", sunset: "sun-set", cupcake: "cup-cake", muffin: "muf-fin", kitten: "kit-ten" };
const SH_SPLIT_V = { robot: "ro-bot", music: "mu-sic", tiger: "ti-ger", pilot: "pi-lot", lemon: "lem-on", camel: "cam-el", wagon: "wag-on", paper: "pa-per", seven: "sev-en", open: "o-pen" };
const SH_AFFIX_WORDS = [["not happy", "unhappy", ["happily", "happier", "happiness"]], ["read again", "reread", ["reader", "reading", "ready"]], ["full of care", "careful", ["careless", "caring", "cared"]],
  ["without fear", "fearless", ["fearful", "feared", "fears"]], ["the opposite of lock", "unlock", ["locker", "locked", "locket"]], ["one who paints", "painter", ["painted", "painting", "repaint"]],
  ["fill again", "refill", ["filling", "filled", "fills"]], ["not kind", "unkind", ["kindly", "kindness", "kinder"]], ["in a slow way", "slowly", ["slower", "slowest", "slows"]], ["can be washed", "washable", ["washer", "washed", "rewash"]]];
const SH_SUFFIXED = [["careful", "carpet cartoon carrot"], ["helpful", "helmet hello hollow"], ["quickly", "quilt quiet quack"], ["teacher", "tea team tease"], ["painless", "paint pail pain"]];
// Dolch sight words (public domain), by grade-level band
const SH_DOLCH = {
  0: "a and away big blue can come down find for funny go help here I in is it jump little look make me my not one play red run said see the three to two up we where yellow you all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran ride saw say she so soon that there they this too under want was well went what white who will with yes",
  1: "after again an any as ask by could every fly from give going had has her him his how just know let live may of old once open over put round some stop take thank them then think walk were when",
  2: "always around because been before best both buy call cold does don't fast first five found gave goes green its made many off or pull read right sing sit sleep tell their these those upon us use very wash which why wish work would write your",
  3: "about better bring carry clean cut done draw drink eight fall far full got grow hold hot hurt if keep kind laugh light long much myself never only own pick seven shall show six small start ten today together try warm"
};
const SH_HFW_FRAMES = [["We ___ to the park after school.", "went", ["want", "when", "what"]], ["I ___ my dog every day.", "walk", ["want", "wash", "work"]], ["Can you ___ me the ball?", "give", ["going", "gave", "live"]],
  ["___ you come to my party?", "Could", ["Cold", "Call", "Come"]], ["The bird can ___ high in the sky.", "fly", ["for", "find", "fell"]], ["My mom ___ my lunch for me.", "made", ["make", "may", "many"]],
  ["We stayed inside ___ it was raining.", "because", ["before", "become", "behind"]], ["I ___ eat breakfast before school.", "always", ["away", "also", "around"]], ["___ shoes are on the mat.", "Their", ["There", "These", "Them"]],
  ["Please ___ your hands before lunch.", "wash", ["want", "was", "wish"]], ["I ___ a letter to my grandma.", "wrote", ["write", "white", "wait"]], ["How ___ apples are in the bag?", "many", ["made", "may", "money"]],
  ["___ book is yours?", "Which", ["Witch", "Wish", "White"]], ["She ___ her lost cat under the bed.", "found", ["find", "fond", "four"]], ["We ___ new shoes at the store.", "buy", ["by", "boy", "bay"]],
  ["I ___ my homework and then played outside.", "finished", ["fished", "first", "finds"]], ["Please ___ your books to class.", "bring", ["brown", "bang", "being"]], ["I can ___ this heavy box.", "carry", ["carrot", "car", "cart"]],
  ["The joke made everyone ___.", "laugh", ["leaf", "lunch", "launch"]], ["I did it all by ___.", "myself", ["himself", "maybe", "mostly"]], ["We worked ___ as a team.", "together", ["tomorrow", "toward", "tonight"]],
  ["Put on a coat to stay ___.", "warm", ["warn", "worm", "work"]], ["A spider has ___ legs.", "eight", ["eat", "either", "eighty"]], ["The cup is ___ of juice.", "full", ["fell", "fill", "fall"]],
  ["Plants need water to ___.", "grow", ["grew", "green", "glow"]], ["Did you ___ your knee when you fell?", "hurt", ["heart", "hunt", "hat"]], ["Be ___ to your friends.", "kind", ["kid", "king", "kite"]],
  ["Turn on the ___ so we can see.", "light", ["like", "little", "night"]], ["I have ___ been to the moon.", "never", ["ever", "nearly", "nothing"]], ["Today is sunny, so ___ we can swim.", "maybe", ["many", "made", "mean"]],
  ["Once ___ a time, there was a king.", "upon", ["open", "upper", "under"]], ["Put the cup ___ the table.", "on", ["no", "one", "own"]], ["I ___ to be a doctor.", "want", ["went", "wait", "what"]],
  ["The cat is ___ the box.", "under", ["upper", "undo", "until"]]];
const SH_OPP = [["big", "small"], ["hot", "cold"], ["up", "down"], ["fast", "slow"], ["happy", "sad"], ["wet", "dry"], ["open", "closed"], ["day", "night"], ["full", "empty"], ["loud", "quiet"], ["old", "new"], ["short", "tall"]];
const SH_SAME = [["happy", "glad"], ["little", "small"], ["big", "large"], ["fast", "quick"], ["shut", "close"], ["jump", "hop"], ["look", "see"], ["begin", "start"], ["sick", "ill"], ["yell", "shout"]];
const SH_CATS = [["Which one is a fruit?", "apple", "chair shoe dog lamp"], ["Which one is an animal?", "horse", "spoon lamp bus cup"], ["Which one can you wear?", "hat", "cup tree book fork"],
  ["Which one is a color?", "blue", "cat run sun cake"], ["Which one can you ride?", "bike", "pillow apple pencil plate"], ["Which one is a body part?", "hand", "sock rock bell bowl"]];
const SH_PREFIX = { un: ["not", "unhappy unlock unkind unsafe"], re: ["again", "redo reread rebuild refill"], dis: ["the opposite of", "disagree dislike disappear disobey"], pre: ["before", "preview preheat preschool pretest"], mis: ["wrongly", "misread misspell misplace mislead"] };
const SH_SUFFIX = { ful: ["full of", "careful hopeful helpful thankful"], less: ["without", "fearless careless endless spotless"], er: ["one who", "teacher painter farmer baker"], able: ["can be", "readable washable breakable bendable"], ly: ["in a way that is", "quickly slowly softly gently"] };
const SH_ROOTS = { port: ["carry", "transport portable"], graph: ["write", "autograph paragraph"], spect: ["look", "inspect spectator"], tele: ["far", "telescope telephone"], dict: ["say", "predict dictionary"],
  aud: ["hear", "audio audience"], bio: ["life", "biology biography"], geo: ["earth", "geography geology"], struct: ["build", "structure construct"], therm: ["heat", "thermometer thermos"], micro: ["small", "microscope microphone"] };
const SH_PREFIX4 = { inter: ["between", "international interstate"], sub: ["under", "submarine subway"], trans: ["across", "transport transatlantic"], mid: ["middle", "midnight midweek"], over: ["too much", "overcook overflow"], non: ["not", "nonstop nonfiction"] };
const SH_CONTEXT = {
  2: [["The enormous elephant could not fit through the door. What does enormous mean?", "very big", ["very small", "very fast", "very loud"]],
      ["The damp towel was still drying in the sun. What does damp mean?", "a little wet", ["very hot", "clean", "torn"]],
      ["Leo was famished after the long hike, so he ate two sandwiches. What does famished mean?", "very hungry", ["very tired", "very happy", "lost"]],
      ["The puppy was timid and hid behind the chair when visitors came. What does timid mean?", "shy and scared", ["loud", "hungry", "sleepy"]],
      ["The room was so dim that we needed a flashlight. What does dim mean?", "not bright", ["very cold", "very big", "messy"]],
      ["Ana was furious when her brother broke her new toy. What does furious mean?", "very angry", ["very calm", "very funny", "sleepy"]],
      ["The river was so shallow that we could see the rocks on the bottom. What does shallow mean?", "not deep", ["very fast", "dirty", "wide"]],
      ["Please discard the old papers in the recycling bin. What does discard mean?", "throw away", ["read", "fold", "keep"]],
      ["The kitten was so fragile that we held it very gently. What does fragile mean?", "easy to hurt or break", ["very strong", "noisy", "fluffy"]],
      ["After the storm, the lake was calm and tranquil. What does tranquil mean?", "peaceful and quiet", ["windy", "dark", "crowded"]],
      ["Sam was reluctant to jump into the cold pool and waited a long time. What does reluctant mean?", "not wanting to", ["excited to", "ready to", "able to"]],
      ["The ancient castle was built more than a thousand years ago. What does ancient mean?", "very old", ["very tall", "brand new", "broken"]]],
  4: [["The hikers were exhausted after climbing all day, so they rested at the top. What does exhausted mean?", "very tired", ["very excited", "lost", "hungry"]],
      ["The scientist made a meticulous drawing, carefully adding every tiny detail. What does meticulous mean?", "very careful", ["very quick", "messy", "colorful"]],
      ["The town was in a drought; it had not rained for three months. What is a drought?", "a long time without rain", ["a big storm", "a cold winter", "a flood"]],
      ["Maria was apprehensive about the test, so she studied every night. What does apprehensive mean?", "worried", ["bored", "proud", "angry"]],
      ["The loud music made it impossible to concentrate on my homework. What does concentrate mean?", "pay close attention", ["finish quickly", "sing along", "fall asleep"]],
      ["The coach praised the team, telling them they had played their best game ever. What does praised mean?", "said good things about", ["yelled at", "ignored", "laughed at"]],
      ["The bridge was sturdy enough to hold three trucks at once. What does sturdy mean?", "strong", ["short", "shaky", "new"]],
      ["The plant began to wilt because nobody watered it. What does wilt mean?", "droop and dry out", ["grow taller", "bloom", "change color"]],
      ["The museum guide was knowledgeable and answered every question we asked. What does knowledgeable mean?", "knowing a lot", ["very friendly", "very funny", "tired"]],
      ["Hurricanes can devastate a town, destroying homes and roads. What does devastate mean?", "badly damage", ["clean up", "visit", "cool down"]]]
};
const SH_CONNOTE = [["Which word best describes someone who saves money wisely?", "thrifty", ["cheap", "wasteful", "careless"]], ["Which word best describes someone who believes in themselves in a good way?", "confident", ["bossy", "nervous", "rude"]],
  ["Which word best describes someone who likes to learn new things?", "curious", ["nosy", "bored", "lazy"]], ["Which word best describes someone who keeps working hard to reach a goal?", "determined", ["stubborn", "careless", "sleepy"]]];
const SH_MULTI = [["The bat flew out of the cave at night.", "bat", "a flying animal", ["a stick for hitting a ball", "to hit something", "to blink your eyes"]],
  ["She hit the ball with a wooden bat.", "bat", "a stick for hitting a ball", ["a flying animal", "to blink your eyes", "a kind of cave"]],
  ["Please file the papers in the drawer.", "file", "put in order", ["a tool for smoothing nails", "a line of people", "a kind of drawer"]],
  ["The boat rocked on the waves.", "rocked", "moved back and forth", ["was made of stone", "played loud music", "sank"]],
  ["We sat on the bank of the river.", "bank", "the land along a river", ["a place to keep money", "to tilt an airplane", "a pile of snow"]],
  ["The baby can't bear loud noises.", "bear", "put up with", ["a large animal", "to carry", "bare, or uncovered"]]];

// ---------- reading item makers: each returns one multiple-choice item ----------
const shWords = s => s.split(" ");
function shOthers(R, pool, not, k) { return shShuffle(R, pool.filter(w => !not.includes(w))).slice(0, k); }
const SH_READ_KINDS = {
  PA: [
    { id: "rhyme", concept: "rhyme", b: [0, 1], make(R, b) { const fams = Object.keys(SH_RHYME), f = shPick(R, fams), ws = shShuffle(R, shWords(SH_RHYME[f])), others = fams.filter(x => x !== f).flatMap(x => shWords(SH_RHYME[x]));
        return shMC(R, `Which word rhymes with ${ws[0]}?`, ws[1], shOthers(R, others, [], 3), { n: nc(b), read: b <= 1, hint: "Rhyming words end with the same sounds.", why: `${ws[0]} and ${ws[1]} both end with -${f}.` }); } },
    { id: "first", concept: "phonemes", b: [0, 1], make(R, b) { const ks = Object.keys(SH_FIRST), k = shPick(R, ks), ws = shShuffle(R, shWords(SH_FIRST[k])), others = ks.filter(x => x !== k).flatMap(x => shWords(SH_FIRST[x]));
        return shMC(R, `Which word begins with the same sound as ${ws[0]}?`, ws[1], shOthers(R, others, [], 3), { n: nc(b), read: b <= 1, hint: "Say each word. Listen to the very first sound.", why: `${ws[0]} and ${ws[1]} both begin with /${k}/.` }); } },
    { id: "last", concept: "phonemes", b: [1, 2], make(R, b) { const ks = Object.keys(SH_LAST), k = shPick(R, ks), ws = shShuffle(R, shWords(SH_LAST[k])), others = ks.filter(x => x !== k).flatMap(x => shWords(SH_LAST[x]));
        return shMC(R, `Which word ends with the same sound as ${ws[0]}?`, ws[1], shOthers(R, others, [], 3), { n: nc(b), read: b <= 1, hint: "Say each word. Listen to the very last sound.", why: `${ws[0]} and ${ws[1]} both end with /${k}/.` }); } },
    { id: "count", concept: "phonemes", b: [0, 2], make(R, b) { const set = SH_PHON[Math.min(b, 2)], w = shPick(R, Object.keys(set)), n = set[w][0].split(" ").length;
        return shMC(R, `How many sounds do you hear in “${w}”?`, n, [w.length !== n ? w.length : n + 1, n - 1, n + 1, n + 2].filter(x => x > 0), { n: nc(b), read: b <= 1, hint: "Stretch the word out. Hold up a finger for each sound.", why: `${w}: /${set[w][0].split(" ").join("/ /")}/ is ${n} sounds.` }); } },
    { id: "blend", concept: "phonemes", b: [0, 2], make(R, b) { const set = SH_PHON[Math.min(b, 2)], w = shPick(R, Object.keys(set)), [snd, sim] = set[w];
        return shMC(R, `Put these sounds together: /${snd.split(" ").join("/ /")}/. What word do they make?`, w, shWords(sim), { n: nc(b), read: b <= 1, hint: "Say the sounds slowly, then faster, until they make a word.", why: `/${snd.split(" ").join("/ /")}/ blends to make ${w}.` }); } },
    { id: "delete", concept: "phonemes", b: [1, 5], make(R, b) { const [w, s, r, d] = shPick(R, SH_DELETE);
        return shMC(R, `Say “${w}”. Now say it without /${s}/. What word is left?`, r, shWords(d), { n: nc(b), read: b <= 1, hint: `Say ${w} slowly and leave out the /${s}/ sound.`, why: `${w} without /${s}/ is ${r}.` }); } },
    { id: "subst", concept: "phonemes", b: [2, 5], make(R, b) { const [w, a, c, r, d] = shPick(R, SH_SUBST);
        return shMC(R, `Say “${w}”. Change /${a}/ to /${c}/. What is the new word?`, r, shWords(d), { n: nc(b), read: b <= 1, hint: `Swap only the /${a}/ sound.`, why: `${w} with /${c}/ instead of /${a}/ is ${r}.` }); } },
    { id: "syll", concept: "syllables", b: [1, 5], make(R, b) { const bank = b >= 3 ? SH_SYLL_BIG : SH_SYLL, w = shPick(R, Object.keys(bank)), n = bank[w];
        return shMC(R, `How many syllables (claps) are in “${w}”?`, n, [n + 1, n - 1, n + 2, n - 2].filter(x => x > 0), { n: nc(b), read: b <= 1, hint: "Clap each part as you say the word.", why: `${w} has ${n} claps.` }); } }
  ],
  PH: [
    { id: "short", concept: "decode", b: [0, 0], make(R, b) { const vs = Object.keys(SH_VOWEL), v = shPick(R, vs), key = { a: "cat", e: "bed", i: "pig", o: "hot", u: "sun" }[v], ans = shPick(R, shWords(SH_VOWEL[v]).filter(x => x !== key));
        return shMC(R, `Which word has the short ${v} sound, like in ${key}?`, ans, shOthers(R, vs.filter(x => x !== v).flatMap(x => shWords(SH_VOWEL[x])), [], 3), { n: nc(b), read: true, hint: "Say each word and listen to the middle sound.", why: `${ans} has the short ${v} sound, like ${key}.` }); } },
    { id: "cvcsent", concept: "decode", b: [0, 1], make(R, b) { const [s, a, w] = shPick(R, SH_CVC_SENT);
        return shMC(R, `Which word finishes the sentence? ${s}`, a, w, { n: nc(b), hint: "Sound out each word, then read the sentence with it.", why: `“${s.replace("___", a)}” makes sense.` }); } },
    { id: "long", concept: "decode", b: [1, 2], make(R, b) { const v = shPick(R, Object.keys(SH_LONG)), [key, yes, no] = SH_LONG[v], ans = shPick(R, shWords(yes));
        return shMC(R, `Which word has the long ${v} sound, like in ${key}?`, ans, shShuffle(R, shWords(no)), { n: nc(b), hint: "A silent e at the end can make the vowel say its name.", why: `${ans} ends in silent e, so the ${v} says its name, like ${key}.` }); } },
    { id: "digraph", concept: "decode", b: [1, 2], make(R, b) { const d = shPick(R, Object.keys(SH_DIGRAPH)), [key, ws] = SH_DIGRAPH[d], ans = shPick(R, shWords(ws));
        return shMC(R, `Which word begins with ${d}, like ${key}?`, ans, shShuffle(R, [...Object.keys(SH_DIGRAPH).filter(x => x !== d).map(x => shPick(R, shWords(SH_DIGRAPH[x][1]))), ...shWords(SH_DIGRAPH_OTHER)]), { n: nc(b), hint: `Two letters, ${d}, make one sound.`, why: `${ans} begins with ${d}.` }); } },
    { id: "blendsent", concept: "decode", b: [1, 2], make(R, b) { const [s, a, w] = shPick(R, SH_BLEND_SENT);
        return shMC(R, `Which word finishes the sentence? ${s}`, a, [...w, ...shOthers(R, SH_BLEND_SENT.map(x => x[1]), [a, ...w], 1)], { n: nc(b), hint: "Sound out each word, then read the sentence with it.", why: `“${s.replace("___", a)}” makes sense.` }); } },
    { id: "teams", concept: "vowels", b: [2, 3], make(R, b) { const k = shPick(R, Object.keys(SH_TEAMS)), [yes, no] = SH_TEAMS[k], ans = shPick(R, shWords(yes));
        return shMC(R, `Which word has the same vowel sound as ${k}?`, ans, shShuffle(R, shWords(no)), { hint: "Look for the vowel team that makes the same sound.", why: `${ans} and ${k} have the same vowel sound.` }); } },
    { id: "rctrl", concept: "vowels", b: [2, 3], make(R, b) { const k = shPick(R, Object.keys(SH_RCTRL)), [yes, others] = SH_RCTRL[k], ans = shPick(R, shWords(yes));
        return shMC(R, `Which word has the same sound as ${k}?`, ans, shShuffle(R, shWords(others).flatMap(o => shWords(SH_RWORDS[o]))), { hint: "The r changes the vowel sound.", why: `${ans} has the same r-controlled sound as ${k.split(" in ")[1]}.` }); } },
    { id: "split", concept: "syllables", b: [2, 3], make(R, b) { const w = shPick(R, Object.keys(SH_SPLIT)), ok = SH_SPLIT[w], i = ok.indexOf("-");
        const wrong = [w.slice(0, i - 1) + "-" + w.slice(i - 1), w.slice(0, i + 1) + "-" + w.slice(i + 1), w[0] + "-" + w.slice(1)];
        return shMC(R, `Which shows the syllables in “${w}”?`, ok, wrong, { hint: "Two consonants in the middle: split between them.", why: `${w} splits between the two middle consonants: ${ok}.` }); } },
    { id: "splitv", concept: "syllables", b: [3, 5], make(R, b) { const w = shPick(R, Object.keys(SH_SPLIT_V)), ok = SH_SPLIT_V[w], i = ok.indexOf("-");
        const alt = i === 1 || ok[i - 1].match(/[aeiou]/) ? w.slice(0, i + 1) + "-" + w.slice(i + 1) : w.slice(0, i - 1) + "-" + w.slice(i - 1);
        return shMC(R, `Which shows the syllables in “${w}”?`, ok, [alt, w[0] + "-" + w.slice(1), w.slice(0, -1) + "-" + w.slice(-1), w.slice(0, i + 2) + "-" + w.slice(i + 2)], { hint: "Try the first vowel long (open syllable), then short (closed). Which sounds like a real word?", why: `Say it: ${ok.replace("-", " · ")}.` }); } },
    { id: "syllbig", concept: "syllables", b: [3, 5], make(R, b) { const w = shPick(R, Object.keys(SH_SYLL_BIG)), n = SH_SYLL_BIG[w];
        return shMC(R, `How many syllables are in “${w}”?`, n, [n + 1, n - 1, n + 2, n - 2].filter(x => x > 0), { hint: "Each syllable has one vowel sound.", why: `${w} has ${n} syllables.` }); } },
    { id: "affix", concept: "affixes", b: [3, 5], make(R, b) { const [mean, w, d] = shPick(R, SH_AFFIX_WORDS);
        return shMC(R, `Which word means “${mean}”?`, w, d, { hint: "Look at the prefix or suffix and what it adds.", why: `${w} means ${mean}.` }); } },
    { id: "suffixed", concept: "affixes", b: [3, 5], make(R, b) { const [w, d] = shPick(R, SH_SUFFIXED);
        return shMC(R, "Which word has a suffix?", w, shWords(d), { hint: "A suffix is added to the end of a base word.", why: `${w} is a base word plus a suffix.` }); } }
  ],
  HFW: [
    { id: "say", concept: "hfw", b: [0, 1], make(R, b) { const pool = shWords(SH_DOLCH[Math.min(b, 3)]), w = shPick(R, pool.filter(x => x.length > 1)), all = Object.values(SH_DOLCH).flatMap(shWords).filter(x => x !== w);
        const sim = x => (x[0] === w[0] ? 2 : 0) + (Math.abs(x.length - w.length) <= 1 ? 1 : 0) + (x.slice(-1) === w.slice(-1) ? 1 : 0);
        const cands = shShuffle(R, all).sort((p, q) => sim(q) - sim(p)).slice(0, 6);
        return shMC(R, "Listen to your teacher say a word. Fill in the bubble for that word.", w, cands, { n: nc(b), read: true, say: w, hint: "Look at the first letter and the whole word.", why: `The word is ${w}.` }); } },
    { id: "frame", concept: "hfw", b: [1, 5], make(R, b) { const [s, a, d] = shPick(R, SH_HFW_FRAMES);
        return shMC(R, `Which word finishes the sentence? ${s}`, a, d, { n: nc(b), hint: "Try each word in the blank. Which one makes sense?", why: `“${s.replace("___", a)}” makes sense.` }); } }
  ],
  VOC: [
    { id: "opp", concept: "wordrelations", b: [0, 2], make(R, b) { const [w, a] = shPick(R, SH_OPP), pair = SH_SAME.find(x => x.includes(w)), syn = pair ? pair.find(x => x !== w) : null;
        return shMC(R, `Which word means the opposite of ${w}?`, a, [syn && syn !== w ? syn : null, ...shOthers(R, SH_OPP.flat(), [w, a], 4)], { n: nc(b), read: b <= 1, hint: "Opposites mean very different things.", why: `${w} and ${a} are opposites.` }); } },
    { id: "same", concept: "wordrelations", b: [0, 2], make(R, b) { const [w, a] = shPick(R, SH_SAME), opp = (SH_OPP.find(x => x[0] === w) || [])[1];
        return shMC(R, `Which word means almost the same as ${w}?`, a, [opp, ...shOthers(R, SH_OPP.flat(), [w, a], 4)], { n: nc(b), read: b <= 1, hint: "Look for a word you could use instead.", why: `${w} and ${a} mean almost the same thing.` }); } },
    { id: "cat", concept: "wordrelations", b: [0, 1], make(R, b) { const [q, a, d] = shPick(R, SH_CATS);
        return shMC(R, q, a, shShuffle(R, shWords(d)), { n: nc(b), read: true, hint: "Think about what each word names.", why: `${a} is the only one that fits.` }); } },
    { id: "prefix", concept: "morphology", b: [2, 3], make(R, b) { const ks = Object.keys(SH_PREFIX), p = shPick(R, ks), [mean, ws] = SH_PREFIX[p], w = shPick(R, shWords(ws));
        return shMC(R, `In the word “${w}”, what does the prefix ${p}- mean?`, mean, ks.filter(x => x !== p).map(x => SH_PREFIX[x][0]), { hint: "Cover the prefix. What is the base word?", why: `${p}- means “${mean}”, so ${w} means ${mean} ${w.slice(p.length)}.` }); } },
    { id: "suffix", concept: "morphology", b: [2, 3], make(R, b) { const ks = Object.keys(SH_SUFFIX), x = shPick(R, ks), [mean, ws] = SH_SUFFIX[x], w = shPick(R, shWords(ws));
        return shMC(R, `In the word “${w}”, what does the suffix -${x} mean?`, mean, ks.filter(y => y !== x).map(y => SH_SUFFIX[y][0]), { hint: "Cover the suffix. What is the base word?", why: `-${x} means “${mean}”.` }); } },
    { id: "context", concept: "context", b: [2, 5], make(R, b) { const [q, a, d] = shPick(R, SH_CONTEXT[b >= 4 ? 4 : 2]);
        return shMC(R, q, a, d, { hint: "Read the whole sentence. What clue words help?", why: `The clues in the sentence show it means “${a}”.` }); } },
    { id: "roots", concept: "morphology", b: [4, 5], make(R, b) { const ks = Object.keys(SH_ROOTS), r = shPick(R, ks), [mean, ws] = SH_ROOTS[r], w = shPick(R, shWords(ws));
        return shMC(R, `The root “${r}” in ${w} means ___.`, mean, shShuffle(R, ks.filter(x => x !== r).map(x => SH_ROOTS[x][0])), { hint: "Think of other words with the same root.", why: `${r} means “${mean}”, as in ${ws.replace(" ", " and ")}.` }); } },
    { id: "prefix4", concept: "morphology", b: [4, 5], make(R, b) { const ks = Object.keys(SH_PREFIX4), p = shPick(R, ks), [mean, ws] = SH_PREFIX4[p], w = shPick(R, shWords(ws));
        return shMC(R, `In “${w}”, what does the prefix ${p}- mean?`, mean, shShuffle(R, ks.filter(x => x !== p).map(x => SH_PREFIX4[x][0])), { hint: "Think of other words that start the same way.", why: `${p}- means “${mean}”.` }); } },
    { id: "connote", concept: "context", b: [4, 5], make(R, b) { const [q, a, d] = shPick(R, SH_CONNOTE);
        return shMC(R, q, a, d, { hint: "Some words sound more positive than others.", why: `${a} has a positive meaning.` }); } },
    { id: "multi", concept: "context", b: [3, 5], make(R, b) { const [s, w, a, d] = shPick(R, SH_MULTI);
        return shMC(R, `“${s}” In this sentence, what does ${w} mean?`, a, d, { hint: "Some words have more than one meaning. Use the sentence.", why: `In this sentence, ${w} means ${a}.` }); } }
  ]
};
if (typeof module !== "undefined") module.exports = Object.assign(module.exports || {}, { SH_READ_KINDS, SH_DOLCH });
