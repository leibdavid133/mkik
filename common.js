/* ============================================================================
   Kamarai Tudástár - közös réteg: kamarák, felhasználók, munkamenet,
   megjelenés (világos/sötét), nyelv, napló. Az index.html és az admin.html
   egyaránt ezt használja.
   ============================================================================ */

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
  { key:"beszerzes",   title:"Beszerzés és gazdálkodás", en:"Procurement and finance" },
  { key:"adatvedelem", title:"Adatvédelem",              en:"Data protection" },
  { key:"iratkezeles", title:"Iratkezelés",              en:"Records management" },
  { key:"it",          title:"IT-biztonság",             en:"IT security" },
  { key:"ugyrend",     title:"Ügyrend és SZMSZ",         en:"Rules of procedure" },
  { key:"zart",        title:"HR és pénzügy",            en:"HR and finance", restricted:true }
];

/* ---------------------------------------------------------------- felhasználók
   Demó-fiókok. Éles rendszerben ezt a kamara Entra ID / SSO címtára adja,
   jelszó nem kerül a kliensbe. A jelszó itt szándékosan közös és látható:
   ez egy bemutató, nem hitelesítési megoldás. */
var DEMO_PASSWORD = "kamara2026";

var USERS = [
  { id:"kovacs.anna",  name:"Kovács Anna",   email:"kovacs.anna@mkik.hu",
    role:"ügyintéző",           roleEn:"case handler",   chamber:0,  circles:["all"], admin:false },
  { id:"nagy.peter",   name:"Nagy Péter",    email:"nagy.peter@bkik.hu",
    role:"pénzügyi munkatárs",  roleEn:"finance officer",chamber:4,  circles:["all","penzugy"], admin:false },
  { id:"szabo.judit",  name:"Szabó Judit",   email:"szabo.judit@mkik.hu",
    role:"HR vezető",           roleEn:"HR manager",     chamber:0,  circles:["all","hr"], admin:false },
  { id:"admin",        name:"Rendszergazda", email:"admin@mkik.hu",
    role:"rendszergazda",       roleEn:"administrator",  chamber:0,  circles:["all","hr","penzugy","vezetoi"], admin:true }
];

function userById(id){
  for (var i = 0; i < USERS.length; i++){ if (USERS[i].id === id) return USERS[i]; }
  return null;
}

/* ---------------------------------------------------------------- munkamenet */
var SESSION_KEY = "mkik_kb_session_v1";

function login(email, password){
  var e = (email || "").trim().toLowerCase();
  for (var i = 0; i < USERS.length; i++){
    if (USERS[i].email.toLowerCase() === e || USERS[i].id === e){
      if (password !== DEMO_PASSWORD) return { ok:false, why:"Hibás jelszó." };
      var s = { id: USERS[i].id, at: new Date().toISOString(), chamber: USERS[i].chamber };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (err) {}
      return { ok:true, user: USERS[i] };
    }
  }
  return { ok:false, why:"Nincs ilyen felhasználó." };
}

function currentUser(){
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return s ? userById(s.id) : null;
  } catch (e) { return null; }
}

function currentChamber(){
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return s && typeof s.chamber === "number" ? s.chamber : 0;
  } catch (e) { return 0; }
}

function setChamber(idx){
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!s) return;
    s.chamber = idx;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch (e) {}
}

function logout(){
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function initials(name){
  var p = (name || "").split(" ");
  return ((p[0] || "").charAt(0) + (p[1] || "").charAt(0)).toUpperCase();
}

/* ---------------------------------------------------------------- megjelenés */
var THEME_KEY = "mkik_kb_theme_v1";

function getTheme(){
  try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; }
}
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  var b = document.getElementById("themeBtn");
  if (b){
    b.innerHTML = t === "dark"
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
    b.setAttribute("title", t === "dark" ? "Világos mód" : "Sötét mód");
  }
}
function toggleTheme(){ applyTheme(getTheme() === "dark" ? "light" : "dark"); }

/* ---------------------------------------------------------------- betűméret */
var FONT_KEY = "mkik_kb_font_v1";
var FONT_STEPS = [100, 112, 125];

function getFontStep(){
  try { return parseInt(localStorage.getItem(FONT_KEY) || "0", 10) || 0; } catch (e) { return 0; }
}
function applyFontStep(i){
  var step = FONT_STEPS[i % FONT_STEPS.length];
  document.documentElement.style.fontSize = (step * 0.16) + "px";
  try { localStorage.setItem(FONT_KEY, String(i % FONT_STEPS.length)); } catch (e) {}
}
function cycleFont(){ applyFontStep(getFontStep() + 1); }

/* ---------------------------------------------------------------- nyelv
   A felület kétnyelvű. A szabályzatok magyar nyelvűek és magyarul is
   maradnak: a válasz szó szerinti idézet, azt fordítani nem szabad. */
var LANG_KEY = "mkik_kb_lang_v1";

