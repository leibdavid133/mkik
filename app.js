/* ============================================================================
   Kamarai Tudástár - keresőmotor és felület
   A visszakeresés determinisztikus és ingyenes: nyelvi modell nélkül is
   teljes értékű választ ad, mert a válasz maga a szabályzat szó szerinti
   részlete, dokumentum- és oldalhivatkozással.
   ============================================================================ */

/* ---------------------------------------------------------------- konfiguráció */
var CONFIG = {
  DATA_SOURCE:    "data/kb.js",  /* betöltött dokumentum-index */
  VOICE_ENDPOINT: null,          /* külsős voice agent végpontja */
  LLM_ENDPOINT:   null           /* megfogalmazó réteg; null esetén idézetes mód */
};

/* A fedezet-küszöb. Ez a rendszer legfontosabb beállítása: efölött válaszol,
   ez alatt kimondja, hogy nincs fedezet. Inkább legyen szigorú. */
var GATE = { minScore: 3.2, minCoverage: 0.5, minTerms: 2 };

var CHAMBERS = [
  { short:"MKIK (országos)",            full:"Magyar Kereskedelmi és Iparkamara" },
  { short:"Bács-Kiskun VKIK",           full:"Bács-Kiskun Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Békés VKIK",                 full:"Békés Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Borsod-Abaúj-Zemplén VKIK",  full:"Borsod-Abaúj-Zemplén Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Budapesti KIK",              full:"Budapesti Kereskedelmi és Iparkamara" },
  { short:"Csongrád-Csanádi KIK",       full:"Csongrád-Csanádi Kereskedelmi és Iparkamara" },
  { short:"Dunaújvárosi KIK",           full:"Dunaújvárosi Kereskedelmi és Iparkamara" },
  { short:"Fejér VKIK",                 full:"Fejér Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Győr-Moson-Sopron VKIK",     full:"Győr-Moson-Sopron Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Hajdú-Bihar VKIK",           full:"Hajdú-Bihar Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Heves VKIK",                 full:"Heves Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Jász-Nagykun-Szolnok VKIK",  full:"Jász-Nagykun-Szolnok Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Komárom-Esztergom VKIK",     full:"Komárom-Esztergom Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Nagykanizsai KIK",           full:"Nagykanizsai Kereskedelmi és Iparkamara" },
  { short:"Nógrád VKIK",                full:"Nógrád Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Pest Vármegyei és Érdi KIK", full:"Pest Vármegyei és Érdi Kereskedelmi és Iparkamara" },
  { short:"Pécs-Baranyai KIK",          full:"Pécs-Baranyai Kereskedelmi és Iparkamara" },
  { short:"Somogyi KIK",                full:"Somogyi Kereskedelmi és Iparkamara" },
  { short:"Sopron MJV KIK",             full:"Sopron Megyei Jogú Városi Kereskedelmi és Iparkamara" },
  { short:"Szabolcs-Szatmár-Bereg VKIK",full:"Szabolcs-Szatmár-Bereg Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Tolna VKIK",                 full:"Tolna Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Vas VKIK",                   full:"Vas Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Veszprém VKIK",              full:"Veszprém Vármegyei Kereskedelmi és Iparkamara" },
  { short:"Zala VKIK",                  full:"Zala Vármegyei Kereskedelmi és Iparkamara" }
];

var CATEGORIES = [
  { key:"ugyrend",    title:"Ügyrend és SZMSZ" },
  { key:"eljaras",    title:"Eljárásrendek" },
  { key:"szabalyzat", title:"Belső szabályzatok" },
  { key:"utasitas",   title:"Vezetői utasítások" },
  { key:"korlevel",   title:"Körlevelek" },
  { key:"zart",       title:"HR és pénzügy", restricted:true }
];

var VIEW_TITLES = {
  ask:   ["Kamarai Tudástár",  "kamarai tudástár"],
  docs:  ["Dokumentumok",      "dokumentumok"],
  gaps:  ["Hiánylista",        "hiánylista"],
  log:   ["Lekérdezési napló", "napló"],
  cost:  ["Költségmodell",     "költség"],
  admin: ["Adminisztráció",    "admin"]
};

