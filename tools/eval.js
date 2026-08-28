/* ============================================================================
   Kamarai Tudástár - kiértékelő

   Nem elég, hogy a rendszer működik: meg kell tudni mondani, MENNYIRE.
   Ez a szkript egy rögzített kérdéskészleten futtatja a keresőt, és
   megmutatja, hány magabiztos tévedés marad benne - ez a kiírás szerint a
   legdrágább hiba: "a magabiztosan előadott téves válasz többe kerül, mint a
   meg nem válaszolt kérdés".

   Futtatás:
     cd tools && npm i jsdom      (egyszer)
     node tools/eval.js
   ============================================================================ */
const fs = require("fs"), path = require("path");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) {
  try { ({ JSDOM } = require(path.join(process.env.HOME,
    ".npm-jsdom/node_modules/jsdom"))); }
  catch (e2) { console.error("Hiányzik a jsdom. Telepítés: npm i jsdom"); process.exit(2); }
}

const ROOT = path.dirname(__dirname);

/* ---------------------------------------------------------------- kérdéskészlet
   Úgy kérdez, ahogy egy ügyintéző kérdezne - nem a szabályzat szavaival.
   elvart: melyik dokumentumból KELL jönnie a válasznak, vagy null, ha
   a helyes viselkedés az, hogy a rendszer nemet mond. */
const GOLD = [
  // --- Beszerzési Szabályzat
  { q: "ki írhatja alá a szerződést a kamara nevében",        d: "bsz-2026-01" },
  { q: "hány ajánlatot kell bekérni egy nagyobb vásárlásnál", d: "bsz-2026-01" },
  { q: "800 ezer forintos beszerzésnél mi a teendő",          d: "bsz-2026-01" },
  { q: "lehet-e csak egy céget megkérdezni",                  d: "bsz-2026-01" },
  { q: "ki ellenőrzi hogy van-e rá keret",                    d: "bsz-2026-01" },
  { q: "mi van ha a beszállító a rokonom",                    d: "bsz-2026-01" },
  { q: "kell-e közbeszerzést kiírni",                         d: "bsz-2026-01" },
  // --- Dokumentumkezelési Szabályzat
  { q: "mennyi ideig kell megőrizni az iratokat",             d: "dksz-2026-01" },
  { q: "ki bonthatja fel a beérkező leveleket",               d: "dksz-2026-01" },
  { q: "hogyan épül fel az iktatószám",                       d: "dksz-2026-01" },
  { q: "ki írhatja alá a kimenő levelet",                     d: "dksz-2026-01" },
  { q: "mikor kell iktatni egy beérkezett levelet",           d: "dksz-2026-01" },
  { q: "hogyan kell selejtezni a régi iratokat",              d: "dksz-2026-01" },
  // --- Adatkezelési Szabályzat
  { q: "mi a teendő ha adat szivárgott ki",                   d: "aksz-2026-01" },
  { q: "meddig kell válaszolni egy adatigénylésre",           d: "aksz-2026-01" },
  { q: "ki a kamara adatvédelmi felelőse",                    d: "aksz-2026-01" },
  { q: "küldhetünk-e adatot külföldre",                       d: "aksz-2026-01" },
  { q: "milyen jogai vannak az érintettnek",                  d: "aksz-2026-01" },
  // --- IT Biztonsági Szabályzat
  { q: "milyen hosszú legyen a jelszó",                       d: "itbsz-2026-01" },
  { q: "használhatom a saját laptopomat munkára",             d: "itbsz-2026-01" },
  { q: "mi a teendő adathalász levél esetén",                 d: "itbsz-2026-01" },
  { q: "ki kaphat rendszergazdai jogosultságot",              d: "itbsz-2026-01" },
  // --- fedezetlen: itt a "nem tudom" a helyes válasz
  { q: "hány nap szabadság jár a munkatársaknak",             d: null },
  { q: "mennyi a cafeteria keret",                            d: null },
  { q: "ki dönt a béremelésről",                              d: null },
  { q: "milyen céges telefont igényelhetek",                  d: null },
  { q: "hány óra a törzsidő",                                 d: null },
  { q: "jár-e home office a munkatársaknak",                  d: null },
];

/* ---------------------------------------------------------------- oldal betöltése */
function load(cb) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<link[^>]+https?:\/\/[^>]*>/g, "")
    .replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
      const p = path.join(ROOT, src);
      if (!fs.existsSync(p)) return "";
      /* a beemelt kód nem törheti meg a <script> blokkot */
      return "<script>\n" + fs.readFileSync(p, "utf8").replace(/<\/script/g, "<\\/script") + "\n</script>";
    });

  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://mkik.test/",
    beforeParse(w) {
      w.localStorage.setItem("mkik_backend_v1", JSON.stringify({ on: false }));
      w.localStorage.setItem("mkik_kb_session_v1",
        JSON.stringify({ id: "admin", at: new Date().toISOString(), chamber: 0 }));
      w.fetch = () => Promise.reject(new Error("offline"));
      w.scrollTo = () => {};
      w.console.error = () => {};
    },
  });
  setTimeout(() => cb(dom.window), 400);
}