var I18N = {
  hu: {
    brand_sub:"Belső dokumentumkereső · MKIK",
    nav_megk:"Megkeresések", nav_ask:"Kérdezés", nav_docs:"Dokumentumok", nav_gaps:"Hiánylista",
    nav_log:"Előzmények", nav_cost:"Költség", nav_account:"Fiók",
    crumb_home:"kezdőlap", crumb_sys:"belső rendszerek",
    ask_title:"Kamarai Tudástár",
    ask_lead:"Kérdezz a kamara hatályos belső dokumentumaiból. A rendszer csak a betöltött szabályzatokból válaszol, és minden állításhoz megmutatja a forrást: dokumentum, oldal, szó szerinti részlet.",
    ask_ph:"Például: ki hagyhat jóvá 500 000 Ft feletti beszerzést?",
    ask_btn:"Keresés", samples:"Példák:",
    sb_chamber:"Kamara", sb_system:"Rendszer", sb_docs:"Betöltött dokumentum",
    sb_sync:"Utolsó frissítés", sb_mode:"Válaszmód", sb_llm:"Nyelvi modell",
    sb_voice:"Hangasszisztens", sb_quoted:"idézetes", sb_none:"nincs bekötve",
    v_ok:"Fedezet a szabályzatban", v_no:"Erre nincs fedezet a dokumentumokban",
    logout:"Kijelentkezés", login_btn:"Belépés",
    docs_lead:"A dokumentumállomány kamaránként külön kezelhető, cserélhető és bővíthető. A verzió és a hatálybalépés minden válaszban látszik.",
    log_lead:"Minden kérdés, a hozzá tartozó szerepkör, a kiadott forrás és a döntés naplózva van, visszakereshetően.",
    gaps_lead:"Amire a rendszer nem talál fedezetet, az nem hiba, hanem adat: megmutatja, hol hiányos a belső szabályozás.",
    cost_lead:"A költség nem becslés, hanem mért érték. A visszakeresés determinisztikus és ingyenes."
  },
  en: {
    brand_sub:"Internal document search · MKIK",
    nav_megk:"Enquiries", nav_ask:"Ask", nav_docs:"Documents", nav_gaps:"Coverage gaps",
    nav_log:"History", nav_cost:"Cost", nav_account:"Account",
    crumb_home:"home", crumb_sys:"internal systems",
    ask_title:"Chamber Knowledge Base",
    ask_lead:"Ask about the chamber's internal regulations in force. The system answers only from the loaded documents, and shows the source of every statement: document, page, verbatim passage.",
    ask_ph:"For example: who approves a purchase above HUF 500,000?",
    ask_btn:"Search", samples:"Examples:",
    sb_chamber:"Chamber", sb_system:"System", sb_docs:"Documents loaded",
    sb_sync:"Last updated", sb_mode:"Answer mode", sb_llm:"Language model",
    sb_voice:"Voice assistant", sb_quoted:"verbatim", sb_none:"not connected",
    v_ok:"Covered by the regulation", v_no:"No coverage in the documents",
    logout:"Sign out", login_btn:"Sign in",
    docs_lead:"The document set is managed per chamber and can be replaced or extended. Version and effective date appear with every answer.",
    log_lead:"Every question, the role behind it, the source served and the decision are logged and traceable.",
    gaps_lead:"What the system cannot cover is not a failure but data: it shows where internal regulation is incomplete.",
    cost_lead:"Cost is measured, not estimated. Retrieval is deterministic and free of charge."
  }
};

function getLang(){
  try { return localStorage.getItem(LANG_KEY) || "hu"; } catch (e) { return "hu"; }
}
function setLang(l){
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
}
function t(key){
  var d = I18N[getLang()] || I18N.hu;
  return d[key] || I18N.hu[key] || key;
}
function applyLang(){
  var els = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < els.length; i++){ els[i].textContent = t(els[i].getAttribute("data-i18n")); }
  var ph = document.querySelectorAll("[data-i18n-ph]");
  for (var j = 0; j < ph.length; j++){ ph[j].setAttribute("placeholder", t(ph[j].getAttribute("data-i18n-ph"))); }
  var pill = document.getElementById("langPill");
  if (pill) pill.textContent = getLang().toUpperCase();
  document.documentElement.setAttribute("lang", getLang());
}

/* ---------------------------------------------------------------- napló */
var LOG_KEY = "mkik_kb_log_v2";

function loadLog(){
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch (e) { return []; }
}
function saveLog(rows){
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rows.slice(-400))); } catch (e) {}
}
function clearLog(){
  try { localStorage.removeItem(LOG_KEY); } catch (e) {}
}

/* ---------------------------------------------------------------- visszajelzés */
function toast(msg){
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(function(){ el.classList.remove("on"); }, 2400);
}

function esc(s){
  return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* A megjelenés-beállítások a bejelentkezéstől függetlenül azonnal érvényesek. */
function initChrome(){
  applyTheme(getTheme());
  applyFontStep(getFontStep());
  applyLang();
}

/* ---------------------------------------------------------------- dokumentum-metaadat
   Az adminban módosított kamara- és hozzáférési kör beállítás. Külön tároljuk,
   hogy az újraindexelés (data/kb.js) ne írja felül a kézi besorolást. */
var DOCMETA_KEY = "mkik_kb_docmeta_v1";

function getDocMeta(){
  try { return JSON.parse(localStorage.getItem(DOCMETA_KEY) || "{}"); } catch (e) { return {}; }
}
function setDocMeta(id, patch){
  var all = getDocMeta();
  all[id] = all[id] || {};
  for (var k in patch){ if (patch.hasOwnProperty(k)) all[id][k] = patch[k]; }
  try { localStorage.setItem(DOCMETA_KEY, JSON.stringify(all)); } catch (e) {}
}
function applyDocMeta(){
  if (!window.KB || !window.KB.docs) return;
  var all = getDocMeta();
  for (var i = 0; i < window.KB.docs.length; i++){
    var d = window.KB.docs[i], m = all[d.id];
    if (!m) continue;
    if (typeof m.chamber === "number") d.chamber = m.chamber;
    if (m.access) d.access = m.access;
    if (m.category) d.category = m.category;
  }
}

var ACCESS_CIRCLES = [
  { key:"all",     title:"Mindenki" },
  { key:"hr",      title:"HR-kör" },
  { key:"penzugy", title:"Pénzügyi kör" },
  { key:"vezetoi", title:"Vezetői kör" }
];
