/* ============================================================================
   Megkeresések — híd a Kamarai Tudástár keresőjéhez.

   Az INTEGRACIO.md szerint a window.MEGKERESESEK-et a modul betöltése ELŐTT
   kell beállítani, ezért ez a fájl a megkeresesek.js elé kerül.

   A lényeg: a modul JSON-sémáját nyelvi modell NÉLKÜL töltjük ki. A séma
   pontosan azt kéri, amit a keresőnk amúgy is ad — szó szerinti idézetet,
   dokumentumot, oldalszámot, és null-t ott, ahol nincs fedezet. A levélbe
   így vagy forrásazonosítóval ellátott, szó szerinti részlet kerül, vagy
   megjelölt hiány. A kitalálás nem tiltva van, hanem szerkezetileg
   lehetetlen. Költség: 0 Ft / megkeresés.

   Ha később lesz API-kulcs, a feldolgoz() belseje cserélhető LLM-hívásra
   ugyanezzel a sémával — a modul felé semmi nem változik.
   ============================================================================ */
(function () {
  'use strict';

  /* Mezőnkénti kulcsszavak: ezekkel egészítjük ki a megkeresés saját
     kulcsszavait, hogy a négy alkérdés a megfelelő rendelkezést találja meg. */
  var MEZO_SZAVAK = {
    hatarido:    "határidő munkanap napon belül elbírálás",
    jovahagyo:   "jóváhagyó jóváhagyás dönt hatáskör engedély aláírás",
    nyomtatvany: "nyomtatvány igénybejelentő űrlap melléklet formanyomtatvány",
    iktatas:     "iktatás iktatni nyilvántartásba érkeztetés irattár"
  };

  var MEZO_MONDAT = {
    hatarido:    "A vonatkozó határidőről a szabályzat így rendelkezik: ",
    jovahagyo:   "A jóváhagyási jogkörről a szabályzat így rendelkezik: ",
    nyomtatvany: "A benyújtandó dokumentumokról a szabályzat így rendelkezik: ",
    iktatas:     "Az iktatás rendjéről a szabályzat így rendelkezik: "
  };

  var MEZO_CIMKE = {
    hatarido: "határidő", jovahagyo: "jóváhagyó",
    nyomtatvany: "nyomtatvány", iktatas: "iktatás"
  };

  /* ---------------------------------------------------------------- feladó */
  function feladoAdatok(szoveg) {
    var out = { felado: null, ceg: null, email: null };

    var em = szoveg.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (em) out.email = em[0];

    var ceg = szoveg.match(/([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]*(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]*)*)\s+(Kft|Bt|Zrt|Nyrt|Kkt|Kht|Nonprofit Kft)\.?/);
    if (ceg) out.ceg = (ceg[1] + " " + ceg[2] + ".").replace(/\s+/g, " ").trim();

    /* "Nevem X", "X vagyok", vagy az elköszönés utáni sor */
    var nev = szoveg.match(/Nevem\s+([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+)+)/);
    if (!nev) nev = szoveg.match(/([A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(?:\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+)+)\s+vagyok/);
    if (!nev) {
      var zaro = szoveg.match(/(?:Üdvözlettel|Köszönettel|Tisztelettel)[,!]?\s*\n+\s*([^\n]+)/i);
      if (zaro) {
        var jelolt = zaro[1].trim();
        if (/^[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+(\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+)+$/.test(jelolt)) {
          out.felado = jelolt;
        }
      }
    } else {
      out.felado = nev[1];
    }
    return out;
  }

  /* ------------------------------------------------------- kulcsszó-kivonat
     A megkeresés legritkább (leginformatívabb) szavai a saját indexünk
     dokumentumgyakorisága alapján. Ezekre fókuszálnak az alkérdések. */
  function kulcsszavak(szoveg, db) {
    if (typeof tokens !== "function" || !window.IDX || !IDX.N) return szoveg;
    var ts = tokens(szoveg), latott = {}, lista = [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t.length < 4 || latott[t]) continue;
      latott[t] = 1;
      lista.push({ t: t, df: IDX.df[t] || 0 });
    }
    /* a korpuszban nem szereplő szó nem visz előre; a ritka annál inkább */
    lista = lista.filter(function (x) { return x.df > 0; });
    lista.sort(function (a, b) { return a.df - b.df; });
    return lista.slice(0, db || 6).map(function (x) { return x.t; }).join(" ");
  }

  /* Táblázatsornál a mezőnek pontosan megfelelő oszlop értéke a válasz. */
  var TABLA_OSZLOP = {
    jovahagyo:   ["jóváhagyó"],
    nyomtatvany: ["kötelező dokumentum"],
    hatarido:    ["határidő"],
    iktatas:     ["iktatás"]
  };

  /* ------------------------------------------------------- idézet kivágása
     Csak akkor ad vissza értéket, ha a részlet TÉNYLEGESEN tartalmazza a
     mező valamelyik kulcsszavát. Ha nem, null - vagyis nincs fedezet.
     Így nem kerül a "Határidő" mezőbe egy szerződéskötésről szóló mondat. */
  function idezetKivag(chunk, mezo) {
    var mezoSzavak = MEZO_SZAVAK[mezo].split(" ").filter(function (w) { return w.length > 3; });

    function tartalmaz(szoveg) {
      var alsó = szoveg.toLowerCase();
      for (var i = 0; i < mezoSzavak.length; i++) {
        if (alsó.indexOf(mezoSzavak[i].slice(0, 5)) >= 0) return true;
      }
      return false;
    }

    if (chunk.k === "table" && typeof tablaMezok === "function") {
      var mez = tablaMezok(chunk.t), oszlopok = TABLA_OSZLOP[mezo] || [];
      for (var o = 0; o < oszlopok.length; o++) {
        if (mez[oszlopok[o]]) return mez[oszlopok[o]];
      }
      return null;
    }

    var mondatok = (typeof mondatokra === "function") ? mondatokra(chunk.t) : [chunk.t];
    var legjobb = null, legjobbPont = 0;
    for (var i = 0; i < mondatok.length; i++) {
      if (!tartalmaz(mondatok[i])) continue;
      var pont = 1 + (/\d/.test(mondatok[i]) ? 0.5 : 0);
      if (pont > legjobbPont) { legjobbPont = pont; legjobb = mondatok[i]; }
    }
    if (!legjobb) return null;
    legjobb = legjobb.trim().replace(/\s+/g, " ");
    if (!/[.!?]$/.test(legjobb)) legjobb += ".";
    return legjobb.length > 260 ? legjobb.slice(0, 257) + "…" : legjobb;
  }

  /* A találat akkor tartozik a megkereséshez, ha legalább egy kulcsszava
     szerepel benne - különben csak a mezőszó miatt jött be. */
  function temahozTartozik(chunk, kulcsok) {
    if (!kulcsok) return true;
    var szoveg = (chunk.t + " " + (chunk.s || "") + " " + (chunk.l || "")).toLowerCase();
    var lista = kulcsok.split(" ");
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].length > 3 && szoveg.indexOf(lista[i].slice(0, 5)) >= 0) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- források */
  function forrasGyujto() {
    var lista = [], indexPerChunk = {};
    return {
      lista: lista,
      /* Ugyanaz a szövegrész csak egyszer kerül be, ugyanazzal az id-val. */
      felvesz: function (chunk) {
        if (indexPerChunk[chunk.i]) return indexPerChunk[chunk.i];
        var d = docOf(chunk.d);
        var id = "f" + (lista.length + 1);
        indexPerChunk[chunk.i] = id;
        lista.push({
          id: id,
          dokumentum: d.title + (chunk.s ? " · " + chunk.s : ""),
          oldal: chunk.p,
          datum: d.effective || null,
          idezet: chunk.t,
          chunk: chunk.i          /* ezzel nyitja meg a modul a fő app forrásnézetét */
        });
        return id;
      }
    };
  }

  /* ------------------------------------------------------- felismerés
     Hosszú levélnél a szakaszonkénti pontszám félrevezet: a BM25 azt a
     dokumentumot bünteti, amelyikben a téma szava gyakori (egy adatvédelmi
     levélre így a beszerzési szabályzat jönne be). Ezért előbb dokumentumot
     választunk a találatok összesített pontszáma alapján, és csak azon belül
     keressük a legjobb szakaszt. */
  function valaszoloSzakasz(szoveg) {
    var r = search(szoveg, 60);
    if (!r.hits.length) return null;

    /* Az összeg a nagyobb dokumentumot részesítené előnyben, ezért a
       legjobb szakasz pontszáma dönt, a következő kettő csak kiegészít. */
    var pontPerDok = {}, dbPerDok = {}, elsoPerDok = {};
    for (var i = 0; i < r.hits.length; i++) {
      var d = r.hits[i].e.c.d;
      dbPerDok[d] = (dbPerDok[d] || 0) + 1;
      if (dbPerDok[d] === 1){ pontPerDok[d] = r.hits[i].score; elsoPerDok[d] = r.hits[i].score; }
      else if (dbPerDok[d] <= 3) pontPerDok[d] += r.hits[i].score * 0.3;
    }
    var legjobbDok = null, legjobbPont = 0;
    for (var k in pontPerDok) {
      if (!pontPerDok.hasOwnProperty(k)) continue;
      if (pontPerDok[k] > legjobbPont) { legjobbPont = pontPerDok[k]; legjobbDok = k; }
    }
    for (var j = 0; j < r.hits.length; j++) {
      if (r.hits[j].e.c.d === legjobbDok) {
        return { chunk: r.hits[j].e.c, pont: elsoPerDok[legjobbDok], dokPont: legjobbPont,
                 dokTalalat: dbPerDok[legjobbDok], r: r };
      }
    }
    return null;
  }

  /* ------------------------------------------------------- a válaszoló szakasz
     A kártya nem négy külön keresésből áll össze, hanem abból a §-ból, amelyik
     ténylegesen válaszol a megkeresésre. Így nem kerülhet a "Határidő" mezőbe
     egy másik témájú rendelkezés: ami a szakaszban nincs benne, az "nincs
     fedezet". Ez kevesebb kitöltött mezőt ad, cserébe mindegyik igaz. */
  function szakaszDarabjai(chunk) {
    var out = [chunk];
    if (!window.KB || !KB.chunks) return out;
    for (var i = 0; i < KB.chunks.length; i++) {
      var c = KB.chunks[i];
      if (c.i !== chunk.i && c.d === chunk.d && c.s && c.s === chunk.s) out.push(c);
    }
    return out;
  }

  function mezoAszakaszbol(darabok, mezo) {
    for (var i = 0; i < darabok.length; i++) {
      var ertek = idezetKivag(darabok[i], mezo);
      if (ertek) return { chunk: darabok[i], ertek: ertek };
    }
    return null;
  }

  /* ---------------------------------------------------------------- feldolgozás */
  async function feldolgoz(szoveg) {
    if (!window.IDX || !IDX.N) {
      throw new Error("A dokumentum-index még nem töltődött be.");
    }

    var beerkezett = feladoAdatok(szoveg);
    var kulcsok = kulcsszavak(szoveg, 6);
    var forrasok = forrasGyujto();

    /* --- felismerés --- */
    var fo = valaszoloSzakasz(szoveg);
    /* Elfogadjuk, ha a nyertes dokumentum érdemi tömeggel jött be: legalább
       három találat és értelmes összpontszám. Különben nincs fedezet. */
    var elfogad = !!(fo && fo.pont >= 7 && fo.dokTalalat >= 2);
    var felismeres;
    if (!elfogad) {
      felismeres = {
        ugytipus: "nem azonosítható ügytípus",
        indoklas: "A megkeresés tartalmához a betöltött szabályzatokban nem találtam kapcsolódó rendelkezést.",
        forras: null
      };
    } else {
      var foChunk = fo.chunk;
      var foDoc = docOf(foChunk.d);
      felismeres = {
        ugytipus: (foChunk.s || foDoc.title).replace(/^\d+\.\s*§\s*/, ""),
        indoklas: "A megkeresés a(z) " + foDoc.title + " " + (foChunk.s || "") +
                  " rendelkezéséhez illeszkedik" +
                  (fo.pont < 7 ? ", de az illeszkedés gyenge — érdemes ellenőrizni." : "."),
        forras: forrasok.felvesz(foChunk)
      };
    }

    /* --- kártya: a válaszoló szakasz alapján --- */
    var darabok = elfogad ? szakaszDarabjai(fo.chunk) : [];
    var kartya = {}, hianyzo = [];
    ["hatarido", "jovahagyo", "nyomtatvany", "iktatas"].forEach(function (mezo) {
      var tal = darabok.length ? mezoAszakaszbol(darabok, mezo) : null;
      if (!tal) { kartya[mezo] = null; hianyzo.push(MEZO_CIMKE[mezo]); return; }
      kartya[mezo] = { ertek: tal.ertek, forras: forrasok.felvesz(tal.chunk) };
      if (mezo === "hatarido") kartya[mezo].datum = null;
    });

    /* --- levél --- */
    var mondatok = [{ szoveg: "Köszönjük megkeresését.", forras: null }];

    if (felismeres.forras) {
      mondatok.push({
        szoveg: "Megkeresését " + felismeres.ugytipus.toLowerCase() + " tárgyú ügyként azonosítottuk.",
        forras: null,
        uj_bekezdes: true
      });
      /* A lényegi válasz: ugyanaz a megfogalmazás, amit a Kérdezés nézet ad. */
      if (typeof valaszSzoveg === "function") {
        mondatok.push({
          szoveg: valaszSzoveg(fo.chunk, fo.r),
          forras: felismeres.forras
        });
      }
    }

    ["hatarido", "nyomtatvany", "jovahagyo", "iktatas"].forEach(function (mezo) {
      if (!kartya[mezo]) return;
      mondatok.push({
        szoveg: MEZO_MONDAT[mezo] + "„" + kartya[mezo].ertek + "”",
        forras: kartya[mezo].forras,
        uj_bekezdes: true
      });
    });

    if (hianyzo.length) {
      mondatok.push({
        szoveg: "A következőkre a hatályos szabályzatokban nem találtam fedezetet: " + hianyzo.join(", ") + ". ",
        hiany: "ezt a részt a szabályzat felelősével kell kiegészíteni, mielőtt a levél kimegy",
        uj_bekezdes: true
      });
    }

    var targyAlap = felismeres.forras ? felismeres.ugytipus : "kamarai megkeresés";
    return {
      beerkezett: beerkezett,
      felismeres: felismeres,
      kartya: kartya,
      level: {
        targy: "Válasz megkeresésére – " + targyAlap,
        megszolitas: beerkezett.felado ? ("Tisztelt " + beerkezett.felado + "!") : "Tisztelt Címzett!",
        mondatok: mondatok,
        elkoszones: "Üdvözlettel,\nMagyar Kereskedelmi és Iparkamara"
      },
      forrasok: forrasok.lista
    };
  }

  window.MEGKERESESEK = { feldolgoz: feldolgoz };

  /* A jóváhagyott levél bekerül a meglévő naplóba, hogy az Előzményekben és
     az admin naplóban is visszakereshető legyen, ki mire hivatkozva küldött
     választ a kamara nevében. */
  document.addEventListener("megkeresesek-jovahagyva", function (ev) {
    if (typeof logEvent !== "function") return;
    var d = ev.detail || {};
    var cimzett = (d.cimzett && (d.cimzett.nev || d.cimzett.email)) || "ismeretlen címzett";
    var elso = (d.forrasok && d.forrasok.length) ? d.forrasok[0] : null;
    logEvent("Megkeresés megválaszolva – " + cimzett + (d.ugytipus ? " (" + d.ugytipus + ")" : ""),
             "ok", elso ? { doc: elso.dokumentum, page: elso.oldal, section: null } : null);
    if (typeof toast === "function") toast("A válasz naplózva az Előzményekben.");
  });
})();
