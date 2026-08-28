/* ============================================================================
   Kamarai Tudástár - visszakereső tanács

   A kérdést öt független szemszög vizsgálja meg, és a szemszögek egyetértése
   dönti el, mennyire bízhatunk a válaszban. Nem nyelvi modellek szavaznak:
   öt különböző visszakeresési jel, ezért determinisztikus, ingyenes és
   megismételhető - és minden szavazat visszavezethető a forrásra.

   Miért így: a hibák mérése szerint a rendszer nem a §-ok között téved, hanem
   a DOKUMENTUMOT választja rosszul. Ezért a tanács kétlépcsős:
     1. melyik szabályzat tárgya egyáltalán a kérdés
     2. azon belül melyik szakasz
   Mért alap (18 fedezett kérdés): 13 válasz, ebből 3 magabiztos tévedés.

   Fontos szabály: minden szemszög TARTÓZKODHAT. Amelyik nem ér el minimális
   jelerősséget, nem szavaz - mert a "legkevésbé rossz tipp" zajt visz a
   szavazásba. Ezt méréssel tanultuk: a szakaszcím-szemszög találat híján
   mindig az "1. § A szabályzat célja" szakaszt tolta előre.
   ============================================================================ */

var COUNCIL = {
  on:     true,    /* a sáv megjelenítése */
  decide: true,    /* beleszóljon-e a döntésbe; mérés nélkül állítsd false-ra */
  swapMin:    3,   /* dokumentumcseréhez ennyi szemszög egyetértése kell */
  weakMax:    2,   /* ennyi vagy kevesebb egyetértésnél leminősítünk */
  swapMargin: 1.25,/* a cseréhez ennyiszeres fúziós pontfölény is kell */
  upgradeMin: 4    /* "nincs fedezet" felminősítéséhez ennyi kell */
};

/* ---------------------------------------------------------------- előkészítés */

var CIDX = { docs: null, secs: null, built: false };

/* Dokumentum-profil: cím + minden szakaszcím + a célja/hatálya/értelmező
   szakaszok szövege. Ez írja le, hogy MIRŐL szól egyáltalán a szabályzat. */
function councilBuild(){
  if (CIDX.built || !window.KB || !window.KB.chunks) return;

  var prof = {}, secs = {};
  var docs = window.KB.docs || [];
  for (var i = 0; i < docs.length; i++) prof[docs[i].id] = [docs[i].title, docs[i].title];

  var chunks = window.KB.chunks;
  for (var c = 0; c < chunks.length; c++){
    var ch = chunks[c];
    if (!prof[ch.d]) prof[ch.d] = [];
    prof[ch.d].push(ch.s);
    if (/§\s*(A szabályzat célja|A szabályzat hatálya|Értelmező)/i.test(ch.s || "")) prof[ch.d].push(ch.t);

    var key = ch.d + "|" + ch.s;
    if (!secs[key]) secs[key] = { d: ch.d, s: ch.s, tok: tokens(ch.s || ""), chunks: [] };
    secs[key].chunks.push(ch);
  }

  /* dokumentum-szótárak és df */
  var dtf = {}, ddf = {}, ids = [];
  for (var id in prof){
    if (!prof.hasOwnProperty(id)) continue;
    ids.push(id);
    var ts = tokens(prof[id].join(" ")), tf = {};
    for (var t = 0; t < ts.length; t++) tf[ts[t]] = (tf[ts[t]] || 0) + 1;
    dtf[id] = { tf: tf, terms: Object.keys(tf) };
    for (var k in tf){ if (tf.hasOwnProperty(k)) ddf[k] = (ddf[k] || 0) + 1; }
  }

  /* szakaszcím-szótár df */
  var skeys = [], sdf = {};
  for (var sk in secs){
    if (!secs.hasOwnProperty(sk)) continue;
    skeys.push(sk);
    var seen = {};
    for (var q = 0; q < secs[sk].tok.length; q++){
      var w = secs[sk].tok[q];
      if (!seen[w]){ seen[w] = 1; sdf[w] = (sdf[w] || 0) + 1; }
    }
  }

  CIDX = { docs: { tf: dtf, df: ddf, ids: ids }, secs: { map: secs, keys: skeys, df: sdf }, built: true };
}