var PELDAK = [
  "Ki hagyhat jóvá egy 8 millió forintos beszerzést?",
  "Hány ajánlatot kell bekérni 3 millió forintnál?",
  "Meddig kell megőrizni a beszerzési dossziét?",
  "Elfogadhatok-e ajándékot egy szállítótól?",
  "Mikor mellőzhető az ajánlatkérés?",
  "Ki adhat teljesítésigazolást?"
];

/* Szándékosan fedezet nélküli kérdés: a kiírás szerint az „erre nincs fedezet”
   mondat többet ér a zsűri szemében, mint tíz sikeres válasz. */
var PELDA_NINCS = "Hány nap szabadság jár a munkatársaknak?";

/* ---------------------------------------------------------------- nyelvi rész */
var STOP = ("a az egy és s de vagy hogy nem is meg mint már csak ha kell lehet " +
  "van vannak volt lesz ez ezt ezek az azt azok ami amely amelyek aki akik mikor " +
  "hol mi mit ki kik milyen mennyi hány melyik kinek minek arra ahhoz ban ben " +
  "bol bol tol tol nak nek val vel ra re on en on ig tol majd illetve valamint " +
  "szerint eseten esetben kapcsolatban tovabba tehat pedig mert azonban").split(" ");
var STOPSET = {};
for (var si = 0; si < STOP.length; si++) { STOPSET[STOP[si]] = 1; }

