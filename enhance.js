/* ============================================================================
   Kamarai Tudástár - kiegészítő réteg

   Ez a fájl nem írja felül az app.js-t: a meglévő globális függvényeket
   futásidőben bővíti. Így két fejlesztő (vagy két session) párhuzamosan
   dolgozhat ugyanazon a demón anélkül, hogy egymásra írna.

   Amit hozzátesz:
     1. korlátozott hozzáférésű dokumentum, hogy a jogosultságkezelés látszódjon
     2. "nincs fedezet" esetén a legközelebbi szakaszok + hiánybejelentés
     3. közös napló: a kérdések gépfüggetlenül visszanézhetők
     4. e-mail értesítés fedezet nélküli kérdésről (Resend, a backendben)
     5. elavulttá vált válaszok jelölése a naplóban
     6. mért skálázási adatok a Költség nézetben

   Backend nélkül minden pont működik, csak a 3-5. marad lokális.
   ============================================================================ */

/* ---------------------------------------------------------------- 1. hozzáférés

   A dokumentum-leltárban minden szabályzat "all" hozzáférésű, így a meglévő
   jogosultság-szűrés sosem lépne életbe. Egy dokumentumot korlátozott körbe
   teszünk, hogy a működés bemutatható legyen. A build_index.py MANIFEST-je a
   végleges hely; ez itt a demó-kapcsoló. */
var ACCESS_OVERRIDE = {
  "itbsz-2026-01": "vezetoi"   /* IT Biztonsági Szabályzat - csak vezetői kör */
};

(function applyAccessOverride(){
  if (!window.KB || !window.KB.docs) return;
  for (var i = 0; i < window.KB.docs.length; i++){
    var d = window.KB.docs[i];
    if (ACCESS_OVERRIDE[d.id]) d.access = ACCESS_OVERRIDE[d.id];
  }
})();

/* ---------------------------------------------------------------- gépazonosító

   A közös naplóban meg kell tudni különböztetni a saját gépről és a máshonnan
   érkezett bejegyzéseket - egyrészt a kettőzés elkerülése miatt, másrészt mert
   a felületen jelezzük. */
var CLIENT_KEY = "mkik_client_v1";
var CLIENT_ID = (function(){
  try {
    var v = localStorage.getItem(CLIENT_KEY);
    if (!v){
      v = "c" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
      localStorage.setItem(CLIENT_KEY, v);
    }
    return v;
  } catch (e){ return "c-ismeretlen"; }
})();

/* ---------------------------------------------------------------- állapot */
var LAST = { q: "", r: null };      /* az utolsó keresés, a naplózás bővítéséhez */
var REMOTE = [];                    /* a szerverről kapott naplósorok */
var REMOTE_AT = 0;

/* ---------------------------------------------------------------- 3. közös napló */

var _loadLog = loadLog;
var _saveLog = saveLog;

/* A napló minden fogyasztója (Előzmények, Hiánylista, Fiók, CSV-export) ezen
   keresztül kér adatot, ezért elég itt összefésülni a szerverről kapott sorokat. */
loadLog = function(){
  var local = _loadLog();
  if (!REMOTE.length) return local;
  var all = local.concat(REMOTE);
  all.sort(function(a, b){
    var x = a.iso || "", y = b.iso || "";
    return x < y ? -1 : (x > y ? 1 : 0);
  });
  return all;
};

/* A szerverről kapott sorok soha nem kerülnek a böngésző tárolójába. */
saveLog = function(rows){
  var own = [];
  for (var i = 0; i < rows.length; i++){ if (!rows[i]._rm) own.push(rows[i]); }
  _saveLog(own);
};

function remoteRow(r){
  var d = r.asked_at ? new Date(r.asked_at) : null;
  return {
    ts:    d ? d.toLocaleString("hu-HU", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }) : "-",
    iso:   r.asked_at || "",
    q:     r.question || "",
    r:     r.result || "ok",
    uid:   r.user_id || "?",
    u:     r.user_name || "ismeretlen",
    role:  r.user_role || "-",
    ch:    r.chamber || "-",
    src:   r.doc_title ? (r.doc_title + (r.page ? " · " + r.page + ". o." : "")) : null,
    cost:  0,
    _rm:   true,
    stale: r.stale_since || null,
    staleReason: r.stale_reason || null
  };
}

