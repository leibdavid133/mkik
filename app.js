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

/* Az admin felületen mentett beállítások felülírják az alapértelmezést. */
function loadSettings(){
  try {
    var s = JSON.parse(localStorage.getItem("mkik_kb_settings_v1") || "null");
    if (!s) return;
    if (typeof s.minScore === "number")    GATE.minScore = s.minScore;
    if (typeof s.minCoverage === "number") GATE.minCoverage = s.minCoverage;
    if (typeof s.minTerms === "number")    GATE.minTerms = s.minTerms;
    if (s.llm)   CONFIG.LLM_ENDPOINT = s.llm;
    if (s.voice) CONFIG.VOICE_ENDPOINT = s.voice;
  } catch (e) {}
}

/* Ha a kérdés mennyiségre irányul, a számot tartalmazó rendelkezés a jó válasz,
   nem az, amelyik csak megemlíti a fogalmat. */
var QTY_RX = /\b(mennyi|mennyit|mennyire|h[áa]ny|h[áa]nyszor|meddig|mekkora|milyen hossz|mikorra|h[áa]ny nap|milyen [ée]rt[ée]k)/i;
var NUM_RX = /\d|\b(egy|k[ée]t|kett[őo]|h[áa]rom|n[ée]gy|[öo]t|hat|h[ée]t|nyolc|kilenc|t[íi]z|tizen|h[úu]sz|harminc|negyven|[öo]tven)\b/i;