/* Prefix-tűrő egyezés: a magyar toldalékolás miatt a kérdés szava és a
   dokumentum szava ritkán azonos alak ("levelet" ~ "levél", "iktat" ~ "iktatás").

   Szándékosan CSAK teljes prefix-egyezést fogadunk el, közös-előtag alapú
   közelítést nem. Mérve: a lazább szabály a "levelet" szót a "levelezés"-hez
   kötötte, és emiatt a beérkező küldemények bontásáról szóló kérdést az IT
   Biztonsági Szabályzathoz irányította. Egy útvonalválasztó szemszögnél a
   téves egyezés drágább, mint a kihagyott. */
function cMatch(qt, term){
  return prefixMatch(qt, term) || prefixMatch(term, qt);
}

function cTerms(query){
  var raw = tokens(query), out = [], seen = {};
  for (var i = 0; i < raw.length; i++){
    var t = raw[i];
    if (t.length < 3 || seen[t]) continue;
    seen[t] = 1; out.push(t);
    var alt = stripIgekoto(t);
    if (alt && alt.length >= 3 && !seen[alt]){ seen[alt] = 1; out.push(alt); }
  }
  return out;
}

/* ---------------------------------------------------------------- szemszögek

   Mindegyik ugyanazt adja vissza: dokumentum-rangsort, vagy null, ha
   tartózkodik. A rangsor elemei: { d: dokumentumId, s: pontszám }. */

/* 1. Szó szerinti - a meglévő BM25 találatokból összegzett dokumentum-pontszám */
function vLiteral(query, r){
  if (!r || !r.hits || !r.hits.length) return null;
  var by = {};
  for (var i = 0; i < r.hits.length; i++){
    var h = r.hits[i];
    by[h.e.c.d] = (by[h.e.c.d] || 0) + h.score / (1 + i * 0.5);
  }
  return rank(by);
}

/* 2. Fogalmi - csak a szinonima-láncon elért egyezés számít.
   Tartózkodik, ha a kérdés egyetlen szavához sincs szinonimánk. */
function vConcept(query){
  var qt = cTerms(query), syns = [];
  for (var i = 0; i < qt.length; i++){
    var s = synonymsFor(qt[i]);
    if (s) syns = syns.concat(s);
  }
  if (!syns.length) return null;

  var by = {}, chunks = window.KB.chunks, hit = 0;
  for (var c = 0; c < chunks.length; c++){
    var ch = chunks[c], score = 0;
    var ts = IDX.chunks[c] && IDX.chunks[c].tf;
    if (!ts) continue;
    for (var y = 0; y < syns.length; y++){
      for (var term in ts){
        if (ts.hasOwnProperty(term) && cMatch(syns[y], term)){ score += ts[term]; break; }
      }
    }
    if (score){ by[ch.d] = (by[ch.d] || 0) + score; hit++; }
  }
  return hit ? rank(by) : null;
}

/* 3. Dokumentum-tárgy - miről szól egyáltalán ez a szabályzat.
   A mérés szerint ez a legértékesebb szemszög: 7/10 a BM25 5/10-e mellett,
   és MÁS kérdéseken hibázik, mint a BM25. */
function vSubject(query){
  var qt = cTerms(query), D = CIDX.docs, by = {}, any = 0;
  var N = D.ids.length;

  for (var i = 0; i < N; i++){
    var id = D.ids[i], tf = D.tf[id].tf, terms = D.tf[id].terms, s = 0;
    for (var q = 0; q < qt.length; q++){
      var f = 0;
      for (var t = 0; t < terms.length; t++){
        if (cMatch(qt[q], terms[t])) f += tf[terms[t]];
      }
      if (f){
        var idf = Math.log(1 + (N - (D.df[qt[q]] || 0) + 0.5) / ((D.df[qt[q]] || 0) + 0.5));
        s += (0.4 + idf) * Math.log(1 + f);
        any++;
      }
    }
    by[id] = s;
  }
  return any ? rank(by) : null;
}

/* 4. Szakaszcím - illeszkedik-e a kérdés egy § címére.
   Szigorú küszöb: legalább két érdemi szó egyezzen, vagy egy ritka szó.
   Enélkül zajt adna, ezt méréssel láttuk. */