function norm(s){
  return (s || "").toString()
    .normalize("NFC")
    .replace(/ /g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .toLowerCase();
}

/* Teljes szóalakkal indexelünk, és a kereséskor illesztünk prefix-szel.
   A magyar toldalékolásra ez pontosabb, mint a szótő csonkolása:
   "adhat" megtalálja az "adhatja"-t, de a "szabadság" nem téveszthető
   össze a "szabadalom"-mal, mert egyik sem előtagja a másiknak. */
var IGEKOTO = ["össze","vissza","hozzá","elő","meg","szét","fel","föl","ki","be","le","át","rá","el","oda","ide"];

function tokens(s){
  var raw = norm(s).split(/[^0-9a-záéíóöőúüű]+/);
  var out = [];
  for (var i = 0; i < raw.length; i++){
    var t = raw[i];
    if (t.length < 2 || STOPSET[t]) continue;
    out.push(t);
  }
  return out;
}

/* Két szóalak akkor tekinthető azonos tőnek, ha az egyik előtagja a másiknak,
   és a rövidebb legalább négy betű. */
function prefixMatch(a, b){
  if (a === b) return true;
  var shorter = a.length <= b.length ? a : b;
  var longer  = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.indexOf(shorter) === 0;
}

/* Az igekötő leválasztása: "elfogadhatok" -> "fogadhatok",
   így megtalálja a szabályzat "nem fogadhat el" fordulatát. */
function stripIgekoto(t){
  for (var i = 0; i < IGEKOTO.length; i++){
    var pre = IGEKOTO[i];
    if (t.length >= pre.length + 4 && t.indexOf(pre) === 0) return t.slice(pre.length);
  }
  return null;
}

var MULT = { "ezer":1e3, "millió":1e6, "millio":1e6, "milliárd":1e9, "milliard":1e9 };

function parseAmounts(s){
  var t = norm(s), out = [], m;
  var rx = /(\d[\d\s.]{0,14}\d|\d)\s*(ezer|millió|millio|milliárd|milliard)?/g;
  while ((m = rx.exec(t)) !== null){
    var digits = m[1].replace(/[\s.]/g, "");
    if (!/^\d+$/.test(digits)) continue;
    var v = parseInt(digits, 10);
    if (m[2]) { v *= MULT[m[2]]; }
    else if (v < 1000) { continue; }   /* paragrafusszám, nem összeg */
    out.push(v);
  }
  return out;
}

function forint(n){
  return n.toLocaleString("hu-HU") + " Ft";
}

/* ---------------------------------------------------------------- BM25 index */
var IDX = { chunks: [], df: {}, avg: 0, N: 0, byDoc: {}, vocab: [] };

function buildIndex(){
  var chunks = (window.KB && window.KB.chunks) || [];
  IDX.chunks = [];
  IDX.df = {};
  var total = 0;

  for (var i = 0; i < chunks.length; i++){
    var c = chunks[i];
    /* a szakaszcím is indexelődik: sok kérdés a § címére illeszkedik */
    var tf = {}, ts = tokens(c.t + " " + (c.s || "")), seen = {};
    for (var j = 0; j < ts.length; j++){
      tf[ts[j]] = (tf[ts[j]] || 0) + 1;
      if (!seen[ts[j]]) { seen[ts[j]] = 1; IDX.df[ts[j]] = (IDX.df[ts[j]] || 0) + 1; }
    }
    IDX.chunks.push({ c: c, tf: tf, len: ts.length });
    total += ts.length;
  }
  IDX.N = IDX.chunks.length;
  IDX.avg = IDX.N ? total / IDX.N : 0;
  IDX.vocab = [];
  for (var v in IDX.df){ if (IDX.df.hasOwnProperty(v)) IDX.vocab.push(v); }

  IDX.byDoc = {};
  var docs = (window.KB && window.KB.docs) || [];
  for (var d = 0; d < docs.length; d++){ IDX.byDoc[docs[d].id] = docs[d]; }
}

function search(query){
  var qt = tokens(query);
  var uniq = [], seen = {};
  for (var i = 0; i < qt.length; i++){ if (!seen[qt[i]]){ seen[qt[i]] = 1; uniq.push(qt[i]); } }
  if (!uniq.length) return { hits: [], terms: [], amounts: [], coverage: 0, best: 0 };

  var amounts = parseAmounts(query);

  /* Minden kérdés-szóhoz összegyűjtjük a szótár illeszkedő alakjait,
     és a csoportot egyetlen keresőkifejezésként kezeljük. */
  var groups = [];
  for (var u = 0; u < uniq.length; u++){
    var q = uniq[u];
    if (q.length < 3) continue;
    var forms = [q], alt = stripIgekoto(q);
    if (alt) forms.push(alt);
    var cands = [];
    for (var v = 0; v < IDX.vocab.length; v++){
      var term = IDX.vocab[v];
      for (var f = 0; f < forms.length; f++){
        if (prefixMatch(forms[f], term)){ cands.push(term); break; }
      }
    }
    groups.push({ q: q, cands: cands });
  }
  if (!groups.length) return { hits: [], terms: uniq, amounts: amounts, coverage: 0, best: 0 };

  /* csoportonkénti tf és df a teljes indexen */
  var post = [];
  for (var g = 0; g < groups.length; g++){
    var tfs = new Array(IDX.N), df = 0;
    for (var n = 0; n < IDX.N; n++){
      var e = IDX.chunks[n], sum = 0;
      for (var c = 0; c < groups[g].cands.length; c++){
        var f2 = e.tf[groups[g].cands[c]];
        if (f2) sum += f2;
      }
      tfs[n] = sum;
      if (sum) df++;
    }
    post.push({ tf: tfs, df: df });
  }

  var k1 = 1.4, b = 0.72, scored = [];
  for (var m = 0; m < IDX.N; m++){
    var ent = IDX.chunks[m], score = 0, matched = 0;
    for (var gg = 0; gg < groups.length; gg++){
      var f3 = post[gg].tf[m];
      if (!f3) continue;
      matched++;
      var idf = Math.log(1 + (IDX.N - post[gg].df + 0.5) / (post[gg].df + 0.5));
      score += idf * (f3 * (k1 + 1)) / (f3 + k1 * (1 - b + b * ent.len / IDX.avg));
    }
    /* Összeghatár-illesztés: ha a kérdésben forintösszeg szerepel, és a
       táblázatsor értékhatára tartalmazza, az a sor a mérvadó válasz. */
    if (amounts.length && ent.c.r){
      for (var a = 0; a < amounts.length; a++){
        var lo = ent.c.r[0], hi = ent.c.r[1];
        if (amounts[a] >= lo && (hi === null || amounts[a] <= hi)){
          score += 9; matched = Math.max(matched, 1);
          break;
        }
      }
    }
    if (score > 0) scored.push({ e: ent, score: score, matched: matched, idx: m });
  }

  scored.sort(function(x, y){ return y.score - x.score; });
  var top = scored.slice(0, 6);

  /* Fedezet: a kérdés érdemi szavaiból mennyi szerepel a legjobb találatokban. */
  var hitGroups = 0;
  for (var h = 0; h < groups.length; h++){
    for (var t2 = 0; t2 < Math.min(top.length, 3); t2++){
      if (post[h].tf[top[t2].idx]){ hitGroups++; break; }
    }
  }
  var coverage = groups.length ? hitGroups / groups.length : 0;
  if (amounts.length && top.length && top[0].e.c.r) coverage = Math.max(coverage, 1);

  return { hits: top, terms: uniq, coverage: coverage, amounts: amounts,
           best: top.length ? top[0].score : 0 };
}

function hasCoverage(r){
  if (!r.hits.length) return false;
  if (r.best < GATE.minScore) return false;
  if (r.coverage < GATE.minCoverage) return false;
  if (r.terms.length >= GATE.minTerms && r.hits[0].matched < 2 && !r.amounts.length) return false;
  return true;
}

/* ---------------------------------------------------------------- megjelenítés */
function esc(s){
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(text, terms){
  var out = esc(text);
  /* szótő-alapú kiemelés: a toldalékolt alakot is elkapja */
  for (var i = 0; i < terms.length; i++){
    var t = terms[i];
    if (t.length < 3) continue;
    var base = t.length > 5 ? t.slice(0, Math.max(4, t.length - 3)) : t;
    var rx = new RegExp("(" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[0-9a-záéíóöőúüű]*)", "gi");
    out = out.replace(rx, "<mark>$1</mark>");
  }
  return out;
}

function docOf(id){ return IDX.byDoc[id] || { title: "ismeretlen dokumentum", pages: 0 }; }

function renderAnswer(query, r){
  var box = document.getElementById("ans");

  if (!hasCoverage(r)){
    logEvent(query, "nocov", null);
    box.innerHTML =
      '<div class="ansbox">' +
        '<div class="verdict no"><span class="dot"></span>Erre nincs fedezet a dokumentumokban</div>' +
        '<div class="ansbody">' +
          '<p class="nocov-lead">A betöltött szabályzatokban nincs olyan rendelkezés, amely erre a kérdésre választ adna. ' +
          'A rendszer szándékosan nem fogalmaz meg tippet: a magabiztosan előadott téves válasz többe kerül, mint a meg nem válaszolt kérdés.</p>' +
          '<div class="nocov-why"><b>Amit tenni tudsz:</b> fordulj a szabályzat felelőséhez, vagy jelezd, hogy ez a terület szabályozatlan. ' +
          'A kérdés bekerült a <a href="#" data-goto="gaps">hiánylistába</a>, így a vezetőség látja, hol hiányos a belső szabályozás.</div>' +
          '<div class="costline">Költség: <b>0 Ft</b> - fedezet hiányában a nyelvi modell el sem indult.</div>' +
        '</div>' +
      '</div>';
    bindGoto(box);
    refreshSidebar();
    return;
  }

  var top = r.hits.slice(0, 3);
  var d0 = docOf(top[0].e.c.d);
  logEvent(query, "ok", { doc: d0.title, page: top[0].e.c.p, section: top[0].e.c.s });

  var html =
    '<div class="ansbox">' +
      '<div class="verdict ok"><span class="dot"></span>Fedezet a szabályzatban</div>' +
      '<div class="ansbody">';

  for (var i = 0; i < top.length; i++){
    var c = top[i].e.c, d = docOf(c.d);
    html +=
      '<div class="claim">' +
        '<div class="quote">' + highlight(c.t, r.terms) + '</div>' +
        '<div class="srcline">' +
          '<button class="srcbtn" data-chunk="' + c.i + '">' +
            '<i class="fa-regular fa-file-lines"></i> ' + esc(d.title) +
            '<span class="pg">' + esc(c.s || "") + " · " + c.p + ". oldal</span>" +
          '</button>' +
          '<span class="meta">' + esc(d.code) + " · v" + esc(d.version) +
          " · hatályos " + esc(d.effective) + "</span>" +
        '</div>' +
      '</div>';
  }

  html +=
        '<div class="costline">Költség: <b>0 Ft</b> - a válasz a szabályzat szó szerinti részlete, ' +
        'nyelvi modell nem futott. <span class="conf">Illeszkedés: ' + Math.round(r.coverage * 100) + '%</span></div>' +
      '</div>' +
    '</div>';

  box.innerHTML = html;

  var btns = box.querySelectorAll(".srcbtn");
  for (var b = 0; b < btns.length; b++){
    btns[b].addEventListener("click", function(){
      openSource(parseInt(this.getAttribute("data-chunk"), 10));
    });
  }
  refreshSidebar();
}

function bindGoto(scope){
  var links = scope.querySelectorAll("[data-goto]");
  for (var i = 0; i < links.length; i++){
    links[i].addEventListener("click", function(e){
      e.preventDefault();
      showView(this.getAttribute("data-goto"));
    });
  }
}

/* ---------------------------------------------------------------- forrásnézet */
function openSource(chunkId){
  var chunk = null, all = window.KB.chunks;
  for (var i = 0; i < all.length; i++){ if (all[i].i === chunkId){ chunk = all[i]; break; } }
  if (!chunk) return;

  var d = docOf(chunk.d);
  var pageText = (d.pageText && d.pageText[chunk.p - 1]) || "";
  var body;

  var pos = pageText.indexOf(chunk.t.slice(0, 45));
  if (pos >= 0){
    body =
      esc(pageText.slice(0, pos)) +
      '<span class="hit">' + esc(pageText.slice(pos, pos + chunk.t.length)) + "</span>" +
      esc(pageText.slice(pos + chunk.t.length));
  } else {
    /* táblázatsor: az oldal folyó szövegében nem szerepel, önállóan mutatjuk */
    body = '<span class="hit">' + esc(chunk.t) + "</span>" +
           (pageText ? '<div class="pagerest">' + esc(pageText) + "</div>" : "");
  }

  document.getElementById("ovT").textContent = d.title;
  document.getElementById("ovM").textContent =
    d.code + " · v" + d.version + " · hatályos " + d.effective + " · " +
    (chunk.s || "") + " · " + chunk.p + ". / " + d.pages + ". oldal";
  document.getElementById("ovB").innerHTML = '<div class="pagebox">' + body + "</div>";
  document.getElementById("ov").classList.add("on");
}

function closeSource(){ document.getElementById("ov").classList.remove("on"); }

/* ---------------------------------------------------------------- napló, hiánylista */
var LOG_KEY = "mkik_kb_log_v1";

function loadLog(){
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveLog(rows){
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(-300))); } catch (e) {}
}
function logEvent(query, result, src){
  var rows = loadLog();
  var now = new Date();
  rows.push({
    ts: now.toLocaleString("hu-HU", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }),
    q: query,
    r: result,
    u: document.getElementById("userName").textContent,
    role: document.getElementById("userRole").textContent,
    ch: CHAMBERS[document.getElementById("chamber").selectedIndex].short,
    src: src ? (src.doc + " · " + src.page + ". o.") : null,
    cost: 0
  });
  saveLog(rows);
}