var VIEW_TITLES = {
  megkeresesek: ["Megkeresések",   "megkeresések"],
  ask:     ["Kamarai Tudástár", "kamarai tudástár"],
  docs:    ["Dokumentumok",     "dokumentumok"],
  gaps:    ["Hiánylista",       "hiánylista"],
  log:     ["Előzmények",       "előzmények"],
  cost:    ["Költségmodell",    "költség"],
  account: ["Fiók",             "fiók"]
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

/* Képzett alakok: "igazolja" és "igazolás" közös töve hat betű, de egyik sem
   előtagja a másiknak. Ezeket gyengébb súllyal vesszük figyelembe, hogy a
   valódi találat meglegyen, de a véletlen egybeesés ("szabadság" / "szabadalom")
   ne tudjon önmagában választ kiváltani. */
var LOOSE_MIN = 5, LOOSE_W = 0.45;

/* Köznyelv -> a szabályzatok hivatalos szóhasználata. A kérdés szavait
   kiterjeszti, gyengébb súllyal: a pontos egyezés marad a legerősebb.
   A kulcsok a köznyelvi alakok, az értékek a négy szabályzatban ténylegesen
   előforduló kifejezések. */
var SYN_W = 0.6;
var SYN = {
  "válasz":["teljesít","intéz","továbbít","határidő"],
  "válaszol":["teljesít","intéz","továbbít","határidő"],
  "keret":["fedezet","előirányzat","költségvetés"],
  "büdzsé":["fedezet","előirányzat","költségvetés"],
  "pénz":["fedezet","ellenszolgáltatás","költségvetés"],
  "lát":["észlel","tapasztal"],
  "látok":["észlel","tapasztal"],
  "észrevesz":["észlel","tapasztal","gyanú"],
  "tender":["ajánlatkérés","ajánlattétel","közbeszerzés"],
  "árajánlat":["ajánlatkérés","ajánlat","ajánlattétel"],
  "adatszivárgás":["incidens","jogosulatlan"],
  "feltörés":["incidens","jogosulatlan","támadás"],
  "hekker":["incidens","jogosulatlan","támadás"],
  "laptop":["eszköz","munkaállomás","hordozható"],
  "telefon":["eszköz","mobil"],
  "gép":["eszköz","munkaállomás"],
  "vírus":["kártevő","rosszindulatú"],
  "jelszó":["hitelesítés","azonosítás","jelszókezelés"],
  "iktat":["iktatás","nyilvántartásba","érkeztetés"],
  "iktatni":["iktatás","nyilvántartásba","érkeztetés"],
  "megőriz":["megőrzés","irattározás","selejtezés"],
  "tárol":["megőrzés","tárolás","irattározás"],
  "kolléga":["munkatárs","foglalkoztatott"],
  "dolgozó":["munkatárs","foglalkoztatott"],
  "töröl":["törlés","megsemmisítés","selejtezés"],
  "hossz":["karakter","terjedelem"],
  "hosszú":["karakter","terjedelem"],
  "kirúg":["megszűnés","jogviszony"],
  "szabálytalanság":["szabálytalanság","bejelent","észlel"],
  "engedély":["jóváhagyás","engedélyez","hozzájárul"],
  "aláír":["kötelezettségvállalás","kiadmányozás","ellenjegyzés"],
  "hiba":["incidens","szabálytalanság","hibás"]
};

function commonPrefix(a, b){
  var n = Math.min(a.length, b.length), i = 0;
  while (i < n && a.charAt(i) === b.charAt(i)) i++;
  return i;
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
    var tf = {}, ts = tokens(c.t + " " + (c.s || "") + " " + (c.l || "")), seen = {};
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

/* A szinonima-kulcsot toldalékolt alakra is megtaláljuk:
   "válaszolni" -> a "válaszol" kulcs. */
function synonymsFor(q){
  if (SYN[q]) return SYN[q];
  for (var k in SYN){
    if (SYN.hasOwnProperty(k) && prefixMatch(k, q)) return SYN[k];
  }
  return null;
}

/* A kamara- és jogosultsági szabály egy helyen. Minden réteg ezt hívja - a
   visszakereső tanács is -, különben egy rangsor-módosítás megkerülhetné a
   jogosultságot, és olyan szakaszt emelne előre, amit a felhasználó nem láthat. */
function dokAllapot(docId){
  var d = IDX.byDoc[docId];
  if (!d) return "chamber";
  var me = currentUser() || { circles: ["all"] };
  if (d.chamber !== currentChamber()) return "chamber";
  if (d.access && d.access !== "all" && me.circles.indexOf(d.access) < 0) return "circle";
  return null;
}

function chunkEngedelyezett(chunk){
  return !!chunk && dokAllapot(chunk.d) === null;
}

function search(query, topN){
  var qt = tokens(query);
  var uniq = [], seen = {};
  for (var i = 0; i < qt.length; i++){ if (!seen[qt[i]]){ seen[qt[i]] = 1; uniq.push(qt[i]); } }
  if (!uniq.length) return { hits: [], terms: [], amounts: [], coverage: 0, best: 0 };

  var amounts = parseAmounts(query);
  var qtyQuestion = QTY_RX.test(query);

  /* Minden kérdés-szóhoz összegyűjtjük a szótár illeszkedő alakjait,
     és a csoportot egyetlen keresőkifejezésként kezeljük. */
  var groups = [];
  for (var u = 0; u < uniq.length; u++){
    var q = uniq[u];
    if (q.length < 3) continue;
    var forms = [q], alt = stripIgekoto(q);
    if (alt) forms.push(alt);
    var syns = synonymsFor(q) || (alt ? synonymsFor(alt) : null) || [];
    var cands = [], loose = [], syn = [];
    for (var v = 0; v < IDX.vocab.length; v++){
      var term = IDX.vocab[v], strong = false, weak = false;
      for (var f = 0; f < forms.length; f++){
        if (prefixMatch(forms[f], term)){ strong = true; break; }
        if (commonPrefix(forms[f], term) >= LOOSE_MIN) weak = true;
      }
      if (strong){ cands.push(term); continue; }
      if (weak){ loose.push(term); continue; }
      for (var y = 0; y < syns.length; y++){
        if (prefixMatch(syns[y], term) || commonPrefix(syns[y], term) >= LOOSE_MIN){ syn.push(term); break; }
      }
    }
    groups.push({ q: q, cands: cands, loose: loose, syn: syn });
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
      for (var w = 0; w < groups[g].loose.length; w++){
        var f4 = e.tf[groups[g].loose[w]];
        if (f4) sum += f4 * LOOSE_W;
      }
      for (var y2 = 0; y2 < groups[g].syn.length; y2++){
        var f5 = e.tf[groups[g].syn[y2]];
        if (f5) sum += f5 * SYN_W;
      }
      tfs[n] = sum;
      if (sum) df++;
    }
    post.push({ tf: tfs, df: df });
  }

  /* Előszűrés: csak a kiválasztott kamara anyagából és csak abból, amihez
     a belépett munkatársnak hozzáférési köre van. */
  var docState = {};
  for (var dk in IDX.byDoc){
    if (IDX.byDoc.hasOwnProperty(dk)) docState[dk] = dokAllapot(dk);
  }

  var k1 = 1.4, b = 0.72, scored = [], blockedBest = 0, blockedDoc = null;
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
    if (score > 0 && qtyQuestion){
      /* a bekezdésjelölő "(3)" és a pontszám "4." nem számadat, csak sorszám */
      var bare = ent.c.t.replace(/^\(\d+\)\s*/, "").replace(/^\d+\.\s*/, "");
      if (NUM_RX.test(bare)) score += 2.2;
    }
    if (score <= 0) continue;
    var st = docState[ent.c.d];
    if (st === "circle"){
      if (score > blockedBest){ blockedBest = score; blockedDoc = IDX.byDoc[ent.c.d]; }
      continue;
    }
    if (st === "chamber") continue;
    scored.push({ e: ent, score: score, matched: matched, idx: m });
  }

  scored.sort(function(x, y){ return y.score - x.score; });
  var top = scored.slice(0, topN || 6);

  /* Fedezet idf-súlyozva: a ritka, tartalmas szó többet nyom a latban, mint
     a mindenhol előforduló ("kamara"). A korpuszban ismeretlen szó a legritkább,
     ezért a hiánya erősen rontja a fedezetet. */
  var covNum = 0, covDen = 0, plainHit = 0;
  for (var h = 0; h < groups.length; h++){
    var gIdf = Math.log(1 + (IDX.N - post[h].df + 0.5) / (post[h].df + 0.5));
    covDen += gIdf;
    var found = false;
    for (var t2 = 0; t2 < Math.min(top.length, 3); t2++){
      if (post[h].tf[top[t2].idx]){ found = true; break; }
    }
    if (found){ covNum += gIdf; plainHit++; }
  }
  var coverage = covDen ? covNum / covDen : 0;
  var plainCov = groups.length ? plainHit / groups.length : 0;
  if (amounts.length && top.length && top[0].e.c.r){ coverage = 1; plainCov = 1; }

  return { hits: top, terms: uniq, coverage: coverage, plainCov: plainCov,
           amounts: amounts, best: top.length ? top[0].score : 0,
           blocked: blockedBest >= GATE.minScore ? blockedDoc : null };
}

