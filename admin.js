/* ============================================================================
   Kamarai Tudástár - adminisztrációs felület.
   Külön oldal, saját belépéssel: a tudástár felületén nincs admin funkció.
   ============================================================================ */

var SET_KEY   = "mkik_kb_settings_v1";
var QUEUE_KEY = "mkik_kb_queue_v1";
var CHOFF_KEY = "mkik_kb_chambers_off_v1";

var DEFAULTS = { minScore:3.2, minCoverage:0.5, minTerms:2, llm:"", voice:"" };

function getSettings(){
  try {
    var s = JSON.parse(localStorage.getItem(SET_KEY) || "null");
    if (!s) return JSON.parse(JSON.stringify(DEFAULTS));
    for (var k in DEFAULTS){ if (!(k in s)) s[k] = DEFAULTS[k]; }
    return s;
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
function saveSettings(s){
  try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
}
function getQueue(){
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; }
}
function saveQueue(q){
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-40))); } catch (e) {}
}
function getOffChambers(){
  try { return JSON.parse(localStorage.getItem(CHOFF_KEY) || "[]"); } catch (e) { return []; }
}
function saveOffChambers(a){
  try { localStorage.setItem(CHOFF_KEY, JSON.stringify(a)); } catch (e) {}
}

function docs(){ applyDocMeta(); return (window.KB && window.KB.docs) || []; }
function chunks(){ return (window.KB && window.KB.chunks) || []; }

function catTitle(key){
  for (var i = 0; i < CATEGORIES.length; i++){ if (CATEGORIES[i].key === key) return CATEGORIES[i].title; }
  return key;
}
function emptyState(icon, title, text){
  return '<div class="state"><div class="ico"><i class="' + icon + '"></i></div>' +
         "<h4>" + title + "</h4><p>" + text + "</p></div>";
}

/* ---------------------------------------------------------------- áttekintés */
function renderDash(){
  var rows = loadLog();
  var miss = rows.filter(function(r){ return r.r === "nocov"; }).length;
  document.getElementById("dChambers").textContent = CHAMBERS.length - getOffChambers().length;
  document.getElementById("dDocs").textContent = docs().length;
  document.getElementById("dChunks").textContent = chunks().length;
  document.getElementById("dGap").textContent = rows.length ? Math.round(miss / rows.length * 100) + "%" : "0%";

  var gaps = {};
  for (var i = 0; i < rows.length; i++){
    if (rows[i].r !== "nocov") continue;
    var k = rows[i].q.trim().toLowerCase();
    if (!gaps[k]) gaps[k] = { q: rows[i].q, n: 0, last: rows[i].ts, who: {} };
    gaps[k].n++; gaps[k].last = rows[i].ts; gaps[k].who[rows[i].u] = 1;
  }
  var list = [];
  for (var g in gaps){ if (gaps.hasOwnProperty(g)) list.push(gaps[g]); }
  list.sort(function(a, b){ return b.n - a.n; });

  var el = document.getElementById("dGaps");
  if (!list.length){
    el.innerHTML = emptyState("fa-regular fa-chart-bar", "Nincs kimutatható hiány",
      "A fedezet nélkül maradt kérdések itt gyűlnek össze, gyakoriság szerint.");
    return;
  }
  var h = '<table><thead><tr><th>Megválaszolatlan kérdés</th><th class="num">Alkalom</th><th>Kik kérdezték</th><th>Utoljára</th></tr></thead><tbody>';
  for (var j = 0; j < list.length; j++){
    h += "<tr><td>" + esc(list[j].q) + '</td><td class="num">' + list[j].n + "</td><td>" +
         esc(Object.keys(list[j].who).join(", ")) + "</td><td>" + esc(list[j].last) + "</td></tr>";
  }
  el.innerHTML = h + "</tbody></table>";
}