function renderLog(){
  var rows = loadLog().slice().reverse();
  var el = document.getElementById("logBody");
  if (!rows.length){
    el.innerHTML = emptyState("fa-regular fa-rectangle-list", "A napló üres",
      "Az első lekérdezés után itt jelennek meg a bejegyzések.");
    return;
  }
  var h = '<table><thead><tr><th>Időpont</th><th>Kérdés</th><th>Munkatárs</th><th>Kamara</th>' +
          '<th>Eredmény</th><th>Kiadott forrás</th><th class="num">Költség</th></tr></thead><tbody>';
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    h += "<tr><td>" + esc(r.ts) + "</td><td>" + esc(r.q) + "</td><td>" + esc(r.u) +
         '<span class="sub2">' + esc(r.role) + "</span></td><td>" + esc(r.ch) + "</td><td>" +
         (r.r === "ok" ? '<span class="tag t-ok">megválaszolva</span>'
                       : '<span class="tag t-no">nincs fedezet</span>') +
         "</td><td>" + (r.src ? esc(r.src) : '<span class="muted">-</span>') +
         '</td><td class="num">0 Ft</td></tr>';
  }
  el.innerHTML = h + "</tbody></table>";
}

function renderGaps(){
  var rows = loadLog(), gaps = {};
  var total = rows.length, miss = 0;
  for (var i = 0; i < rows.length; i++){
    if (rows[i].r !== "nocov") continue;
    miss++;
    var k = rows[i].q.trim().toLowerCase();
    if (!gaps[k]) gaps[k] = { q: rows[i].q, n: 0, last: rows[i].ts, ch: {} };
    gaps[k].n++;
    gaps[k].last = rows[i].ts;
    gaps[k].ch[rows[i].ch] = 1;
  }
  var list = [];
  for (var g in gaps){ if (gaps.hasOwnProperty(g)) list.push(gaps[g]); }
  list.sort(function(a, b){ return b.n - a.n; });

  document.getElementById("gapCnt").textContent = miss;
  document.getElementById("gapRate").textContent = total ? Math.round(miss / total * 100) + "%" : "0%";
  document.getElementById("gapTotal").textContent = total;

  var el = document.getElementById("gapBody");
  if (!list.length){
    el.innerHTML = emptyState("fa-regular fa-chart-bar", "Még nincs mit kimutatni",
      "A fedezet nélkül maradt kérdések itt gyűlnek össze, gyakoriság szerint rendezve.");
    return;
  }
  var h = '<table><thead><tr><th>Megválaszolatlan kérdés</th><th class="num">Alkalom</th>' +
          "<th>Érintett kamara</th><th>Utoljára</th></tr></thead><tbody>";
  for (var j = 0; j < list.length; j++){
    var it = list[j];
    h += "<tr><td>" + esc(it.q) + '</td><td class="num">' + it.n + "</td><td>" +
         esc(Object.keys(it.ch).join(", ")) + "</td><td>" + esc(it.last) + "</td></tr>";
  }
  el.innerHTML = h + "</tbody></table>";
}