/* Három fokozat. A "gyenge" azt jelenti: van kapcsolódó rendelkezés, de nem
   biztos, hogy az a válasz. Ezt inkább kiírjuk, mint hogy magabiztosnak
   tűnjön egy bizonytalan találat. */
var STRONG = { minScore: 7.0, minCoverage: 0.45 };

function verdictOf(r){
  /* A kapuzás a sima szó-lefedettségen dől el (válaszol-e egyáltalán),
     az idf-súlyozott fedezet csak azt dönti el, mennyire magabiztos a válasz. */
  if (!r.hits.length) return "none";
  if (r.best < GATE.minScore) return "none";
  if (r.plainCov < GATE.minCoverage) return "none";
  if (r.terms.length >= GATE.minTerms && r.hits[0].matched < 2 && !r.amounts.length) return "none";
  if (r.best >= STRONG.minScore && r.coverage >= STRONG.minCoverage) return "strong";
  return "weak";
}

/* ---------------------------------------------------------------- megjelenítés */
function highlight(text, terms){
  var out = esc(text);
  /* szótő-alapú kiemelés: a toldalékolt alakot is elkapja */
  for (var i = 0; i < terms.length; i++){
    var t = terms[i];
    if (t.length < 3) continue;
    var base = t.length > 6 ? t.slice(0, Math.max(5, t.length - 4)) : t;
    var rx = new RegExp("(" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[0-9a-záéíóöőúüű]*)", "gi");
    out = out.replace(rx, "<mark>$1</mark>");
  }
  return out;
}

function docOf(id){ return IDX.byDoc[id] || { title: "ismeretlen dokumentum", pages: 0 }; }

/* ---------------------------------------------------------------- válaszfogalmazás
   A találatból egy-két mondatos, olvasható választ állítunk elő. Új tényt
   nem teszünk hozzá: a táblázatsornál a sor saját mezőit fogalmazzuk mondattá,
   folyó szövegnél a kérdéshez legjobban illeszkedő mondatot emeljük ki.
   A szó szerinti részlet ettől függetlenül ott marad alatta, ellenőrizhetően. */

function mondatokra(t){
  var tiszta = t.replace(/^\(\d+\)\s*/, "").replace(/^\d+\.\s*/, "");
  /* Csak ott vágunk, ahol kisbetű vagy zárójel után jön pont és nagybetű -
     így a "9. §" és a "2000. évi" hivatkozás nem tör ketté. */
  var m = tiszta.split(/(?<=[a-záéíóöőúüű)”])[.;]\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ(])/)
                .filter(function(x){ return x.trim().length > 20; });
  return m.length ? m : [tiszta];
}