/* A közös napló beolvasása. Hiba esetén csendben marad a lokális nézet. */
function pullRemoteLog(cb){
  cb = cb || function(){};
  if (typeof backendLogList !== "function" || !backendOn()) return cb(false);

  backendLogList(300, function(err, data){
    if (err || !data || !data.rows) return cb(false);
    var out = [];
    for (var i = 0; i < data.rows.length; i++){
      /* a saját gépről küldött sorok már megvannak lokálisan */
      if (data.rows[i].client === CLIENT_ID) continue;
      out.push(remoteRow(data.rows[i]));
    }
    REMOTE = out;
    REMOTE_AT = Date.now();
    cb(true);
  });
}

/* ---------------------------------------------------------------- naplózás bővítése */

var _logEvent = logEvent;

logEvent = function(query, result, src){
  _logEvent(query, result, src);          /* a lokális napló változatlanul működik */

  if (typeof backendLog !== "function" || !backendOn()) return;

  var u = (typeof currentUser === "function" && currentUser()) || {};
  var r = LAST.r;
  var hit = (r && r.hits && r.hits.length) ? r.hits[0].e.c : null;
  var doc = hit ? docOf(hit.d) : null;
  var chEl = document.getElementById("chamber");
  var ch = (chEl && CHAMBERS[chEl.selectedIndex]) ? CHAMBERS[chEl.selectedIndex].short : "";

  backendLog({
    question:    query,
    result:      result,
    user_id:     u.id,
    user_name:   u.name,
    user_email:  u.email,
    user_role:   u.role,
    chamber:     ch,
    doc_id:      (result === "ok" || result === "weak") && hit ? hit.d : null,
    doc_title:   (result === "ok" || result === "weak") && doc ? doc.title : null,
    doc_version: (result === "ok" || result === "weak") && doc ? doc.version : null,
    section:     src ? src.section : null,
    page:        src ? src.page : null,
    coverage:    r ? r.coverage : null,
    score:       r ? r.best : null,
    cost_ft:     0,
    client:      CLIENT_ID
  });
};

/* ---------------------------------------------------------------- 2. legközelebbi szakaszok */

var _renderAnswer = renderAnswer;

renderAnswer = function(query, r){
  LAST = { q: query, r: r };
  _renderAnswer(query, r);

  if (typeof verdictOf !== "function" || verdictOf(r) !== "none") return;

  var box = document.getElementById("ans");
  var body = box ? box.querySelector(".ansbody") : null;
  if (!body) return;

  var near = nearHits(r);
  var wrap = document.createElement("div");
  wrap.className = "nearwrap";
  wrap.innerHTML = nearHtml(near) + gapBarHtml();
  body.insertBefore(wrap, body.querySelector(".costline"));

  bindNear(wrap, query, near);
  sendGap(query, near, false);
};

/* A küszöb alatti találatok. Jogosultság szerint már szűrve érkeznek:
   a hozzáférési körön kívüli szakaszok be sem kerülnek a hits tömbbe. */
function nearHits(r){
  var out = [], hits = (r && r.hits) || [];
  for (var i = 0; i < hits.length && out.length < 3; i++){
    var c = hits[i].e.c;
    out.push({ chunk: c, doc: docOf(c.d), score: hits[i].score });
  }
  return out;
}