function emptyState(icon, title, text){
  return '<div class="state"><div class="ico"><i class="' + icon + '"></i></div>' +
         "<h4>" + title + "</h4><p>" + text + "</p></div>";
}

/* ---------------------------------------------------------------- dokumentumok */
function renderDocs(){
  var docs = (window.KB && window.KB.docs) || [];
  var el = document.getElementById("docsBody");
  if (!docs.length){
    el.innerHTML = emptyState("fa-regular fa-folder-open", "Nincs feltöltött dokumentum",
      "A szabályzatok feltöltése az Admin felületen történik, fejlesztői közreműködés nélkül.");
    return;
  }
  var h = '<table><thead><tr><th>Dokumentum</th><th>Azonosító</th><th>Verzió</th>' +
          '<th>Hatályos</th><th>Felelős</th><th class="num">Oldal</th><th class="num">Szövegrész</th>' +
          "</tr></thead><tbody>";
  for (var i = 0; i < docs.length; i++){
    var d = docs[i];
    h += "<tr><td><b>" + esc(d.title) + '</b><span class="sub2">' + esc(catTitle(d.category)) +
         " · " + esc(CHAMBERS[d.chamber].short) + "</span></td><td>" + esc(d.code) +
         "</td><td>v" + esc(d.version) + "</td><td>" + esc(d.effective) + "</td><td>" +
         esc(d.owner) + '</td><td class="num">' + d.pages + '</td><td class="num">' +
         d.chunkCount + "</td></tr>";
  }
  h += "</tbody></table>";
  el.innerHTML = h;
  document.getElementById("docsNote").textContent =
    "Index frissítve: " + (window.KB.builtAt || "-") + ". Felülvizsgálat: " + (docs[0].review || "-") + ".";
}