function vSection(query){
  var qt = cTerms(query), S = CIDX.secs, best = null, by = {}, any = 0;

  for (var i = 0; i < S.keys.length; i++){
    var key = S.keys[i], sec = S.secs ? null : S.map[key], s = 0, hits = 0, rare = 0;
    sec = S.map[key];
    for (var q = 0; q < qt.length; q++){
      var f = 0;
      for (var t = 0; t < sec.tok.length; t++){ if (cMatch(qt[q], sec.tok[t])) f++; }
      if (f){
        var df = S.df[qt[q]] || 1;
        var idf = Math.log(1 + (S.keys.length - df + 0.5) / (df + 0.5));
        s += idf * f; hits++;
        if (df <= 3) rare++;
      }
    }
    /* tartózkodási küszöb szakaszonként */
    if (hits < 2 && !rare) continue;
    any++;
    by[sec.d] = Math.max(by[sec.d] || 0, s);
    if (!best || s > best.s) best = { key: key, s: s, sec: sec };
  }
  if (!any) return null;
  var out = rank(by);
  out.best = best;
  return out;
}

/* 5. Válaszforma - a kérdés típusa és a szakasz tartalma egyezik-e.
   "ki" -> szerepkör, "mennyi/hány" -> szám, "meddig/mikor" -> határidő,
   "lehet-e/kell-e" -> kötelező vagy tiltó megfogalmazás. */
var ROLE_RX = /\b(elnök|főtitkár|titkár|vezető|igazgató|bizottság|tisztviselő|ügyintéző|munkatárs|felelős|kezelő|gazdasági|jegyző|referens|rendszergazda|adatgazda)/i;
var TIME_RX = /\b(\d+\s*(munkanap|nap|óra|hét|hónap|év)|haladéktalanul|azonnal|határidő|napon belül|munkanapon belül)/i;
var MUST_RX = /\b(köteles|kötelező|tilos|nem lehet|nem engedélyezett|engedélyezett|jogosult|felel|kell)\b/i;
var WHO_RX  = /\b(ki|kik|kinek|kihez|melyik szervezeti|felelős|jogosult)\b/i;
var WHEN_RX = /\b(mikor|meddig|mennyi ideig|milyen határidő|hány nap|mikorra)\b/i;
var CAN_RX  = /\b(lehet-e|szabad-e|kell-e|köteles-e|használhat|igényelhet|megteheti)/i;

function vShape(query, pool){
  var q = norm(query), want = null;
  if (WHEN_RX.test(q))      want = TIME_RX;
  else if (QTY_RX.test(q))  want = /\d/;
  else if (WHO_RX.test(q))  want = ROLE_RX;
  else if (CAN_RX.test(q))  want = MUST_RX;
  if (!want) return null;

  var by = {}, any = 0;
  for (var i = 0; i < pool.length; i++){
    var ch = pool[i];
    if (want.test(ch.t)){ by[ch.d] = (by[ch.d] || 0) + 1; any++; }
  }
  return any ? rank(by) : null;
}

function rank(by){
  var out = [];
  for (var k in by){ if (by.hasOwnProperty(k) && by[k] > 0) out.push({ d: k, s: by[k] }); }
  out.sort(function(a, b){ return b.s - a.s; });
  return out;
}

/* ---------------------------------------------------------------- a tanács */

var VOTERS = [
  { key: "literal", nev: "Szó szerinti",     leiras: "a szabályzat szövegében szereplő szavak", w: 1.0 },
  { key: "subject", nev: "Dokumentum-tárgy", leiras: "melyik szabályzat tárgya a kérdés",       w: 0.9 },
  { key: "section", nev: "Szakaszcím",       leiras: "illeszkedik-e egy § címére",              w: 0.8 },
  { key: "concept", nev: "Fogalmi",          leiras: "rokon értelmű megfogalmazás",             w: 0.6 },
  { key: "shape",   nev: "Válaszforma",      leiras: "olyan típusú választ tartalmaz-e",        w: 0.5 }
];