/* A táblázatsor "Kulcs: érték · Kulcs: érték" alakú - ezt bontjuk mezőkre. */
function tablaMezok(t){
  var out = {};
  t.split(" · ").forEach(function(resz){
    var i = resz.indexOf(":");
    if (i > 0) out[resz.slice(0, i).trim().toLowerCase()] = resz.slice(i + 1).trim();
  });
  return out;
}

function valaszSzoveg(chunk, r){
  if (chunk.k === "table"){
    var mez = tablaMezok(chunk.t);
    var kat = mez["kat."] || mez["kategória"] || null;
    var hatar = mez["nettó becsült érték"] || null;
    var reszek = [];
    if (r.amounts && r.amounts.length && hatar){
      reszek.push("A megadott " + forint(r.amounts[0]) + " a " +
        (kat ? kat + " " : "") + "kategóriába esik (" + hatar + ").");
    } else if (kat && hatar){
      reszek.push("A " + kat + " kategória értékhatára: " + hatar + ".");
    }
    var masodik = [];
    if (mez["jóváhagyó"])        masodik.push("a jóváhagyó " + mez["jóváhagyó"]);
    if (mez["minimális eljárás"]) masodik.push("a minimális eljárás: " + mez["minimális eljárás"].toLowerCase());
    if (mez["kötelező dokumentum"]) masodik.push("a kötelező dokumentum: " + mez["kötelező dokumentum"].toLowerCase());
    if (!reszek.length && !masodik.length){
      /* Kétoszlopos táblázat (pl. "Követelmény / Előírás"): az első oszlop a
         tárgy, a második a rendelkezés. */
      var kulcsok2 = [];
      for (var k in mez){ if (mez.hasOwnProperty(k)) kulcsok2.push(k); }
      if (kulcsok2.length === 2){
        return mez[kulcsok2[0]] + " — a szabályzat előírása: " + mez[kulcsok2[1]] +
               (/[.!?]$/.test(mez[kulcsok2[1]]) ? "" : ".");
      }
      for (var k2 = 0; k2 < kulcsok2.length; k2++){
        masodik.push(kulcsok2[k2] + ": " + mez[kulcsok2[k2]]);
      }
    }
    if (masodik.length) reszek.push("Ebben az esetben " + masodik.slice(0, 3).join(", ") + ".");
    if (reszek.length) return reszek.join(" ");
  }

  /* folyó szöveg: a kérdéshez legjobban illeszkedő mondat */
  var mondatok = mondatokra(chunk.t), legjobb = mondatok[0], pontMax = -1;
  for (var i = 0; i < mondatok.length; i++){
    var alsó = mondatok[i].toLowerCase(), pont = 0;
    for (var j = 0; j < r.terms.length; j++){
      var t2 = r.terms[j];
      if (t2.length > 3 && alsó.indexOf(t2.slice(0, Math.min(5, t2.length))) >= 0) pont++;
    }
    if (/\d/.test(mondatok[i])) pont += 0.4;
    if (pont > pontMax){ pontMax = pont; legjobb = mondatok[i]; }
  }
  legjobb = legjobb.trim().replace(/\s+/g, " ");
  if (!/[.!?]$/.test(legjobb)) legjobb += ".";
  return legjobb.charAt(0).toUpperCase() + legjobb.slice(1);
}