/* ---------------------------------------------------------------- dokumentumok */
function renderDocs(){
  var d = docs(), el = document.getElementById("aDocs");
  if (!d.length){
    el.innerHTML = emptyState("fa-regular fa-folder-open", "Nincs betöltött dokumentum",
      "Tölts fel egy szabályzatot a fenti mezőben.");
  } else {
    var h = '<table><thead><tr><th>Dokumentum</th><th>Kamara</th><th>Kategória</th><th>Hozzáférési kör</th>' +
            '<th>Verzió</th><th class="num">Oldal</th><th class="num">Rész</th><th></th></tr></thead><tbody>';
    for (var i = 0; i < d.length; i++){
      var x = d[i];
      var chSel = '<select class="minisel" data-doc="' + esc(x.id) + '" data-field="chamber">';
      for (var c = 0; c < CHAMBERS.length; c++){
        chSel += '<option value="' + c + '"' + (c === x.chamber ? " selected" : "") + ">" + esc(CHAMBERS[c].short) + "</option>";
      }
      chSel += "</select>";
      var catSel = '<select class="minisel" data-doc="' + esc(x.id) + '" data-field="category">';
      for (var k = 0; k < CATEGORIES.length; k++){
        catSel += '<option value="' + CATEGORIES[k].key + '"' + (CATEGORIES[k].key === x.category ? " selected" : "") +
                  ">" + esc(CATEGORIES[k].title) + "</option>";
      }
      catSel += "</select>";
      var acSel = '<select class="minisel" data-doc="' + esc(x.id) + '" data-field="access">';
      for (var s2 = 0; s2 < ACCESS_CIRCLES.length; s2++){
        acSel += '<option value="' + ACCESS_CIRCLES[s2].key + '"' + (ACCESS_CIRCLES[s2].key === x.access ? " selected" : "") +
                 ">" + esc(ACCESS_CIRCLES[s2].title) + "</option>";
      }
      acSel += "</select>";
      h += "<tr><td><b>" + esc(x.title) + '</b><span class="sub2">' + esc(x.code) + " · " + esc(x.file) + "</span></td>" +
           "<td>" + chSel + "</td><td>" + catSel + "</td><td>" + acSel + "</td>" +
           "<td>v" + esc(x.version) + '</td><td class="num">' + x.pages +
           '</td><td class="num">' + x.chunkCount + "</td>" +
           '<td><button class="iconbtn" data-doc="' + esc(x.id) + '" data-act="reindex" title="Újraindexelés"><i class="fa-solid fa-rotate"></i></button></td></tr>';
    }
    el.innerHTML = h + "</tbody></table>";
    var bs = el.querySelectorAll(".iconbtn");
    for (var b = 0; b < bs.length; b++){
      bs[b].addEventListener("click", function(){
        toast("Újraindexelés elindítva. A háttérfolyamat a szerveren fut.");
      });
    }
    var sels = el.querySelectorAll(".minisel");
    for (var q = 0; q < sels.length; q++){
      sels[q].addEventListener("change", function(){
        var f = this.getAttribute("data-field");
        var v = f === "chamber" ? parseInt(this.value, 10) : this.value;
        var patch = {}; patch[f] = v;
        setDocMeta(this.getAttribute("data-doc"), patch);
        renderDocs(); renderChambers(); renderDash();
        toast(f === "access"
          ? "Hozzáférési kör módosítva. A tudástárban azonnal érvényes."
          : "Besorolás mentve.");
      });
    }
  }
  renderQueue();
}

function renderQueue(){
  var q = getQueue(), el = document.getElementById("queue");
  if (!q.length){ el.innerHTML = ""; return; }
  var h = "";
  for (var i = q.length - 1; i >= 0; i--){
    h += '<div class="qrow"><i class="fa-regular fa-file-pdf"></i><span class="nm">' + esc(q[i].name) +
         '</span><span class="muted">' + Math.round(q[i].size / 1024) + " KB · " + esc(q[i].at) +
         '</span><span class="st"><span class="tag t-no">indexelésre vár</span></span></div>';
  }
  el.innerHTML = h;
}

function bindUpload(){
  var drop = document.getElementById("drop"), file = document.getElementById("file");
  drop.addEventListener("click", function(){ file.click(); });
  ["dragenter","dragover"].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add("on"); });
  });
  ["dragleave","drop"].forEach(function(ev){
    drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove("on"); });
  });
  drop.addEventListener("drop", function(e){ take(e.dataTransfer.files); });
  file.addEventListener("change", function(){ take(file.files); });

  function take(list){
    if (!list || !list.length) return;
    var q = getQueue(), n = 0;
    for (var i = 0; i < list.length; i++){
      if (list[i].type !== "application/pdf"){ toast("Csak PDF tölthető fel: " + list[i].name); continue; }
      q.push({ name: list[i].name, size: list[i].size,
               at: new Date().toLocaleString("hu-HU", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }) });
      n++;
    }
    saveQueue(q);
    renderQueue();
    if (n) toast(n + " fájl az indexelési sorba került.");
  }
}