function council(query, r){
  councilBuild();

  /* jelöltkészlet: a BM25 találatai */
  var pool = [];
  for (var i = 0; i < (r.hits || []).length; i++) pool.push(r.hits[i].e.c);

  var v = {
    literal: vLiteral(query, r),
    subject: vSubject(query),
    section: vSection(query),
    concept: vConcept(query),
    shape:   null
  };

  /* a szakaszcím-szemszög által javasolt szakasz chunkjai bekerülnek a mezőnybe:
     így a helyes válasz akkor is versenybe száll, ha a BM25 rá sem nézett */
  if (v.section && v.section.best){
    var extra = v.section.best.sec.chunks;
    for (var e = 0; e < extra.length && e < 6; e++){
      var dup = false;
      for (var p = 0; p < pool.length; p++){ if (pool[p].i === extra[e].i){ dup = true; break; } }
      if (!dup) pool.push(extra[e]);
    }
  }
  v.shape = vShape(query, pool);

  /* dokumentum-fúzió: súlyozott rangsor-pontok, csak a nem tartózkodóktól */
  var fused = {}, voted = 0;
  for (var s = 0; s < VOTERS.length; s++){
    var list = v[VOTERS[s].key];
    if (!list || !list.length) continue;
    voted++;
    for (var j = 0; j < list.length && j < 4; j++){
      fused[list[j].d] = (fused[list[j].d] || 0) + VOTERS[s].w / (1 + j);
    }
  }
  var order = rank(fused);
  var winner = order.length ? order[0].d : null;

  /* egyetértés: hány nem tartózkodó szemszög tette a nyertest a saját top-2-jébe */
  var agree = 0, detail = [];
  for (var s2 = 0; s2 < VOTERS.length; s2++){
    var vo = VOTERS[s2], list2 = v[vo.key];
    if (!list2 || !list2.length){
      detail.push({ nev: vo.nev, leiras: vo.leiras, tartozkodik: true });
      continue;
    }
    var top2 = list2.slice(0, 2).map(function(x){ return x.d; });
    var ok = winner && top2.indexOf(winner) >= 0;
    if (ok) agree++;
    detail.push({ nev: vo.nev, leiras: vo.leiras, tartozkodik: false, egyetert: ok,
                  valasztas: list2[0].d });
  }

  return { winner: winner, agree: agree, voted: voted, detail: detail,
           order: order, pool: pool, section: v.section && v.section.best };
}

/* Mennyivel veri a tanács nyertese az eredeti dokumentumot a fúziós pontszámban.
   Egyetértés önmagában kevés: ha a mezőny szoros, nem cserélünk. */
function councilMargin(c, baseDoc){
  var win = 0, base = 0;
  for (var i = 0; i < c.order.length; i++){
    if (c.order[i].d === c.winner)  win  = c.order[i].s;
    if (c.order[i].d === baseDoc)   base = c.order[i].s;
  }
  return base > 0 ? win / base : (win > 0 ? 99 : 0);
}

/* A nyertes dokumentumon belüli legjobb szakasz a jelöltkészletből. */
function councilPick(c, r){
  if (!c.winner) return null;
  for (var i = 0; i < (r.hits || []).length; i++){
    if (r.hits[i].e.c.d === c.winner) return r.hits[i].e.c;
  }
  if (c.section && c.section.sec.d === c.winner) return c.section.sec.chunks[0];
  for (var p = 0; p < c.pool.length; p++){ if (c.pool[p].d === c.winner) return c.pool[p]; }
  return null;
}

/* ---------------------------------------------------------------- kapu-korrekció

   A tanács nem veszi át a döntést, csak korrigál - és csak akkor, ha a
   szemszögek határozottan egyetértenek. Amit a meglévő motor jól csinál,
   azt így nem tudja elrontani. */
function councilAdjust(query, r, c){
  var base = verdictOf(r);
  var baseChunk = r.hits && r.hits.length ? r.hits[0].e.c : null;
  var out = { verdict: base, chunk: baseChunk, swapped: false, note: null, agree: c.agree };

  if (!COUNCIL.decide || !c.winner) return out;

  var baseDoc = baseChunk ? baseChunk.d : null;

  /* 1. Dokumentumcsere: a tanács más szabályzatra mutat, és egyetért benne.
        Ez öli meg a magabiztos tévedést. */
  if (base !== "none" && baseDoc && c.winner !== baseDoc && c.agree >= COUNCIL.swapMin &&
      councilMargin(c, baseDoc) >= COUNCIL.swapMargin){
    var pick = councilPick(c, r);
    if (pick){
      out.chunk = pick;
      out.swapped = true;
      out.note = "A tanács másik szabályzatra mutatott, mint a szó szerinti egyezés.";
      return out;
    }
  }

  /* 2. Leminősítés: magabiztos válasz gyenge egyetértéssel nem maradhat magabiztos. */
  if (base === "strong" && c.agree <= COUNCIL.weakMax){
    out.verdict = "weak";
    out.note = "Egyetlen szemszög támogatja csak ezt a találatot.";
    return out;
  }

  /* 3. Felminősítés: a kapu nemet mondott, de a szemszögek egyetértenek. */
  /* A felminősítés a veszélyes irány: itt gyárthatnánk hamis igent, márpedig a
     ki nem mondott válasz olcsóbb, mint a téves. Ezért nem elég az egyetértés:
     kell egy KONKRÉT szakaszcím-illeszkedés is. A szakaszcím-szemszög szigorú
     tartózkodási küszöbe miatt ez csak akkor teljesül, ha a kérdés tényleg egy
     § tárgyára mutat. Mérve: enélkül a "mennyi a cafeteria keret" kérdésre
     hamisan igent mondott a rendszer. */
  if (base === "none" && c.agree >= COUNCIL.upgradeMin && c.section){
    var pick2 = councilPick(c, r);
    if (pick2){
      out.verdict = "weak";
      out.chunk = pick2;
      out.note = "A szó szerinti egyezés kevés volt, de a szemszögek egyetértenek.";
    }
  }
  return out;
}

