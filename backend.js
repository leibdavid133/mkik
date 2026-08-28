/* ============================================================================
   Kamarai Tudástár - backend-kliens
   Közös napló és e-mail értesítések. A rendszer backend nélkül is teljes
   értékű: ha a végpont nem elérhető, minden marad a böngészőben, és a
   felületen semmi nem törik el. A demó így hálózat nélkül is megy.

   Titok nincs ebben a fájlban. A functionök --no-verify-jwt módban futnak,
   a szolgáltatói kulcs a Supabase környezetében marad.
   ============================================================================ */

var BACKEND = {
  url:     "https://yrddksgtictcpkqnguko.supabase.co/functions/v1",
  timeout: 2500,
  /* Alapból KI: adatvédelmi témájú belső rendszernél igaz állítás kell arról,
     hogy alapértelmezés szerint semmi nem hagyja el a gépet. Az adminban egy
     kattintással bekapcsolható, ha a többgépes közös napló kell. */
  on:      false
};

var BACKEND_KEY = "mkik_backend_v1";

/* Az admin felületen kikapcsolható - rossz wifi mellett ez menti meg a bemutatót. */
(function(){
  try {
    var s = JSON.parse(localStorage.getItem(BACKEND_KEY) || "null");
    if (s && typeof s.on === "boolean") BACKEND.on = s.on;
    if (s && s.url) BACKEND.url = s.url;
  } catch (e) {}
})();

function backendSet(patch){
  if (typeof patch.on === "boolean") BACKEND.on = patch.on;
  if (patch.url) BACKEND.url = patch.url;
  try { localStorage.setItem(BACKEND_KEY, JSON.stringify({ on: BACKEND.on, url: BACKEND.url })); } catch (e) {}
}

function backendOn(){ return BACKEND.on && !!BACKEND.url; }

/* Egyetlen POST. Sosem dob: hiba esetén cb(hibaszöveg, null). */
function backendPost(fn, payload, cb){
  cb = cb || function(){};
  if (!backendOn()) return cb("kikapcsolva", null);

  var done = false;
  var timer = window.setTimeout(function(){
    if (!done){ done = true; cb("időtúllépés", null); }
  }, BACKEND.timeout);

  try {
    fetch(BACKEND.url + "/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    })
    .then(function(res){ return res.json().then(function(j){ return { ok: res.ok, body: j }; }); })
    .then(function(r){
      if (done) return;
      done = true; window.clearTimeout(timer);
      if (!r.ok) return cb((r.body && r.body.error) || "hiba", null);
      cb(null, r.body);
    })
    .catch(function(err){
      if (done) return;
      done = true; window.clearTimeout(timer);
      cb(String(err && err.message ? err.message : err), null);
    });
  } catch (e){
    done = true; window.clearTimeout(timer);
    cb(String(e), null);
  }
}

/* ---------------------------------------------------------------- napló */

/* Kérdés-esemény rögzítése. Tűzz-és-felejtsd: a felület nem vár rá. */
function backendLog(row, cb){
  backendPost("mkik-log", { action: "insert", row: row }, cb || function(){});
}

/* A közös napló utolsó N sora - más gépekről is. */
function backendLogList(limit, cb){
  backendPost("mkik-log", { action: "list", limit: limit || 200 }, cb);
}

/* ---------------------------------------------------------------- értesítés */

/* Fedezet nélküli kérdés -> e-mail a szabályzat felelősének.
   A szórásvédelem (ismétlés- és óradarab-korlát) a functionben van. */
function backendNotifyGap(payload, cb){
  backendPost("mkik-notify", {
    action:  "gap",
    query:   payload.query,
    user:    payload.user,
    chamber: payload.chamber,
    near:    payload.near || [],
    manual:  !!payload.manual
  }, cb);
}

/* Új dokumentum-verzió közzététele -> értesítés mindenkinek, aki a régiből kapott választ. */
function backendPublishVersion(payload, cb){
  backendPost("mkik-notify", {
    action:    "deprecate",
    docId:     payload.docId,
    docTitle:  payload.docTitle,
    version:   payload.version,
    effective: payload.effective,
    note:      payload.note,
    by:        payload.by
  }, cb);
}