/* ---------------------------------------------------------------- kamarák */
function renderChambers(){
  var off = getOffChambers(), d = docs();
  var h = '<table><thead><tr><th>Kamara</th><th class="num">Dokumentum</th><th class="num">Oldal</th>' +
          "<th>Állapot</th><th></th></tr></thead><tbody>";
  for (var i = 0; i < CHAMBERS.length; i++){
    var n = 0, pg = 0;
    for (var j = 0; j < d.length; j++){ if (d[j].chamber === i){ n++; pg += d[j].pages; } }
    var isOff = off.indexOf(i) >= 0;
    h += "<tr><td><b>" + esc(CHAMBERS[i].short) + '</b><span class="sub2">' + esc(CHAMBERS[i].full) +
         '</span></td><td class="num">' + n + '</td><td class="num">' + pg + "</td><td>" +
         (isOff ? '<span class="tag t-no">kikapcsolva</span>' : '<span class="tag t-ok">aktív</span>') +
         '</td><td><button class="iconbtn" data-ch="' + i + '">' +
         (isOff ? "Bekapcsolás" : "Kikapcsolás") + "</button></td></tr>";
  }
  var el = document.getElementById("aChambers");
  el.innerHTML = h + "</tbody></table>";
  var bs = el.querySelectorAll("[data-ch]");
  for (var b = 0; b < bs.length; b++){
    bs[b].addEventListener("click", function(){
      var idx = parseInt(this.getAttribute("data-ch"), 10);
      var o = getOffChambers(), at = o.indexOf(idx);
      if (at >= 0) o.splice(at, 1); else o.push(idx);
      saveOffChambers(o);
      renderChambers(); renderDash();
      toast(at >= 0 ? "Kamara bekapcsolva." : "Kamara kikapcsolva, anyaga elzárva.");
    });
  }
}

/* ---------------------------------------------------------------- felhasználók */
function renderUsers(){
  var rows = loadLog();
  var h = '<table><thead><tr><th>Munkatárs</th><th>Szerepkör</th><th>Kamara</th><th>Hozzáférési körök</th>' +
          '<th class="num">Kérdés</th><th></th></tr></thead><tbody>';
  for (var i = 0; i < USERS.length; i++){
    var u = USERS[i];
    var mine = rows.filter(function(r){ return r.uid === u.id; }).length;
    var circles = "";
    for (var c = 0; c < u.circles.length; c++){
      circles += '<span class="tag ' + (u.circles[c] === "all" ? "t-ok" : "t-no") + '" style="margin-right:4px">' +
                 esc(u.circles[c]) + "</span>";
    }
    h += "<tr><td><b>" + esc(u.name) + '</b><span class="sub2">' + esc(u.email) + "</span></td><td>" +
         esc(u.role) + (u.admin ? ' <span class="tag t-no">admin</span>' : "") + "</td><td>" +
         esc(CHAMBERS[u.chamber].short) + "</td><td>" + circles + '</td><td class="num">' + mine +
         '</td><td><button class="iconbtn" data-u="' + esc(u.id) + '">Jogosultság</button></td></tr>';
  }
  var el = document.getElementById("aUsers");
  el.innerHTML = h + "</tbody></table>";
  var bs = el.querySelectorAll("[data-u]");
  for (var b = 0; b < bs.length; b++){
    bs[b].addEventListener("click", function(){
      toast("A jogosultság-szerkesztés a címtár-integrációval együtt élesedik.");
    });
  }
}

/* ---------------------------------------------------------------- napló */
function auditRows(){
  var who = document.getElementById("aWho").value;
  var what = document.getElementById("aWhat").value;
  var term = (document.getElementById("aSearch").value || "").trim().toLowerCase();
  return loadLog().filter(function(r){
    if (who && r.uid !== who) return false;
    if (what && r.r !== what) return false;
    if (term && r.q.toLowerCase().indexOf(term) < 0) return false;
    return true;
  }).reverse();
}

function renderAudit(){
  var sel = document.getElementById("aWho");
  if (!sel.options.length){
    var o = '<option value="">mind</option>';
    for (var i = 0; i < USERS.length; i++){ o += '<option value="' + USERS[i].id + '">' + esc(USERS[i].name) + "</option>"; }
    sel.innerHTML = o;
  }
  var rows = auditRows(), el = document.getElementById("aAudit");
  if (!rows.length){
    el.innerHTML = emptyState("fa-regular fa-rectangle-list", "Nincs megjeleníthető bejegyzés",
      "A tudástárban feltett kérdések itt jelennek meg.");
    return;
  }
  var h = '<table><thead><tr><th>Időpont</th><th>Munkatárs</th><th>Szerepkör</th><th>Kamara</th>' +
          "<th>Kérdés</th><th>Eredmény</th><th>Kiadott forrás</th></tr></thead><tbody>";
  for (var j = 0; j < rows.length; j++){
    var r = rows[j];
    h += "<tr><td>" + esc(r.ts) + "</td><td>" + esc(r.u) + "</td><td>" + esc(r.role) + "</td><td>" +
         esc(r.ch) + "</td><td>" + esc(r.q) + "</td><td>" +
         (r.r === "ok" ? '<span class="tag t-ok">megválaszolva</span>' : '<span class="tag t-no">nincs fedezet</span>') +
         "</td><td>" + (r.src ? esc(r.src) : '<span class="muted">-</span>') + "</td></tr>";
  }
  el.innerHTML = h + "</tbody></table>";
}