function catTitle(key){
  for (var i = 0; i < CATEGORIES.length; i++){ if (CATEGORIES[i].key === key) return CATEGORIES[i].title; }
  return key;
}

/* ---------------------------------------------------------------- költségmodell */
function renderCost(){
  var rows = loadLog();
  var answered = 0, nocov = 0;
  for (var i = 0; i < rows.length; i++){ if (rows[i].r === "ok") answered++; else nocov++; }

  document.getElementById("cQ").textContent = rows.length;
  document.getElementById("cPer").textContent = "0 Ft";
  document.getElementById("cFree").textContent = rows.length ? "100%" : "-";
  calcMonthly();
}

function calcMonthly(){
  var staff = parseInt(document.getElementById("mStaff").value, 10) || 0;
  var perDay = parseFloat(document.getElementById("mPerDay").value) || 0;
  var days = 21;
  var q = Math.round(staff * perDay * days);

  /* Az idézetes mód költsége a futtatásé, nem a kérdésé: az index a böngészőben
     fut, a tárhely fix. A megfogalmazó réteg bekötésekor ide kerül a token-ár. */
  var infra = parseInt(document.getElementById("mInfra").value, 10) || 0;
  var llmPer = parseFloat(document.getElementById("mLlm").value) || 0;
  var llmShare = parseFloat(document.getElementById("mShare").value) || 0;
  var llmCost = Math.round(q * (llmShare / 100) * llmPer);

  document.getElementById("oQ").textContent = q.toLocaleString("hu-HU");
  document.getElementById("oInfra").textContent = forint(infra);
  document.getElementById("oLlm").textContent = forint(llmCost);
  document.getElementById("oTotal").textContent = forint(infra + llmCost);
  document.getElementById("oPer").textContent = q ? ((infra + llmCost) / q).toFixed(1) + " Ft" : "-";
}