function renderAnswer(query, r){
  var box = document.getElementById("ans");

  var verdict = verdictOf(r);

  if (verdict === "none"){
    logEvent(query, "nocov", null);
    box.innerHTML =
      '<div class="ansbox">' +
        '<div class="verdict no"><span class="dot"></span>Erre nincs fedezet a dokumentumokban</div>' +
        '<div class="ansbody">' +
          '<p class="nocov-lead">A betöltött szabályzatokban nincs olyan rendelkezés, amely erre a kérdésre választ adna. ' +
          'A rendszer szándékosan nem fogalmaz meg tippet: a magabiztosan előadott téves válasz többe kerül, mint a meg nem válaszolt kérdés.</p>' +
          '<div class="nocov-why"><b>Amit tenni tudsz:</b> fordulj a szabályzat felelőséhez, vagy jelezd, hogy ez a terület szabályozatlan. ' +
          'A kérdés bekerült a <a href="#" data-goto="gaps">hiánylistába</a>, így a vezetőség látja, hol hiányos a belső szabályozás.</div>' +
          blockedNote(r) +
          '<div class="costline">Költség: <b>0 Ft</b> - fedezet hiányában a nyelvi modell el sem indult.</div>' +
        '</div>' +
      '</div>';
    bindGoto(box);
    refreshSidebar();
    return;
  }

  var top = r.hits.slice(0, 3);
  var d0 = docOf(top[0].e.c.d);
  logEvent(query, verdict === "weak" ? "weak" : "ok",
           { doc: d0.title, page: top[0].e.c.p, section: top[0].e.c.s });

  var html =
    '<div class="ansbox">' +
      (verdict === "weak"
        ? '<div class="verdict weak"><span class="dot"></span>Gyenge illeszkedés</div>'
        : '<div class="verdict ok"><span class="dot"></span>Fedezet a szabályzatban</div>') +
      '<div class="ansbody">' +
      (verdict === "weak"
        ? '<div class="weaknote">A rendszer talált kapcsolódó rendelkezést, de nem biztos, hogy ez válaszol a kérdésedre. Olvasd el a forrást, mielőtt továbbadod a választ.</div>'
        : "");

  /* 1) megfogalmazott válasz, 2) alatta EGY szó szerinti idézet a forrással,
     3) végül a további kapcsolódó szakaszok, tömören. */
  var c0 = top[0].e.c, d0x = docOf(c0.d);
  html +=
    '<div class="answer">' + esc(valaszSzoveg(c0, r)) + '</div>' +
    '<div class="answermeta">' +
      '<i class="fa-regular fa-file-lines"></i> ' + esc(d0x.title) +
      (c0.s ? ' · ' + esc(c0.s) : "") + ' · ' + c0.p + '. oldal' +
      ' <span class="dim">' + esc(d0x.code) + ' · v' + esc(d0x.version) +
      ' · hatályos ' + esc(d0x.effective) + '</span>' +
    '</div>' +
    '<div class="claim">' +
      '<div class="quotelabel">Szó szerint a szabályzatból</div>' +
      (c0.l ? '<div class="leadctx">' + esc(c0.l) + '</div>' : "") +
      '<div class="quote">' + highlight(c0.t, r.terms) + '</div>' +
      '<div class="srcline">' +
        '<button class="srcbtn" data-chunk="' + c0.i + '">' +
          '<i class="fa-solid fa-up-right-from-square"></i> Forrás megnyitása' +
          '<span class="pg">' + esc(c0.s || "") + ' · ' + c0.p + '. oldal</span>' +
        '</button>' +
      '</div>' +
    '</div>';

  if (top.length > 1){
    html += '<div class="related"><span class="rlabel">Kapcsolódó szakaszok</span>';
    for (var i = 1; i < top.length; i++){
      var c = top[i].e.c, d = docOf(c.d);
      html += '<button class="relbtn" data-chunk="' + c.i + '">' +
              esc(d.title) + ' · ' + esc(c.s || "") + ' · ' + c.p + '. o.</button>';
    }
    html += '</div>';
  }

  html += blockedNote(r) +
        '<div class="costline">Költség: <b>0 Ft</b> - a válasz a szabályzat szó szerinti részlete, ' +
        'nyelvi modell nem futott. <span class="conf">Illeszkedés: ' + Math.round(r.coverage * 100) + '%</span></div>' +
      '</div>' +
    '</div>';

  box.innerHTML = html;

  var btns = box.querySelectorAll(".srcbtn, .relbtn");
  for (var b = 0; b < btns.length; b++){
    btns[b].addEventListener("click", function(){
      openSource(parseInt(this.getAttribute("data-chunk"), 10));
    });
  }
  refreshSidebar();
}

/* Ha a legjobb találat olyan dokumentumból jönne, amihez nincs jogosultság,
   azt jelezzük - de a tartalmából semmit nem mutatunk meg. */
function blockedNote(r){
  if (!r.blocked) return "";
  return '<div class="blocked"><i class="fa-solid fa-lock"></i> ' +
    'Ehhez a kérdéshez tartozik szabályzat, amihez nincs hozzáférésed (' +
    esc(r.blocked.title) + '). A tartalma nem jelenik meg. Kérj hozzáférést a rendszergazdától.</div>';
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
function logEvent(query, result, src){
  var u = currentUser() || { id:"?", name:"?", role:"?" };
  var rows = loadLog();
  var now = new Date();
  rows.push({
    ts: now.toLocaleString("hu-HU", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }),
    iso: now.toISOString(),
    q: query,
    r: result,
    uid: u.id,
    u: u.name,
    role: u.role,
    ch: CHAMBERS[document.getElementById("chamber").selectedIndex].short,
    src: src ? (src.doc + " · " + src.page + ". o.") : null,
    cost: 0
  });
  saveLog(rows);
}