function nearHtml(near){
  if (!near.length){
    return '<div class="nearbox empty">A rendszer egyetlen olyan szakaszt sem talált, ' +
           'amely akár távolról kapcsolódna a kérdéshez.</div>';
  }
  var h = '<div class="nearbox">' +
    '<div class="nearhead"><i class="fa-regular fa-compass"></i> Ez állt a legközelebb' +
    '<span class="nearnote">nem válasz, csak a legjobban illeszkedő szakaszok</span></div>';

  for (var i = 0; i < near.length; i++){
    var c = near[i].chunk, d = near[i].doc;
    var txt = c.t.length > 260 ? c.t.slice(0, 260) + "…" : c.t;
    h += '<div class="nearitem">' +
           '<div class="neartext">' + esc(txt) + "</div>" +
           '<button class="srcbtn near" data-chunk="' + c.i + '">' +
             '<i class="fa-regular fa-file-lines"></i> ' + esc(d.title) +
             '<span class="pg">' + esc(c.s || "") + " · " + c.p + ". oldal</span>" +
           "</button>" +
         "</div>";
  }
  return h + "</div>";
}

function gapBarHtml(){
  return '<div class="gapbar">' +
           '<div class="gaptext"><b>Ez szabályozási hiány lehet.</b> ' +
           'A szabályzat felelőse értesítést kap, hogy erre a kérdésre nincs fedezet.</div>' +
           '<button class="btn btn-ghost gapbtn"><i class="fa-regular fa-paper-plane"></i> Jelentem hiányként</button>' +
           '<div class="gapstate" role="status"></div>' +
         "</div>";
}

function bindNear(scope, query, near){
  var btns = scope.querySelectorAll(".srcbtn");
  for (var i = 0; i < btns.length; i++){
    btns[i].addEventListener("click", function(){
      openSource(parseInt(this.getAttribute("data-chunk"), 10));
    });
  }
  var gb = scope.querySelector(".gapbtn");
  if (gb) gb.addEventListener("click", function(){
    this.disabled = true;
    sendGap(query, near, true);
  });
}

/* ---------------------------------------------------------------- 4. hiány-értesítő */

function sendGap(query, near, manual){
  var state = document.querySelector(".gapstate");
  if (typeof backendNotifyGap !== "function" || !backendOn()){
    if (state) state.innerHTML = '<span class="gapoff">A kérdés a helyi hiánylistába került. ' +
      'E-mail értesítés csak bekapcsolt backenddel megy ki.</span>';
    return;
  }
  if (state) state.innerHTML = '<span class="gapwait">Értesítés küldése…</span>';

  var u = (typeof currentUser === "function" && currentUser()) || {};
  var chEl = document.getElementById("chamber");

  backendNotifyGap({
    query:   query,
    manual:  manual,
    chamber: (chEl && CHAMBERS[chEl.selectedIndex]) ? CHAMBERS[chEl.selectedIndex].short : "",
    user:    { name: u.name, role: u.role, email: u.email },
    near:    near.map(function(n){
      return { doc: n.doc.title, section: n.chunk.s, page: n.chunk.p, text: n.chunk.t };
    })
  }, function(err, data){
    var el = document.querySelector(".gapstate");
    if (!el) return;
    if (err){
      el.innerHTML = '<span class="gapoff">Az értesítés nem ment ki (' + esc(err) +
                     '). A kérdés a hiánylistában akkor is szerepel.</span>';
    } else if (data && data.skipped){
      el.innerHTML = '<span class="gapok"><i class="fa-solid fa-check"></i> ' +
                     'Erről a kérdésről nemrég már ment értesítés (' + esc(data.skipped) + ').</span>';
    } else {
      el.innerHTML = '<span class="gapok"><i class="fa-solid fa-check"></i> ' +
                     'A szabályzat felelőse e-mail értesítést kapott.</span>';
    }
  });
}

/* ---------------------------------------------------------------- 5. napló-jelölések */

var _renderLog = renderLog;

renderLog = function(){
  _renderLog();

  var rows = filteredLog();
  var trs  = document.querySelectorAll("#logBody tbody tr");

  for (var i = 0; i < trs.length && i < rows.length; i++){
    var r = rows[i], tds = trs[i].getElementsByTagName("td");
    if (tds.length < 3) continue;

    if (r.stale){
      var b = document.createElement("span");
      b.className = "stalebadge";
      b.title = r.staleReason ? ("Új verzió: " + r.staleReason) : "A hivatkozott szabályzat azóta változott";
      b.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> elavult';
      tds[1].appendChild(b);
      trs[i].className += " stalerow";
    }
    if (r._rm){
      var m = document.createElement("span");
      m.className = "sub2 remotemark";
      m.textContent = "más gépről";
      tds[2].appendChild(m);
    }
  }
};

