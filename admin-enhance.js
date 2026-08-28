/* ============================================================================
   Adminisztráció - kiegészítő réteg

   Az admin.js-hez nem nyúl, csak bővíti:
     1. dokumentumonként "Új verzió közzététele" - ez indítja az elavulás-jelzést
     2. a backend állapota és kapcsolója a Beállítások nézetben

   Az elavulás-jelzés lényege: ha egy szabályzat új verziót kap, mindenki
   értesítést kap, aki korábban a régiből kapott választ. Egy elavult válasz
   rosszabb, mint a semmi - a rendszer ezt nem hagyja csendben.
   ============================================================================ */

/* ---------------------------------------------------------------- modal */

function pubModal(){
  var el = document.getElementById("pubOv");
  if (el) return el;

  el = document.createElement("div");
  el.className = "ov";
  el.id = "pubOv";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML =
    '<div class="sheet">' +
      "<header><div><h4>Új verzió közzététele</h4>" +
      '<div class="m" id="pubDoc"></div></div>' +
      '<button class="x" id="pubX" aria-label="Bezárás">&times;</button></header>' +
      '<div class="body">' +
        '<div class="pubwarn"><b>Ez értesítést küld.</b> A rendszer megkeresi a naplóban, ' +
        'ki kapott korábban választ ebből a szabályzatból, és jelzi nekik, hogy amit akkor ' +
        'megtudtak, ma már nem biztos, hogy érvényes.</div>' +
        '<div class="pubform">' +
          '<div class="pfrow"><label for="pubVer">Új verziószám</label>' +
          '<input id="pubVer" type="text" placeholder="1.1"></div>' +
          '<div class="pfrow"><label for="pubEff">Hatálybalépés</label>' +
          '<input id="pubEff" type="text" placeholder="2026. szeptember 1."></div>' +
          '<div class="pfrow"><label for="pubNote">Mi változott</label>' +
          '<textarea id="pubNote" placeholder="Néhány mondat arról, mi módosult. Ez bekerül az értesítő levélbe."></textarea></div>' +
        "</div>" +
        '<div class="pubfoot">' +
          '<button class="btn btn-primary" id="pubGo">Közzététel és értesítés</button>' +
          '<button class="btn btn-ghost" id="pubCancel">Mégsem</button>' +
          '<div class="pubstate" id="pubState" role="status"></div>' +
        "</div>" +
      "</div>" +
    "</div>";

  document.body.appendChild(el);
  document.getElementById("pubX").addEventListener("click", closePub);
  document.getElementById("pubCancel").addEventListener("click", closePub);
  el.addEventListener("click", function(e){ if (e.target === el) closePub(); });
  return el;
}

function closePub(){
  var el = document.getElementById("pubOv");
  if (el) el.classList.remove("on");
}

function openPub(doc){
  var el = pubModal();
  document.getElementById("pubDoc").textContent =
    doc.title + " · jelenlegi verzió: v" + doc.version;
  document.getElementById("pubVer").value  = nextVersion(doc.version);
  document.getElementById("pubEff").value  = "";
  document.getElementById("pubNote").value = "";
  document.getElementById("pubState").innerHTML = "";

  var go = document.getElementById("pubGo");
  go.disabled = false;
  go.onclick = function(){ publish(doc, this); };

  el.classList.add("on");
  window.setTimeout(function(){ document.getElementById("pubVer").focus(); }, 40);
}

/* 1.0 -> 1.1; ami nem így néz ki, azt békén hagyjuk. */
function nextVersion(v){
  var m = /^(\d+)\.(\d+)$/.exec(String(v || ""));
  return m ? m[1] + "." + (parseInt(m[2], 10) + 1) : "";
}

function publish(doc, btn){
  var ver   = (document.getElementById("pubVer").value || "").trim();
  var eff   = (document.getElementById("pubEff").value || "").trim();
  var note  = (document.getElementById("pubNote").value || "").trim();
  var state = document.getElementById("pubState");

  if (!ver){
    state.innerHTML = '<span class="bad">A verziószám kötelező.</span>';
    return;
  }
  if (typeof backendPublishVersion !== "function" || !backendOn()){
    state.innerHTML = '<span class="bad">A backend ki van kapcsolva, ezért nem megy ki értesítés. ' +
                      "A verzió a helyi leltárban akkor is átáll.</span>";
    localVersionBump(doc, ver);
    return;
  }

  btn.disabled = true;
  state.innerHTML = '<span class="wait">Értesítések küldése…</span>';

  var me = (typeof currentUser === "function" && currentUser()) || {};
  backendPublishVersion({
    docId:     doc.id,
    docTitle:  doc.title,
    version:   ver,
    effective: eff,
    note:      note,
    by:        me.name || "rendszergazda"
  }, function(err, data){
    if (err){
      btn.disabled = false;
      state.innerHTML = '<span class="bad">Nem sikerült: ' + esc(err) + "</span>";
      return;
    }
    localVersionBump(doc, ver);
    var n = (data && data.affected) || 0;
    var who = (data && data.recipients) || 0;
    state.innerHTML = '<span class="ok"><i class="fa-solid fa-check"></i> Közzétéve. ' +
      (n ? ("Érintett korábbi válasz: " + n + ", értesített munkatárs: " + who + ".")
         : "Korábbi válasz nem érintett, értesítés nem ment ki.") + "</span>";
    toast(n ? ("Értesítés kiküldve " + who + " munkatársnak.") : "Új verzió rögzítve.");
    window.setTimeout(closePub, 2600);
  });
}