function exportAudit(){
  var rows = auditRows();
  if (!rows.length){ toast("Nincs exportálható bejegyzés."); return; }
  var lines = ["idopont;munkatars;szerepkor;kamara;kerdes;eredmeny;forras"];
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    lines.push([r.ts, r.u, r.role, r.ch, r.q,
                r.r === "ok" ? "megvalaszolva" : "nincs fedezet", r.src || ""]
      .map(function(x){ return '"' + String(x).replace(/"/g, '""') + '"'; }).join(";"));
  }
  var blob = new Blob(["﻿" + lines.join("\n")], { type:"text/csv;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = "kamarai-tudastar-naplo.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(rows.length + " bejegyzés exportálva.");
}

/* ---------------------------------------------------------------- beállítások */
function fillSettings(){
  var s = getSettings();
  document.getElementById("sScore").value = s.minScore;
  document.getElementById("sCov").value   = s.minCoverage;
  document.getElementById("sTerms").value = s.minTerms;
  document.getElementById("sLlm").value   = s.llm;
  document.getElementById("sVoice").value = s.voice;
}

function bindSettings(){
  document.getElementById("sSave").addEventListener("click", function(){
    saveSettings({
      minScore:    parseFloat(document.getElementById("sScore").value) || DEFAULTS.minScore,
      minCoverage: parseFloat(document.getElementById("sCov").value)   || DEFAULTS.minCoverage,
      minTerms:    parseInt(document.getElementById("sTerms").value, 10) || DEFAULTS.minTerms,
      llm:         document.getElementById("sLlm").value.trim(),
      voice:       document.getElementById("sVoice").value.trim()
    });
    toast("Beállítások mentve. A tudástár a következő kérdésnél már ezekkel fut.");
  });
  document.getElementById("sReset").addEventListener("click", function(){
    saveSettings(JSON.parse(JSON.stringify(DEFAULTS)));
    fillSettings();
    toast("Alaphelyzet visszaállítva.");
  });
}

/* ---------------------------------------------------------------- felület */
function showView(name){
  var vs = document.querySelectorAll(".view");
  for (var i = 0; i < vs.length; i++){ vs[i].classList.toggle("active", vs[i].id === "v-" + name); }
  var ls = document.querySelectorAll(".adminnav a");
  for (var j = 0; j < ls.length; j++){ ls[j].classList.toggle("on", ls[j].getAttribute("data-view") === name); }
  if (name === "dash")     renderDash();
  if (name === "docs")     renderDocs();
  if (name === "chambers") renderChambers();
  if (name === "users")    renderUsers();
  if (name === "audit")    renderAudit();
  /* az Adatforrások nézet statikus, nincs mit renderelni */
  window.scrollTo(0, 0);
}

function bindNav(){
  var ls = document.querySelectorAll(".adminnav a");
  for (var i = 0; i < ls.length; i++){
    ls[i].addEventListener("click", function(e){ e.preventDefault(); showView(this.getAttribute("data-view")); });
  }
  document.getElementById("logoutBtn").addEventListener("click", function(){
    logout(); window.location.href = "admin.html";
  });
  document.getElementById("aExport").addEventListener("click", exportAudit);
  document.getElementById("aClear").addEventListener("click", function(){
    clearLog(); renderAudit(); renderDash();
    toast("A napló kiürítve.");
  });
  var re = function(){ renderAudit(); };
  document.getElementById("aWho").addEventListener("change", re);
  document.getElementById("aWhat").addEventListener("change", re);
  document.getElementById("aSearch").addEventListener("input", re);
}

function bindLogin(){
  document.getElementById("loginForm").addEventListener("submit", function(e){
    e.preventDefault();
    var r = login(document.getElementById("lgEmail").value, document.getElementById("lgPass").value);
    if (!r.ok){ document.getElementById("lgErr").textContent = r.why; return; }
    if (!r.user.admin){
      logout();
      document.getElementById("lgErr").textContent = "Ehhez a felülethez rendszergazdai jogosultság kell.";
      return;
    }
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

/* Az init hoistolt függvénydeklaráció, a szkript legvégén hívjuk meg. */
function init(){
  initChrome();
  var u = currentUser();
  if (!u || !u.admin){
    document.getElementById("loginWrap").hidden = false;
    document.getElementById("app").hidden = true;
    bindLogin();
    return;
  }
  document.getElementById("loginWrap").hidden = true;
  document.getElementById("app").hidden = false;
  bindNav();
  bindUpload();
  bindSettings();
  fillSettings();
  showView("dash");
}

init();