/* A napló nézetek megnyitásakor friss adatot kérünk a szerverről. */
var _showView = showView;

showView = function(name){
  _showView(name);
  if (name !== "log" && name !== "gaps") return;
  if (Date.now() - REMOTE_AT < 15000) return;      /* ne kérdezzük percenként százszor */
  pullRemoteLog(function(changed){
    if (!changed) return;
    if (name === "log")  renderLog();
    if (name === "gaps") renderGaps();
  });
};

/* ---------------------------------------------------------------- 6. skálázási adatok */

/* Mért értékek: ugyanez a keresőmotor, növekvő dokumentumállományon,
   pesszimista esetben (dokumentumonként új szókincs, nincs szóátfedés).
   Mérés: 2026.08.28, Node 24, MacBook. */
var SCALE_ROWS = [
  { docs: "4 dokumentum (ma)", chunks: "439",    q: "4 ms",    dl: "0,1 MB", state: "ok" },
  { docs: "~40 dokumentum",    chunks: "4 390",  q: "75 ms",   dl: "1,4 MB", state: "ok" },
  { docs: "~200 dokumentum",   chunks: "21 950", q: "1,2 s",   dl: "7,3 MB", state: "warn" },
  { docs: "~400 dokumentum",   chunks: "43 900", q: "4,6 s",   dl: "14,7 MB", state: "bad" }
];

function injectScale(){
  var view = document.getElementById("v-cost");
  if (!view || document.getElementById("scaleBox")) return;

  var h = '<div class="scalebox" id="scaleBox">' +
    '<h3 class="scaletitle">Mi történik tízszeres mennyiségnél</h3>' +
    '<p class="scalelead">A visszakeresés ma a böngészőben fut, ezért kérdésenként nincs változó költsége. ' +
    'Ennek a modellnek van határa, és megmértük, hol van.</p>' +
    '<div class="tablewrap"><table><thead><tr>' +
      "<th>Dokumentumállomány</th><th>Szakasz</th><th>Egy kérdés</th><th>Letöltés</th><th>Állapot</th>" +
    "</tr></thead><tbody>";

  var label = { ok: "tartható", warn: "határon", bad: "átállás kell" };
  for (var i = 0; i < SCALE_ROWS.length; i++){
    var s = SCALE_ROWS[i];
    h += "<tr><td>" + s.docs + "</td><td>" + s.chunks + "</td><td>" + s.q + "</td><td>" + s.dl +
         '</td><td><span class="scaletag ' + s.state + '">' + label[s.state] + "</span></td></tr>";
  }

  h += "</tbody></table></div>" +
    '<div class="scalenote"><b>A határ ~50 dokumentumnál van.</b> Efölött két lépcső következik: ' +
    'fordított index (a szótár végigjárása helyett találati listák) nagyságrenddel kitolja a határt, ' +
    'majd szerveroldali visszakeresés. A felület és a forrás-visszavezetés egyik lépésnél sem változik.' +
    '<span class="scalesrc">Saját mérés ugyanezen a keresőmotoron, 2026.08.28.</span></div>' +
    "</div>";

  var calc = view.querySelector(".calc");
  var tmp = document.createElement("div");
  tmp.innerHTML = h;
  var node = tmp.firstChild;
  if (calc && calc.nextSibling) view.insertBefore(node, calc.nextSibling);
  else view.appendChild(node);
}

/* ---------------------------------------------------------------- indulás */

document.addEventListener("DOMContentLoaded", function(){
  injectScale();
  /* Az első betöltéskor behúzzuk a közös naplót, hogy a korábbi
     beszélgetések azonnal láthatók legyenek. */
  pullRemoteLog(function(changed){
    if (!changed) return;
    var cur = document.querySelector(".view.active");
    if (cur && cur.id === "v-log")  renderLog();
    if (cur && cur.id === "v-gaps") renderGaps();
    refreshSidebar();
  });
});