/* ---------------------------------------------------------------- mérés */
function measure(w, useCouncil) {
  /* A tanács a search()/verdictOf() köré épül, ezért az alapmérés csak úgy
     lehetséges, ha ténylegesen kikapcsoljuk. */
  w.COUNCIL.on = useCouncil;
  w.COUNCIL.decide = useCouncil;

  const out = { valaszolt: 0, jo: 0, magabiztosTeved: 0, hamisIgen: 0,
                helyesNem: 0, fedezett: 0, fedezetlen: 0, ms: 0, sorok: [] };
  const t0 = process.hrtime.bigint();

  for (const g of GOLD) {
    const r = w.search(g.q);
    let verdict = w.verdictOf(r);
    let top = r.hits[0] ? r.hits[0].e.c : null;
    let swapped = false, agree = null;

    if (useCouncil && r._council) {
      agree = r._council.agree;
      swapped = !!(r._adj && r._adj.swapped);
    }

    if (g.d === null) {
      out.fedezetlen++;
      if (verdict === "none") out.helyesNem++; else out.hamisIgen++;
      out.sorok.push({ q: g.q, vart: "nem tudom", verdict, kapott: top ? w.docOf(top.d).title : "-",
                       ok: verdict === "none", agree, swapped });
      continue;
    }

    out.fedezett++;
    const ok = top && top.d === g.d;
    if (verdict !== "none") {
      out.valaszolt++;
      if (ok) out.jo++;
      else if (verdict === "strong") out.magabiztosTeved++;
    }
    out.sorok.push({ q: g.q, vart: g.d, verdict, kapott: top ? w.docOf(top.d).title : "-",
                     ok: verdict !== "none" && ok, agree, swapped });
  }

  out.ms = Number(process.hrtime.bigint() - t0) / 1e6 / GOLD.length;
  return out;
}

const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "-";

load((w) => {
  w.KB.docs.forEach((d) => (d.chamber = 0));   /* tiszta visszakeresés-mérés */

  const elotte = measure(w, false);
  const utana  = typeof w.council === "function" ? measure(w, true) : null;
  w.COUNCIL.on = true; w.COUNCIL.decide = true;

  console.log("\n=== KÉRDÉSENKÉNT ===\n");
  const rows = utana ? utana.sorok : elotte.sorok;
  rows.forEach((s, i) => {
    const b = elotte.sorok[i];
    const jel = s.ok ? "  jó " : "ROSSZ";
    const valt = utana && b.ok !== s.ok ? (s.ok ? "  <-- JAVULT" : "  <-- ROMLOTT") : "";
    console.log(jel, "|", String(s.verdict).padEnd(6), "|",
                (s.agree !== null ? (s.agree + "/5") : "   ").padEnd(4), "|",
                String(s.kapott).slice(0, 24).padEnd(25), "|", s.q.slice(0, 42).padEnd(43), valt);
  });

  const tab = (n, e, u, jobbHaKisebb) => {
    const szam = typeof e === "number" && typeof u === "number";
    const arrow = (u === null || u === undefined) ? ""
      : (String(e) === String(u) ? "  =" : (szam ? ((u < e) === !!jobbHaKisebb ? "  JAVULT" : "  ROMLOTT") : "  ->"));
    console.log("  " + n.padEnd(34) + String(e).padStart(8) + (u !== null ? String(u).padStart(10) : "") + arrow);
  };

  console.log("\n=== ÖSSZESÍTÉS ===\n");
  console.log("  " + "".padEnd(34) + "előtte".padStart(8) + (utana ? "utána".padStart(10) : ""));
  tab("magabiztos tévedés", elotte.magabiztosTeved, utana && utana.magabiztosTeved, true);
  tab("hamis igen (fedezetlenre)", elotte.hamisIgen, utana && utana.hamisIgen, true);
  tab("válaszolt / fedezett", elotte.valaszolt + "/" + elotte.fedezett,
      utana && (utana.valaszolt + "/" + utana.fedezett));
  tab("ebből helyes dokumentum", elotte.jo, utana && utana.jo, false);
  tab("válaszoltak pontossága", pct(elotte.jo, elotte.valaszolt),
      utana && pct(utana.jo, utana.valaszolt));
  tab("helyes nem (fedezetlenre)", elotte.helyesNem + "/" + elotte.fedezetlen,
      utana && (utana.helyesNem + "/" + utana.fedezetlen));
  tab("egy kérdés futásideje", elotte.ms.toFixed(1) + " ms",
      utana && (utana.ms.toFixed(1) + " ms"));
  console.log("");
});