/* ---------------------------------------------------------------- bekötés

   Nem a megjelenítést írjuk át, hanem a keresés eredményét igazítjuk ki:
   ha a tanács más szakaszt hoz, azt előrevesszük a találati listában, és a
   verdiktet is a tanács korrigálja. Így az eredeti renderAnswer változatlanul
   a helyes választ rajzolja ki, az app.js-hez nem kell hozzányúlni. */

var _c_search = search;
search = function(query){
  var r = _c_search(query);
  if (!COUNCIL.on || !r) return r;

  try {
    var c = council(query, r);
    var adj = councilAdjust(query, r, c);
    r._council = c;
    r._adj = adj;

    if (adj.chunk){
      var first = r.hits.length ? r.hits[0].e.c : null;
      if (!first || first.i !== adj.chunk.i){
        var moved = null;
        for (var i = 0; i < r.hits.length; i++){
          if (r.hits[i].e.c.i === adj.chunk.i){ moved = r.hits.splice(i, 1)[0]; break; }
        }
        if (!moved) moved = { e: { c: adj.chunk }, score: r.best, matched: 2 };
        r.hits.unshift(moved);
      }
    }
  } catch (e){ /* a tanács sosem törheti el a keresést */ }
  return r;
};

var _c_verdictOf = verdictOf;
verdictOf = function(r){
  if (r && r._adj && COUNCIL.on && COUNCIL.decide) return r._adj.verdict;
  return _c_verdictOf(r);
};

/* ---------------------------------------------------------------- a sáv */

function councilStrip(r){
  var c = r && r._council;
  if (!c || !COUNCIL.on) return "";

  var adj = r._adj || {};
  var fej;
  if (!c.voted) fej = "Egyetlen szemszög sem talált fogódzót.";
  else if (c.agree >= 4) fej = "Öt szemszögből " + c.agree + " ugyanarra a szabályzatra mutat.";
  else if (c.agree === 3) fej = "Három szemszög egyetért, kettő nem.";
  else fej = "A szemszögek megoszlanak: mindössze " + c.agree + " mutat ugyanarra.";

  var h = '<div class="council">' +
    '<div class="cheader">' +
      '<span class="cbadge ' + (c.agree >= 4 ? "hi" : c.agree === 3 ? "mid" : "lo") + '">' +
        c.agree + "/5</span>" +
      "<span>" + esc(fej) + "</span>" +
    "</div><div class="+'"cvotes"'+">";

  for (var i = 0; i < c.detail.length; i++){
    var d = c.detail[i], cls, val;
    if (d.tartozkodik){ cls = "abst"; val = "tartózkodik"; }
    else if (d.egyetert){ cls = "yes"; val = docOf(d.valasztas).title; }
    else { cls = "no"; val = docOf(d.valasztas).title; }
    h += '<div class="cvote ' + cls + '" title="' + esc(d.leiras) + '">' +
           '<span class="cname">' + esc(d.nev) + "</span>" +
           '<span class="cval">' + esc(val) + "</span>" +
         "</div>";
  }
  h += "</div>";

  if (adj.swapped)
    h += '<div class="cnote"><i class="fa-solid fa-right-left"></i> ' +
         "A szó szerinti egyezés másik szabályzatra mutatott; a tanács többsége ezt választotta.</div>";
  else if (adj.note)
    h += '<div class="cnote"><i class="fa-solid fa-circle-info"></i> ' + esc(adj.note) + "</div>";

  return h + "</div>";
}

var _c_renderAnswer = renderAnswer;
renderAnswer = function(query, r){
  _c_renderAnswer(query, r);
  if (!COUNCIL.on) return;
  try {
    var box = document.getElementById("ans");
    var body = box && box.querySelector(".ansbody");
    if (!body || body.querySelector(".council")) return;
    var html = councilStrip(r);
    if (!html) return;
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    body.insertBefore(tmp.firstChild, body.firstChild);
  } catch (e){}
};