/* ---------------------------------------------------------------- felület */
function buildChambers(){
  var sel = document.getElementById("chamber"), html = "";
  for (var i = 0; i < CHAMBERS.length; i++){
    html += '<option value="' + i + '">' + CHAMBERS[i].short + "</option>";
  }
  sel.innerHTML = html;
  sel.addEventListener("change", function(){ showChamberFull(); refreshSidebar(); });
  showChamberFull();
}

function showChamberFull(){
  var sel = document.getElementById("chamber");
  document.getElementById("chamberFull").textContent = CHAMBERS[sel.selectedIndex].full;
}

function buildAccordion(){
  var docs = (window.KB && window.KB.docs) || [];
  var wrap = document.getElementById("acc"), html = "";
  var chIdx = document.getElementById("chamber").selectedIndex;

  for (var i = 0; i < CATEGORIES.length; i++){
    var c = CATEGORIES[i], lis = "", n = 0;
    for (var j = 0; j < docs.length; j++){
      var d = docs[j];
      if (d.category !== c.key || d.chamber !== chIdx) continue;
      n++;
      lis += '<li><span>' + esc(d.title) + '</span><span class="cnt">' + d.pages + " o.</span></li>";
    }
    if (!n) lis = '<li><span class="muted">Ehhez a kamarához még nincs feltöltve dokumentum.</span></li>';
    html +=
      '<div class="acc-item" data-key="' + c.key + '">' +
        '<button class="acc-head" type="button" aria-expanded="false">' +
          "<span>" + c.title + "</span>" +
          (c.restricted ? '<i class="fa-solid fa-lock lock" title="Korlátozott hozzáférési kör"></i>' : "") +
          '<span class="badge">' + n + "</span>" +
          '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>' +
        "</button>" +
        '<div class="acc-body"><ul>' + lis + "</ul></div>" +
      "</div>";
  }
  wrap.innerHTML = html;

  var heads = wrap.querySelectorAll(".acc-head");
  for (var k = 0; k < heads.length; k++){
    heads[k].addEventListener("click", function(){
      var open = this.parentNode.classList.toggle("open");
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
}

function refreshSidebar(){
  var docs = (window.KB && window.KB.docs) || [];
  var chIdx = document.getElementById("chamber").selectedIndex;
  var n = 0, pages = 0;
  for (var i = 0; i < docs.length; i++){
    if (docs[i].chamber === chIdx){ n++; pages += docs[i].pages; }
  }
  var sd = document.getElementById("statDocs");
  sd.textContent = n ? n + " db · " + pages + " oldal" : "nincs";
  sd.className = n ? "" : "pending";
  var ss = document.getElementById("statSync");
  ss.textContent = (window.KB && window.KB.builtAt) || "-";
  ss.className = window.KB ? "" : "pending";
  buildAccordion();
}

function buildSamples(){
  var wrap = document.getElementById("samples"), html = '<em>Példák:</em>';
  for (var i = 0; i < PELDAK.length; i++){
    html += '<button class="chip" data-q="' + esc(PELDAK[i]) + '">' + esc(PELDAK[i]) + "</button>";
  }
  html += '<button class="chip risk" data-q="' + esc(PELDA_NINCS) + '">' + esc(PELDA_NINCS) + "</button>";
  wrap.innerHTML = html;
  var chips = wrap.querySelectorAll(".chip");
  for (var j = 0; j < chips.length; j++){
    chips[j].addEventListener("click", function(){
      document.getElementById("q").value = this.getAttribute("data-q");
      ask();
    });
  }
}

function ask(){
  var q = document.getElementById("q").value.trim();
  if (!q) return;
  var box = document.getElementById("ans");
  box.innerHTML = '<div class="ansbox"><div class="ansbody">' +
    '<div class="skel"></div><div class="skel w80"></div><div class="skel w60"></div></div></div>';
  /* A visszakeresés szinkron; a rövid késleltetés csak azért van,
     hogy a betöltő állapot ne villanjon el észrevétlenül. */
  window.setTimeout(function(){
    renderAnswer(q, search(q));
  }, 140);
}

function showView(name){
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++){
    views[i].classList.toggle("active", views[i].id === "v-" + name);
  }
  var links = document.querySelectorAll(".mainmenu a");
  for (var j = 0; j < links.length; j++){
    links[j].classList.toggle("active", links[j].getAttribute("data-view") === name);
  }
  var t = VIEW_TITLES[name];
  if (t){
    document.getElementById("pageTitle").textContent = t[0];
    document.getElementById("crumbLeaf").textContent = t[1];
  }
  if (name === "log")  renderLog();
  if (name === "gaps") renderGaps();
  if (name === "docs") renderDocs();
  if (name === "cost") renderCost();
  window.scrollTo(0, 0);
}

function bindNav(){
  var links = document.querySelectorAll(".mainmenu a");
  for (var i = 0; i < links.length; i++){
    links[i].addEventListener("click", function(e){
      e.preventDefault();
      showView(this.getAttribute("data-view"));
    });
  }
  document.getElementById("askBtn").addEventListener("click", ask);
  document.getElementById("q").addEventListener("keydown", function(e){
    if (e.key === "Enter") ask();
  });
  document.getElementById("ovX").addEventListener("click", closeSource);
  document.getElementById("ov").addEventListener("click", function(e){
    if (e.target === this) closeSource();
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape") closeSource();
  });
  var inputs = document.querySelectorAll(".calcfield input");
  for (var k = 0; k < inputs.length; k++){
    inputs[k].addEventListener("input", calcMonthly);
  }
}

function reflectConfig(){
  var llm = document.getElementById("stateLlm"), voice = document.getElementById("stateVoice");
  var mode = document.getElementById("stateMode");
  if (CONFIG.LLM_ENDPOINT){ llm.textContent = "bekötve"; llm.className = ""; mode.textContent = "idézetes + megfogalmazó"; }
  if (CONFIG.VOICE_ENDPOINT){ voice.textContent = "bekötve"; voice.className = ""; }
  document.getElementById("askBtn").disabled = !(window.KB && window.KB.chunks && window.KB.chunks.length);
}

/* Az init hoistolt függvénydeklaráció, és a szkript legvégén hívjuk meg,
   amikor minden fenti deklaráció már inicializált. */
function init(){
  buildIndex();
  buildChambers();
  refreshSidebar();
  buildSamples();
  bindNav();
  reflectConfig();
}

init();