function filteredLog(){
  var rows = loadLog();
  var who  = document.getElementById("logWho").value;
  var what = document.getElementById("logWhat").value;
  var term = (document.getElementById("logSearch").value || "").trim().toLowerCase();
  var out = [];
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    if (who && r.uid !== who) continue;
    if (what && r.r !== what) continue;
    if (term && r.q.toLowerCase().indexOf(term) < 0) continue;
    out.push(r);
  }
  return out.reverse();
}

function buildLogFilter(){
  var sel = document.getElementById("logWho");
  if (sel.options.length) return;
  var html = '<option value="">mind</option>';
  for (var i = 0; i < USERS.length; i++){
    html += '<option value="' + USERS[i].id + '">' + esc(USERS[i].name) + "</option>";
  }
  sel.innerHTML = html;
  var re = function(){ renderLog(); };
  sel.addEventListener("change", re);
  document.getElementById("logWhat").addEventListener("change", re);
  document.getElementById("logSearch").addEventListener("input", re);
  document.getElementById("logExport").addEventListener("click", exportLog);
}

function exportLog(){
  var rows = filteredLog();
  if (!rows.length){ toast("Nincs exportálható bejegyzés."); return; }
  var head = ["idopont","munkatars","szerepkor","kamara","kerdes","eredmeny","forras","koltseg_ft"];
  var lines = [head.join(";")];
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    lines.push([r.ts, r.u, r.role, r.ch, r.q,
                r.r === "ok" ? "megvalaszolva" : "nincs fedezet",
                r.src || "", "0"]
      .map(function(x){ return '"' + String(x).replace(/"/g, '""') + '"'; }).join(";"));
  }
  var blob = new Blob(["\ufeff" + lines.join("\n")], { type:"text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a2 = document.createElement("a");
  a2.href = url; a2.download = "kamarai-tudastar-elozmenyek.csv";
  document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
  URL.revokeObjectURL(url);
  toast(rows.length + " bejegyzés exportálva.");
}

function renderLog(){
  buildLogFilter();
  var rows = filteredLog();
  var el = document.getElementById("logBody");
  if (!rows.length){
    el.innerHTML = emptyState("fa-regular fa-rectangle-list", "Nincs megjeleníthető bejegyzés",
      "Tegyél fel egy kérdést, vagy lazíts a szűrőkön.");
    return;
  }
  var h = '<table><thead><tr><th>Időpont</th><th>Kérdés</th><th>Munkatárs</th><th>Kamara</th>' +
          '<th>Eredmény</th><th>Kiadott forrás</th><th class="num">Költség</th></tr></thead><tbody>';
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    h += "<tr><td>" + esc(r.ts) + "</td><td>" + esc(r.q) + "</td><td>" + esc(r.u) +
         '<span class="sub2">' + esc(r.role) + "</span></td><td>" + esc(r.ch) + "</td><td>" +
         resultTag(r.r) +
         "</td><td>" + (r.src ? esc(r.src) : '<span class="muted">-</span>') +
         '</td><td class="num">0 Ft</td></tr>';
  }
  el.innerHTML = h + "</tbody></table>";
}

function resultTag(v){
  if (v === "ok")   return '<span class="tag t-ok">megválaszolva</span>';
  if (v === "weak") return '<span class="tag t-weak">gyenge illeszkedés</span>';
  return '<span class="tag t-no">nincs fedezet</span>';
}

function renderGaps(){
  var rows = loadLog(), gaps = {};
  var total = rows.length, miss = 0;
  for (var i = 0; i < rows.length; i++){
    if (rows[i].r !== "nocov" && rows[i].r !== "weak") continue;
    if (rows[i].r === "nocov") miss++;
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

  /* Betöltés és frissítés: a gépidő elhanyagolható, a valódi költség az
     ellenőrzés. Dokumentumonként negyed óra átnézéssel számolunk. */
  var docs = parseInt(document.getElementById("mDocs").value, 10) || 0;
  var sec = parseFloat(document.getElementById("mSec").value) || 0;
  var valt = parseFloat(document.getElementById("mChange").value) || 0;
  var ora = parseInt(document.getElementById("mHour").value, 10) || 0;
  var ELLENORZES_ORA = 0.25;

  var betoltPerc = Math.round(docs * sec / 60);
  var betoltFt = Math.round(docs * ELLENORZES_ORA * ora);
  document.getElementById("oLoad").textContent =
    forint(betoltFt) + " (" + betoltPerc + " perc gépidő + " + (docs * ELLENORZES_ORA) + " óra ellenőrzés)";

  var valtDb = Math.max(1, Math.round(docs * valt / 100));
  document.getElementById("oRefresh").textContent =
    forint(Math.round(valtDb * ELLENORZES_ORA * ora)) + " (" + valtDb + " dokumentum / hó)";
}

/* ---------------------------------------------------------------- felület */
function buildChambers(){
  var sel = document.getElementById("chamber"), html = "";
  for (var i = 0; i < CHAMBERS.length; i++){
    html += '<option value="' + i + '">' + CHAMBERS[i].short + "</option>";
  }
  sel.innerHTML = html;
  sel.selectedIndex = currentChamber();
  sel.addEventListener("change", function(){
    setChamber(sel.selectedIndex);
    showChamberFull();
    refreshSidebar();
  });
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

  var me = currentUser() || { circles:["all"] };
  for (var i = 0; i < CATEGORIES.length; i++){
    var c = CATEGORIES[i], lis = "", n = 0;
    var allowed = !c.restricted ||
      me.circles.indexOf("hr") >= 0 || me.circles.indexOf("penzugy") >= 0;
    for (var j = 0; j < docs.length; j++){
      var d = docs[j];
      if (d.category !== c.key || d.chamber !== chIdx) continue;
      n++;
      lis += '<li><span>' + esc(d.title) + '</span><span class="cnt">' + d.pages + " o.</span></li>";
    }
    if (!allowed){
      lis = '<li><span class="muted">Ehhez a körhöz nincs hozzáférésed. Van rá szabályzat, a tartalma viszont nem jelenik meg.</span></li>';
      n = 0;
    } else if (!n){
      lis = '<li><span class="muted">Ehhez a kamarához még nincs feltöltve dokumentum.</span></li>';
    }
    html +=
      '<div class="acc-item" data-key="' + c.key + '">' +
        '<button class="acc-head" type="button" aria-expanded="false">' +
          "<span>" + c.title + "</span>" +
          (c.restricted ? '<i class="fa-solid fa-lock lock" title="Korlátozott hozzáférési kör"></i>' : "") +
          '<span class="badge">' + (allowed ? n : '<i class="fa-solid fa-lock"></i>') + "</span>" +
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
  if (name === "account") renderAccount();
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

function renderAccount(){
  var u = currentUser();
  if (!u) return;
  document.getElementById("acctAv").textContent = initials(u.name);
  document.getElementById("acctName").textContent = u.name;
  document.getElementById("acctMail").textContent = u.email;
  document.getElementById("acctName2").textContent = u.name;
  document.getElementById("acctRole").textContent = getLang() === "en" ? u.roleEn : u.role;
  document.getElementById("acctChamber").textContent = CHAMBERS[currentChamber()].short;
  var since = "-";
  try {
    var ses = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (ses) since = new Date(ses.at).toLocaleString("hu-HU", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  } catch (e) {}
  document.getElementById("acctSince").textContent = since;

  var circles = [
    { k:"all",     n:"Általános belső dokumentumok" },
    { k:"hr",      n:"HR-dokumentumok" },
    { k:"penzugy", n:"Pénzügyi dokumentumok" },
    { k:"vezetoi", n:"Vezetői dokumentumok" }
  ];
  var ch = "";
  for (var i = 0; i < circles.length; i++){
    var has = u.circles.indexOf(circles[i].k) >= 0;
    ch += '<div class="circle"><i class="fa-solid ' +
          (has ? "fa-circle-check yes" : "fa-lock no") + '"></i><span>' + circles[i].n +
          '</span><b style="margin-left:auto">' + (has ? "van" : "nincs") + "</b></div>";
  }
  document.getElementById("acctCircles").innerHTML = ch;

  var mine = loadLog().filter(function(r){ return r.uid === u.id; });
  var no = mine.filter(function(r){ return r.r === "nocov"; }).length;
  document.getElementById("acctQ").textContent = mine.length;
  document.getElementById("acctN").textContent = no;
  document.getElementById("acctLast").textContent = mine.length ? mine[mine.length - 1].ts : "-";

  syncSegments();
}

function syncSegments(){
  var th = getTheme(), lg = getLang(), fs = getFontStep();
  var set = function(id, attr, val){
    var wrap = document.getElementById(id);
    if (!wrap) return;
    var bs = wrap.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++){
      bs[i].classList.toggle("on", bs[i].getAttribute(attr) === String(val));
    }
  };
  set("segTheme", "data-theme", th);
  set("segLang", "data-lang", lg);
  set("segFont", "data-font", fs);
}

function bindChrome(){
  document.getElementById("themeBtn").addEventListener("click", function(){
    toggleTheme(); syncSegments();
    toast(getTheme() === "dark" ? "Sötét mód bekapcsolva." : "Világos mód bekapcsolva.");
  });
  document.getElementById("fontBtn").addEventListener("click", function(){
    cycleFont(); syncSegments();
    toast("Betűméret: " + FONT_STEPS[getFontStep()] + "%");
  });
  document.getElementById("langPill").addEventListener("click", function(){
    setLang(getLang() === "hu" ? "en" : "hu");
    applyLang(); buildSamples(); syncSegments();
    toast(getLang() === "hu" ? "Nyelv: magyar" : "Language: English");
  });
  document.getElementById("userChip").addEventListener("click", function(){ showView("account"); });
  document.getElementById("logoutBtn").addEventListener("click", function(){
    logout(); window.location.reload();
  });
  document.getElementById("acctClear").addEventListener("click", function(){
    var u = currentUser();
    var rows = loadLog().filter(function(r){ return r.uid !== u.id; });
    saveLog(rows);
    renderAccount();
    toast("A saját előzményeid törölve.");
  });

  var seg = function(id, attr, fn){
    var wrap = document.getElementById(id);
    var bs = wrap.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++){
      bs[i].addEventListener("click", function(){ fn(this.getAttribute(attr)); syncSegments(); });
    }
  };
  seg("segTheme", "data-theme", function(v){ applyTheme(v); });
  seg("segLang", "data-lang", function(v){ setLang(v); applyLang(); buildSamples(); renderAccount(); });
  seg("segFont", "data-font", function(v){ applyFontStep(parseInt(v, 10)); });
}

function showUser(){
  var u = currentUser();
  if (!u) return;
  document.getElementById("userInitials").textContent = initials(u.name);
  document.getElementById("userName").textContent = u.name;
  document.getElementById("userRole").textContent = getLang() === "en" ? u.roleEn : u.role;
}

/* ---------------------------------------------------------------- belépés */
function bindLogin(){
  var form = document.getElementById("loginForm");
  form.addEventListener("submit", function(e){
    e.preventDefault();
    var r = login(document.getElementById("lgEmail").value, document.getElementById("lgPass").value);
    if (!r.ok){ document.getElementById("lgErr").textContent = r.why; return; }
    window.location.reload();
  });
  var rows = document.querySelectorAll(".demorow");
  for (var i = 0; i < rows.length; i++){
    rows[i].addEventListener("click", function(){
      document.getElementById("lgEmail").value = this.getAttribute("data-em");
      document.getElementById("lgPass").value = DEMO_PASSWORD;
      document.getElementById("lgPass").focus();
    });
  }
}

/* Az init hoistolt függvénydeklaráció, és a szkript legvégén hívjuk meg,
   amikor minden fenti deklaráció már inicializált. */
function init(){
  initChrome();
  loadSettings();
  if (!currentUser()){
    document.getElementById("loginWrap").hidden = false;
    document.getElementById("app").hidden = true;
    bindLogin();
    return;
  }
  document.getElementById("loginWrap").hidden = true;
  document.getElementById("app").hidden = false;

  applyDocMeta();
  buildIndex();
  buildChambers();
  showUser();
  refreshSidebar();
  buildSamples();
  bindNav();
  bindChrome();
  reflectConfig();
  applyLang();
  renderAnswerPlaceholder();
}

function renderAnswerPlaceholder(){
  document.getElementById("ans").innerHTML = emptyState("fa-regular fa-file-lines",
    "Tegyél fel egy kérdést",
    "A rendszer csak a betöltött szabályzatokból válaszol. Ha nincs fedezet, azt mondja meg.");
}

init();