/* A leltárban is átáll a verzió, hogy a válaszok fejléce már az újat mutassa. */
function localVersionBump(doc, ver){
  if (typeof setDocMeta === "function") setDocMeta(doc.id, { version: ver });
  doc.version = ver;
  if (typeof renderDocs === "function") renderDocs();
  if (typeof renderDash === "function") renderDash();
}

/* ---------------------------------------------------------------- gomb a táblába */

var _renderDocs = renderDocs;

renderDocs = function(){
  _renderDocs();

  var el = document.getElementById("aDocs");
  if (!el) return;
  var rows = el.querySelectorAll("tbody tr");
  var list = (window.KB && window.KB.docs) || [];

  for (var i = 0; i < rows.length && i < list.length; i++){
    var tds = rows[i].getElementsByTagName("td");
    if (!tds.length) continue;
    var cell = tds[tds.length - 1];
    if (cell.querySelector(".pubbtn")) continue;

    var b = document.createElement("button");
    b.className = "iconbtn pubbtn";
    b.title = "Új verzió közzététele és értesítés";
    b.innerHTML = '<i class="fa-solid fa-bullhorn"></i>';
    b.setAttribute("data-doc", list[i].id);
    b.addEventListener("click", function(){
      var id = this.getAttribute("data-doc");
      for (var k = 0; k < list.length; k++){ if (list[k].id === id) return openPub(list[k]); }
    });
    cell.appendChild(b);
  }
};

/* ---------------------------------------------------------------- backend-kapcsoló */

function injectBackendBox(){
  var view = document.getElementById("v-settings");
  if (!view || document.getElementById("bkBox")) return;

  var box = document.createElement("div");
  box.id = "bkBox";
  box.innerHTML =
    '<div class="ahead"><div><h2 style="font-size:1.19rem">Közös napló és értesítések</h2>' +
    "<p>Bekapcsolva a kérdések gépfüggetlenül visszanézhetők, és a fedezet nélküli " +
    "kérdésekről, illetve az elavult válaszokról e-mail értesítés megy ki. " +
    "Kikapcsolva minden a böngészőben marad - a bemutató rossz hálózaton is működik.</p></div></div>" +
    '<div class="calc"><div class="frm">' +
      '<div class="wide"><label for="bkUrl">Végpont</label>' +
      '<input id="bkUrl" type="url" placeholder="https://…/functions/v1"></div>' +
    "</div>" +
    '<div class="bkrow" style="margin-top:14px">' +
      '<button class="btn btn-ghost" id="bkToggle"></button>' +
      '<span class="bkdot" id="bkDot"></span>' +
      '<span class="meta" id="bkState"></span>' +
    "</div></div>";

  var note = view.querySelector(".note");
  if (note) view.insertBefore(box, note); else view.appendChild(box);

  document.getElementById("bkUrl").value = BACKEND.url;
  document.getElementById("bkUrl").addEventListener("change", function(){
    backendSet({ url: this.value.trim() });
    reflectBackend();
    toast("Végpont mentve.");
  });
  document.getElementById("bkToggle").addEventListener("click", function(){
    backendSet({ on: !BACKEND.on });
    reflectBackend();
    toast(BACKEND.on ? "Közös napló bekapcsolva." : "Közös napló kikapcsolva, minden helyben marad.");
  });
  reflectBackend();
}

function reflectBackend(){
  var t = document.getElementById("bkToggle");
  var d = document.getElementById("bkDot");
  var s = document.getElementById("bkState");
  if (!t) return;
  t.textContent = BACKEND.on ? "Kikapcsolás" : "Bekapcsolás";
  d.className = "bkdot " + (BACKEND.on ? "on" : "off");
  s.textContent = BACKEND.on
    ? "Bekapcsolva - a napló közös, az értesítések kimennek."
    : "Kikapcsolva - minden a böngészőben marad, e-mail nem megy ki.";
}

document.addEventListener("DOMContentLoaded", function(){
  injectBackendBox();
});
