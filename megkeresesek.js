/* ==========================================================================
   Megkeresések modul — egyetlen fájl, nulla függőség, nincs build step.
   Beágyazás:
     <div id="megkeresesek"></div>
     <script src="megkeresesek.js"></script>
   A fő app a script betöltése ELŐTT állíthatja be:
     window.MEGKERESESEK = { feldolgoz: async (szoveg) => {...JSON...} };
   Ha ez hiányzik, a modul demó módban fut a beépített mintaadattal.
   Gyors ellenőrzéshez: window.MEGKERESESEK_TESZT(sajatJson) a konzolban.
   Részletek: INTEGRACIO.md

   MKIK-változat: a stílusblokk a Kamarai Tudástár arculati tokenjeire épül
   (világos és sötét módban is), a mintaadat pedig a betöltött négy
   szabályzatra íródott. A .megk- osztályszerkezet és a HTML változatlan,
   így az INTEGRACIO.md szerződése érvényben marad.
   ========================================================================== */
(function () {
  'use strict';

  var MOUNT_ID = 'megkeresesek';
  var ALLOMASOK = ['Beérkezett', 'Felismerve', 'Szabály', 'Válasz', 'Kiküldhető'];
  var KARTYA_MEZOK = [
    { kulcs: 'hatarido', cimke: 'Határidő' },
    { kulcs: 'jovahagyo', cimke: 'Jóváhagyó' },
    { kulcs: 'nyomtatvany', cimke: 'Nyomtatvány' },
    { kulcs: 'iktatas', cimke: 'Iktatás' }
  ];

  // ------------------------------------------------------------------------
  // Beépített demó mintaadat. Csak akkor jut szerephez, ha a fő app nem
  // állította be a window.MEGKERESESEK-et. A bemeneti szövegek a valódi
  // korpuszunkra (Beszerzési, Adatkezelési, Dokumentumkezelési, IT
  // Biztonsági Szabályzat) íródtak, hogy a legördülő példák élesben is
  // értelmes találatot adjanak.
  // ------------------------------------------------------------------------
  var BEEPITETT_MINTAK = [
    {
      cim: 'Beszerzési értékhatár — árajánlat',
      bemenet:
        'Tisztelt Kamara!\n\n' +
        'Nevem Kovács Péter, a Példa Kft. (kovacs@pelda.hu) ügyvezetője vagyok. ' +
        'Egy 8 millió forint értékű informatikai fejlesztésre szeretnénk ajánlatot adni ' +
        'a kamara részére. Kérdésem, hogy ilyen értéknél hány ajánlatot kérnek be, ' +
        'ki hagyja jóvá a döntést, és milyen dokumentumokat kell benyújtanunk.\n\n' +
        'Üdvözlettel,\nKovács Péter'
    },
    {
      cim: 'Érintetti adatkérelem (GDPR)',
      bemenet:
        'Tisztelt Adatvédelmi Tisztviselő!\n\n' +
        'Szabó Anna vagyok (szabo.anna@zoldulet.hu). Szeretném megtudni, milyen ' +
        'személyes adatokat kezelnek rólam, és kérem ezek törlését. ' +
        'Mennyi idő alatt válaszolnak egy ilyen kérelemre?\n\n' +
        'Köszönettel,\nSzabó Anna'
    },
    {
      cim: 'Iratbetekintés és megőrzés',
      bemenet:
        'Tisztelt Kamara!\n\n' +
        'Nagy Béla vagyok a Ferro-Tech Kft.-től (nagy.bela@ferrotech.hu). ' +
        'Egy 2019-es ügyünk iratanyagára lenne szükségünk. Meddig őrzik meg az ' +
        'iratokat, hogyan kell iktatni a kérelmemet, és kinek kell aláírnia?\n\n' +
        'Üdvözlettel,\nNagy Béla'
    },
    {
      cim: 'Részben fedezetlen eset — parkolás és cafeteria',
      bemenet:
        'Tisztelt Kamara!\n\n' +
        'Tóth Gergely vagyok (toth.gergely@indulo.hu). Jövő héten személyesen ' +
        'behoznám a beszerzési ajánlatunkat. Hol tudok parkolni az épületnél, ' +
        'és jár-e a partnereknek cafeteria-kedvezmény?\n\n' +
        'Üdvözlettel,\nTóth Gergely'
    }
  ];

  // ------------------------------------------------------------------------
  // Stílus injektálás — a Kamarai Tudástár tokenjeire kötve.
  // Minden szín a fő app CSS-változóiból jön, ezért a sötét mód
  // automatikusan működik, külön szabály nélkül.
  // ------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('megk-stilus')) return;
    var s = document.createElement('style');
    s.id = 'megk-stilus';
    s.textContent = [
      '.megk-root{',
      '  --megk-bg:var(--bg-soft-2,#F7F8F9); --megk-fg:var(--ink,#373737);',
      '  --megk-akcent:var(--mkik-green,#346B54); --megk-vonal:var(--line,#E0DDD6);',
      '  --megk-halvany:var(--ink-faint,#949494); --megk-lagy:var(--ink-soft,#6B6B6B);',
      '  --megk-feher:var(--surface,#fff);',
      '  --megk-hianyzo:rgba(184,135,59,.16); --megk-hianyzo-szoveg:#8A5A00;',
      '  --megk-kiemeles:var(--mark,#FBF0CE);',
      '  font-family:var(--sans,"Open Sans",Arial,sans-serif);',
      '  color:var(--megk-fg); font-size:.875rem; line-height:1.55;',
      '  box-sizing:border-box;',
      '}',
      '[data-theme="dark"] .megk-root{--megk-hianyzo-szoveg:#D8AE68;}',
      '.megk-root *{box-sizing:border-box;}',
      '.megk-fejlec{margin-bottom:16px;}',
      '.megk-cim{display:none;}',                 /* az oldalcímet az aloldal-fej adja */
      '.megk-allitas{margin:0; font-size:.94rem; color:var(--megk-lagy); max-width:65ch;}',
      '.megk-demo-jelzo{display:inline-block; margin-top:8px; font-family:var(--cond,inherit);',
      '  font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px;',
      '  background:var(--megk-hianyzo); color:var(--megk-hianyzo-szoveg);',
      '  border:1px solid var(--megk-vonal); padding:3px 9px;}',

      /* ---- állomássor ---- */
      '.megk-utvonal{display:flex; align-items:stretch; list-style:none; margin:0 0 18px; padding:0;',
      '  border:1px solid var(--megk-vonal); background:var(--megk-feher); overflow:hidden;}',
      '.megk-allomas{flex:1 1 0; min-width:0; display:flex; align-items:center; gap:9px; padding:11px 13px;',
      '  border-right:1px solid var(--megk-vonal); color:var(--megk-halvany);',
      '  transition:background-color .2s ease,color .2s ease;}',
      '.megk-allomas:last-child{border-right:none;}',
      '.megk-allomas-szam{flex:0 0 auto; width:22px; height:22px; border-radius:50%;',
      '  border:1px solid var(--megk-vonal); display:flex; align-items:center; justify-content:center;',
      '  font-family:var(--cond,inherit); font-size:.72rem; font-weight:700;',
      '  transition:background-color .2s ease,border-color .2s ease,color .2s ease;}',
      '.megk-allomas-nev{font-family:var(--cond,inherit); font-size:.8rem; font-weight:700;',
      '  text-transform:uppercase; letter-spacing:.3px; min-width:0; overflow:hidden;',
      '  text-overflow:ellipsis; white-space:nowrap;}',
      '@container megk (max-width: 560px){',
      '  .megk-allomas{padding:8px 6px; gap:5px;}',
      '  .megk-allomas-nev{font-size:.72rem;}',
      '  .megk-allomas-szam{width:18px; height:18px; font-size:.65rem;}',
      '}',
      '.megk-allomas.megk-kesz{color:var(--megk-fg); background:rgba(93,180,124,.1);}',
      '.megk-allomas.megk-kesz .megk-allomas-szam{background:var(--megk-akcent);',
      '  border-color:var(--megk-akcent); color:#fff;}',
      '.megk-allomas.megk-aktiv{color:var(--megk-fg); background:var(--megk-feher);}',
      '.megk-allomas.megk-aktiv .megk-allomas-szam{border-color:var(--megk-akcent); color:var(--megk-akcent);}',

      /* ---- panelek ---- */
      '.megk-panel{background:var(--megk-feher); border:1px solid var(--megk-vonal);',
      '  padding:16px 18px; margin-bottom:14px;}',
      '.megk-panel-cim{font-family:var(--cond,inherit); font-size:.72rem; font-weight:700;',
      '  text-transform:uppercase; letter-spacing:.6px; color:var(--megk-lagy); margin:0 0 11px;}',
      '.megk-textarea{width:100%; min-height:132px; resize:vertical; padding:12px 13px;',
      '  font-size:.94rem; font-family:inherit; border:1px solid var(--megk-vonal);',
      '  border-radius:2px; color:var(--megk-fg); background:var(--bg,#fff); line-height:1.6;}',
      '.megk-textarea:focus{outline:2px solid var(--megk-akcent); outline-offset:-1px;}',
      '.megk-gombsor{display:flex; gap:9px; margin-top:11px; flex-wrap:wrap; align-items:center;}',
      '.megk-gomb{display:inline-flex; align-items:center; justify-content:center;',
      '  font-family:var(--cond,inherit); font-size:.8rem; font-weight:700; text-transform:uppercase;',
      '  letter-spacing:.4px; height:38px; padding:0 16px; border-radius:2px;',
      '  border:1px solid var(--megk-vonal); background:var(--megk-feher);',
      '  color:var(--megk-akcent); cursor:pointer; transition:border-color .15s ease;}',
      '.megk-gomb:hover{border-color:var(--megk-akcent);}',
      '.megk-gomb:disabled{opacity:.45; cursor:not-allowed;}',
      '.megk-gomb-elsodleges{background:var(--megk-akcent); border-color:var(--megk-akcent); color:#fff;}',
      '.megk-gomb-elsodleges:hover{background:var(--mkik-green-dark,#2B5847);}',
      '.megk-gomb-elsodleges:active{transform:translateY(1px);}',
      '.megk-gomb-diktalas.megk-diktal-aktiv{background:var(--mkik-red,#C63F3F);',
      '  border-color:var(--mkik-red,#C63F3F); color:#fff;}',
      '.megk-diktal-status{margin-top:9px; font-size:.8rem; color:var(--mkik-red,#C63F3F);}',
      '.megk-select-minta{height:38px; padding:0 10px; border-radius:2px;',
      '  border:1px solid var(--megk-vonal); background:var(--megk-feher);',
      '  color:var(--megk-fg); font-size:.81rem; max-width:250px;}',
      '.megk-select-minta:focus{outline:2px solid var(--megk-akcent); outline-offset:-1px;}',

      /* ---- hibasáv ---- */
      '.megk-hiba{display:none; background:rgba(198,63,63,.08);',
      '  border-left:3px solid var(--mkik-red,#C63F3F); color:var(--megk-fg);',
      '  padding:12px 15px; margin-bottom:14px; font-size:.83rem;}',
      '.megk-hiba.megk-lathato{display:block;}',
      '.megk-hiba-cim{font-weight:700; margin:0 0 4px;}',

      /* ---- eredmény ---- */
      '.megk-eredmeny{display:none;}',
      '.megk-eredmeny.megk-lathato{display:block;}',
      '.megk-felismeres-cim{font-family:var(--slab,Georgia,serif); font-size:1.06rem;',
      '  font-weight:700; margin:0 0 4px; color:var(--megk-fg);}',
      '.megk-felismeres-indoklas{font-size:.83rem; color:var(--megk-lagy); margin:0 0 10px;}',
      '.megk-kozepso-sor{display:grid; grid-template-columns:1fr 1fr; gap:14px;}',
      '@container megk (max-width: 700px){ .megk-kozepso-sor{grid-template-columns:1fr;} }',

      /* ---- forrás-sorok ---- */
      '.megk-forras-sor{display:flex; flex-wrap:wrap; align-items:flex-start;',
      '  justify-content:space-between; gap:8px 10px;',
      '  padding:9px 10px; border:1px solid transparent;',
      '  transition:background-color .15s ease,border-color .15s ease;}',
      '.megk-forras-sor + .megk-forras-sor{margin-top:2px;}',
      '.megk-forras-sor.megk-kiemel{background:var(--megk-kiemeles); border-color:var(--megk-vonal);}',
      '.megk-forras-bal{flex:1 1 190px; min-width:0;}',
      '.megk-forras-cimke{font-family:var(--cond,inherit); font-size:.72rem; color:var(--megk-halvany);',
      '  font-weight:700; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap;}',
      '.megk-forras-ertek{font-size:.87rem; margin-top:2px;}',
      '.megk-forras-ertek-hiany{color:var(--megk-hianyzo-szoveg); font-style:italic;}',
      '.megk-forras-csip{flex:0 1 auto; max-width:100%; white-space:normal; text-align:left;',
      '  font-size:.75rem; color:var(--megk-akcent);',
      '  background:var(--megk-bg); border:1px solid var(--megk-vonal); border-radius:2px;',
      '  padding:5px 9px; cursor:pointer; font-weight:600;}',
      '.megk-forras-csip:hover{border-color:var(--megk-akcent);}',
      '.megk-forras-idezet{margin-top:7px; font-size:.83rem; background:var(--megk-bg);',
      '  border:1px solid var(--megk-vonal); border-left:3px solid var(--megk-akcent);',
      '  padding:9px 11px; position:relative;}',
      '.megk-forras-idezet-zar{position:absolute; top:4px; right:6px; cursor:pointer; border:none;',
      '  background:none; color:var(--megk-halvany); font-size:.94rem; line-height:1;}',

      /* ---- levél ---- */
      '.megk-level-fejlec{font-size:.87rem; font-weight:700; margin:0 0 8px;}',
      '.megk-level-megszolitas{margin:0 0 9px; font-size:.87rem;}',
      '.megk-level-bekezdes{margin:0 0 9px; font-size:.87rem; line-height:1.68;}',
      '.megk-level-mondat{display:inline; padding:1px 2px;',
      '  transition:background-color .15s ease,text-decoration-color .15s ease;}',
      '.megk-level-mondat[data-forras]:not([data-forras="null"]){cursor:pointer;',
      '  text-decoration:underline dotted; text-decoration-color:var(--megk-vonal);',
      '  text-underline-offset:3px;}',
      '.megk-level-mondat[data-forras].megk-kiemel{background:var(--megk-kiemeles);',
      '  text-decoration-style:solid !important; text-decoration-color:var(--megk-akcent) !important;}',
      '.megk-level-mondat.megk-hiany-mondat{background:var(--megk-hianyzo);}',
      '.megk-level-sugo{font-size:.75rem; color:var(--megk-halvany); margin:0 0 10px;}',
      '.megk-hiany-cimke{display:block; font-size:.75rem; color:var(--megk-hianyzo-szoveg);',
      '  margin:3px 0 8px; font-style:italic;}',
      '.megk-level-elkoszones{margin-top:11px; font-size:.87rem; white-space:pre-line;}',

      /* ---- kiküldhető ---- */
      '.megk-kikuldheto-gombsor{display:flex; gap:9px; margin-top:12px; flex-wrap:wrap;}',
      '.megk-visszajelzes{margin-top:10px; font-size:.83rem; color:var(--mkik-green,#346B54);',
      '  font-weight:600; display:none;}',
      '.megk-visszajelzes.megk-lathato{display:block;}',
      '.megk-cimzett-sor{font-size:.78rem; color:var(--megk-halvany); margin-bottom:9px;}',
      /* szűk konténerben semmi ne lógjon ki */
      '.megk-panel,.megk-level-bekezdes,.megk-forras-ertek{overflow-wrap:anywhere;}',
      '@container megk (max-width: 480px){',
      '  .megk-panel{padding:13px 14px;}',
      '  .megk-forras-sor{flex-wrap:wrap;}',
      '  .megk-forras-csip{white-space:normal; margin-top:5px;}',
      '  .megk-gombsor{flex-direction:column; align-items:stretch;}',
      '  .megk-select-minta,.megk-gomb{max-width:none; width:100%;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ------------------------------------------------------------------------
  // Segédfüggvények
  // ------------------------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function forrasById(forrasok, id) {
    if (!id || !Array.isArray(forrasok)) return null;
    for (var i = 0; i < forrasok.length; i++) {
      if (forrasok[i] && forrasok[i].id === id) return forrasok[i];
    }
    return null;
  }

  function biztonsagosSzoveg(v, alap) {
    return (typeof v === 'string' && v.length) ? v : (alap || '');
  }

  // ------------------------------------------------------------------------
  // JSON-ellenőrzés — a feldolgoz() visszatérési értékét vizsgálja az
  // INTEGRACIO.md szerinti szerződés ellen. Csak FIGYELMEZTET, sosem dob:
  // a renderelés emellett is megtörténik, amit lehet.
  // ------------------------------------------------------------------------
  function ellenorzoUzenetek(adat) {
    var uzenetek = [];

    if (!adat || typeof adat !== 'object') {
      uzenetek.push('a feldolgoz() nem objektumot adott vissza');
      return uzenetek;
    }

    var forrasok = Array.isArray(adat.forrasok) ? adat.forrasok : null;
    if (!forrasok) {
      uzenetek.push('hiányzik vagy nem tömb a forrasok mező');
    } else {
      forrasok.forEach(function (f, i) {
        if (!f || typeof f !== 'object') { uzenetek.push('a forrasok[' + i + '] elem nem objektum'); return; }
        if (!f.id) uzenetek.push('a forrasok[' + i + '] elemből hiányzik az id');
        if (!f.idezet) uzenetek.push('a forrasok[' + i + '] elemből hiányzik az idezet');
        if (!f.dokumentum) uzenetek.push('a forrasok[' + i + '] elemből hiányzik a dokumentum mező');
      });
    }

    function forrasLetezikE(id) {
      if (!id) return true;
      if (!forrasok) return false;
      return forrasok.some(function (f) { return f && f.id === id; });
    }

    if (!adat.felismeres || typeof adat.felismeres !== 'object') {
      uzenetek.push('hiányzik vagy hibás a felismeres objektum');
    } else if (adat.felismeres.forras && !forrasLetezikE(adat.felismeres.forras)) {
      uzenetek.push('a felismeres.forras értéke \'' + adat.felismeres.forras + '\', de ez nem szerepel a forrasok tömbben');
    }

    if (!adat.kartya || typeof adat.kartya !== 'object') {
      uzenetek.push('hiányzik vagy hibás a kartya objektum');
    } else {
      KARTYA_MEZOK.forEach(function (mezo) {
        var ertek = adat.kartya[mezo.kulcs];
        if (ertek !== null && ertek !== undefined && typeof ertek !== 'object') {
          uzenetek.push('a kartya.' + mezo.kulcs + ' mező nem objektum és nem null');
        } else if (ertek && ertek.forras && !forrasLetezikE(ertek.forras)) {
          uzenetek.push('a kartya.' + mezo.kulcs + '.forras értéke \'' + ertek.forras + '\', de ez nem szerepel a forrasok tömbben');
        }
      });
    }

    if (!adat.level || typeof adat.level !== 'object') {
      uzenetek.push('hiányzik vagy hibás a level objektum');
    } else if (!Array.isArray(adat.level.mondatok)) {
      uzenetek.push('hiányzik a level.mondatok tömb');
    } else {
      adat.level.mondatok.forEach(function (m, i) {
        if (!m || typeof m !== 'object') { uzenetek.push('a level.mondatok[' + i + '] elem nem objektum'); return; }
        if (m.forras && !forrasLetezikE(m.forras)) {
          uzenetek.push('a ' + (i + 1) + '. levélmondat forras értéke \'' + m.forras + '\', de ez nem szerepel a forrasok tömbben');
        }
        if (!m.szoveg && !m.hiany) {
          uzenetek.push('a ' + (i + 1) + '. levélmondatnak nincs sem szoveg, sem hiany mezője');
        }
      });
    }

    if (!adat.beerkezett || typeof adat.beerkezett !== 'object') {
      uzenetek.push('hiányzik vagy hibás a beerkezett objektum');
    }

    return uzenetek;
  }

  function ellenorzoUzenetekKiir(adat) {
    var uzenetek = ellenorzoUzenetek(adat);
    uzenetek.forEach(function (u) { console.warn('[Megkeresések] ' + u); });
    return uzenetek;
  }

  var AKTIV_PELDANY = null;

  // ------------------------------------------------------------------------
  // Modul felépítése egy adott mount elemre
  // ------------------------------------------------------------------------
  function letrehoz(root) {
    root.className = 'megk-root';
    root.innerHTML = '';
    root.style.containerType = 'inline-size';
    root.style.containerName = 'megk';

    var demoMod = !(window.MEGKERESESEK && typeof window.MEGKERESESEK.feldolgoz === 'function');

    var fejlec = el('div', 'megk-fejlec');
    fejlec.appendChild(el('h2', 'megk-cim', 'Megkeresések'));
    fejlec.appendChild(el('p', 'megk-allitas',
      'Illeszd be a beérkezett megkeresést. A rendszer felismeri az ügytípust, kikeresi a rá vonatkozó szabályokat, ' +
      'és elkészít egy válaszlevél-tervezetet — minden mondat mellett ott a forrás. Amire nincs fedezet, azt nem találja ki, hanem megjelöli.'));
    if (demoMod) {
      fejlec.appendChild(el('span', 'megk-demo-jelzo', 'Demó mód — beépített mintaadat (a kereső nincs bekötve)'));
    }
    root.appendChild(fejlec);

    var utvonal = el('ul', 'megk-utvonal');
    var allomasElemek = [];
    ALLOMASOK.forEach(function (nev, i) {
      var li = el('li', 'megk-allomas');
      li.appendChild(el('span', 'megk-allomas-szam', String(i + 1)));
      li.appendChild(el('span', 'megk-allomas-nev', nev));
      utvonal.appendChild(li);
      allomasElemek.push(li);
    });
    root.appendChild(utvonal);

    var hibaSav = el('div', 'megk-hiba');
    hibaSav.appendChild(el('p', 'megk-hiba-cim', 'A feldolgozás nem sikerült.'));
    var hibaSzoveg = el('p', '', '');
    hibaSav.appendChild(hibaSzoveg);
    root.appendChild(hibaSav);

    var beerkPanel = el('div', 'megk-panel');
    beerkPanel.appendChild(el('p', 'megk-panel-cim', '1. Beérkezett megkeresés'));
    var textarea = el('textarea', 'megk-textarea');
    textarea.placeholder = 'Illeszd be a beérkezett megkeresés szövegét, vagy diktáld be.';
    beerkPanel.appendChild(textarea);

    var gombsor = el('div', 'megk-gombsor');
    var diktalGomb = el('button', 'megk-gomb megk-gomb-diktalas', 'Diktálás');
    var mintaSelect = el('select', 'megk-select-minta');
    mintaSelect.appendChild(el('option', '', 'Példa betöltése'));
    var mintak = (window.MEGKERESESEK && Array.isArray(window.MEGKERESESEK.mintak) && window.MEGKERESESEK.mintak.length)
      ? window.MEGKERESESEK.mintak : BEEPITETT_MINTAK;
    mintak.forEach(function (m, i) {
      var opt = el('option', '', m.cim || ('Minta ' + (i + 1)));
      opt.value = String(i);
      mintaSelect.appendChild(opt);
    });
    var feldolgozGomb = el('button', 'megk-gomb megk-gomb-elsodleges', 'Feldolgozás');
    feldolgozGomb.disabled = true;

    gombsor.appendChild(mintaSelect);
    gombsor.appendChild(diktalGomb);
    gombsor.appendChild(feldolgozGomb);
    beerkPanel.appendChild(gombsor);
    var diktalStatus = el('p', 'megk-diktal-status', '');
    diktalStatus.hidden = true;
    beerkPanel.appendChild(diktalStatus);
    root.appendChild(beerkPanel);

    var eredmeny = el('div', 'megk-eredmeny');
    root.appendChild(eredmeny);

    // --- diktálás ---
    // Minden hibaesetnek konkrét, magyar üzenete van — korábban a gomb
    // csendben visszaállt "Diktálás" feliratra bármilyen hiba esetén
    // (nincs mikrofon-engedély, csend, hálózati hiba), ami a felhasználó
    // szemében megkülönböztethetetlen egy "nem működik" hibától.
    var HANG_HIBA = {
      'not-allowed': 'Nincs engedélyezve a mikrofon. Engedélyezd a böngésző címsorában, majd próbáld újra.',
      'service-not-allowed': 'Nincs engedélyezve a mikrofon. Engedélyezd a böngésző címsorában, majd próbáld újra.',
      'audio-capture': 'Nem található mikrofon ezen az eszközön.',
      'network': 'A felismeréshez internetkapcsolat kell. Ellenőrizd a hálózatot, és próbáld újra.',
      'aborted': 'A felvétel megszakadt. Próbáld újra.',
      'no-speech': 'Nem hallottunk beszédet a felvételen. Próbáld közelebbről, hangosabban.'
    };

    function diktalHibaMutat(szoveg) {
      diktalStatus.textContent = szoveg;
      diktalStatus.hidden = false;
    }

    var Felismero = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Felismero) {
      diktalGomb.style.display = 'none';
      diktalHibaMutat('Ez a böngésző nem támogatja a hangfelismerést. Írd be inkább a szöveget kézzel.');
      diktalStatus.hidden = false;
    } else {
      var felismero = null;
      var diktalFut = false;
      diktalGomb.addEventListener('click', function () {
        diktalStatus.hidden = true;

        if (diktalFut) { if (felismero) felismero.stop(); return; }
        felismero = new Felismero();
        felismero.lang = 'hu-HU';
        felismero.interimResults = false;
        felismero.maxAlternatives = 1;
        var kapottEredmenyt = false;
        felismero.onstart = function () {
          diktalFut = true;
          diktalGomb.classList.add('megk-diktal-aktiv');
          diktalGomb.textContent = 'Felvétel — kattints a leállításhoz';
        };
        felismero.onresult = function (ev) {
          kapottEredmenyt = true;
          var szoveg = '';
          for (var i = 0; i < ev.results.length; i++) szoveg += ev.results[i][0].transcript;
          textarea.value = (textarea.value ? textarea.value + ' ' : '') + szoveg;
          textarea.dispatchEvent(new Event('input'));
        };
        var vissza = function () {
          diktalFut = false;
          diktalGomb.classList.remove('megk-diktal-aktiv');
          diktalGomb.textContent = 'Diktálás';
        };
        felismero.onerror = function (ev) {
          diktalHibaMutat(HANG_HIBA[ev.error] || 'Nem sikerült felismerni a beszédet. Próbáld újra, vagy írd be a szöveget kézzel.');
          vissza();
        };
        felismero.onend = function () {
          if (!kapottEredmenyt && diktalFut) {
            diktalHibaMutat(HANG_HIBA['no-speech']);
          }
          vissza();
        };
        try {
          felismero.start();
        } catch (e) {
          diktalHibaMutat('Nem sikerült elindítani a hangfelismerést. Próbáld újra.');
          vissza();
        }
      });
    }

    textarea.addEventListener('input', function () {
      feldolgozGomb.disabled = !textarea.value.trim();
    });

    mintaSelect.addEventListener('change', function () {
      var idx = mintaSelect.value;
      if (idx === '') return;
      var minta = mintak[Number(idx)];
      if (minta) {
        textarea.value = minta.bemenet || '';
        textarea.dataset.mintaIndex = idx;
        textarea.dispatchEvent(new Event('input'));
      }
    });

    // --- állomás-állapot ---
    function allomasBeallit(index, allapot) {
      var li = allomasElemek[index];
      li.classList.remove('megk-kesz', 'megk-aktiv');
      if (allapot === 'kesz') li.classList.add('megk-kesz');
      if (allapot === 'aktiv') li.classList.add('megk-aktiv');
    }
    function utvonalReset() {
      allomasElemek.forEach(function (_, i) { allomasBeallit(i, 'alap'); });
    }
    function kesleltet(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
    var UTVONAL_LEPES_MS = 320;
    async function utvonalElore(vegsoIndex, lepesMs) {
      var lepes = (lepesMs === undefined) ? UTVONAL_LEPES_MS : lepesMs;
      for (var i = 0; i <= vegsoIndex; i++) {
        allomasBeallit(i, i === vegsoIndex ? 'aktiv' : 'kesz');
        if (i < vegsoIndex && lepes > 0) await kesleltet(lepes);
      }
    }

    async function demoFeldolgoz() {
      await kesleltet(150);
      throw new Error('A kereső nincs bekötve, és ehhez a mintához nincs beépített válasz.');
    }

    // ------------------------------------------------------------------
    // Eredmény renderelése
    // ------------------------------------------------------------------
    function forrasSorLetrehoz(cimke, mezoObj, forrasok) {
      var sor = el('div', 'megk-forras-sor');
      var bal = el('div', 'megk-forras-bal');
      bal.appendChild(el('div', 'megk-forras-cimke', cimke));

      var vanErtek = mezoObj && mezoObj.ertek !== undefined && mezoObj.ertek !== null;
      bal.appendChild(el('div', vanErtek ? 'megk-forras-ertek' : 'megk-forras-ertek megk-forras-ertek-hiany',
        vanErtek ? mezoObj.ertek : 'nincs fedezet'));
      sor.appendChild(bal);

      var forrasId = mezoObj ? mezoObj.forras : null;
      if (forrasId) {
        sor.dataset.forrasId = forrasId;
        var forras = forrasById(forrasok, forrasId);
        var csip = el('button', 'megk-forras-csip',
          forras ? (biztonsagosSzoveg(forras.dokumentum, '?') + ' · ' +
                    biztonsagosSzoveg(String(forras.oldal), '?') + '. o.')
                 : (forrasId + ' (forrás nem található)'));
        var idezetDoboz = null;
        csip.addEventListener('click', function () {
          /* Ha a fő app ad forrásnézetet, azt nyitjuk: az egész alkalmazásban
             egyféleképpen lehet forrást ellenőrizni. */
          if (forras && forras.chunk && typeof window.openSource === 'function') {
            window.openSource(forras.chunk);
            return;
          }
          if (idezetDoboz) { idezetDoboz.remove(); idezetDoboz = null; return; }
          idezetDoboz = el('div', 'megk-forras-idezet');
          idezetDoboz.appendChild(document.createTextNode(
            forras ? ('„' + biztonsagosSzoveg(forras.idezet, 'nincs rögzített idézet') + '”')
                   : 'A hivatkozott forrás nem található.'));
          var zar = el('button', 'megk-forras-idezet-zar', '×');
          zar.addEventListener('click', function () { idezetDoboz.remove(); idezetDoboz = null; });
          idezetDoboz.appendChild(zar);
          sor.appendChild(idezetDoboz);
        });
        sor.appendChild(csip);
      }
      return sor;
    }

    function eredmenyRenderel(adat) {
      eredmeny.innerHTML = '';
      var forrasok = Array.isArray(adat.forrasok) ? adat.forrasok : [];

      var felismPanel = el('div', 'megk-panel');
      felismPanel.appendChild(el('p', 'megk-panel-cim', '2. Felismerve'));
      var f = adat.felismeres || {};
      felismPanel.appendChild(el('p', 'megk-felismeres-cim', biztonsagosSzoveg(f.ugytipus, 'ismeretlen ügytípus')));
      felismPanel.appendChild(el('p', 'megk-felismeres-indoklas', biztonsagosSzoveg(f.indoklas, '')));
      felismPanel.appendChild(forrasSorLetrehoz('Forrás', { ertek: 'a felismerés alapja', forras: f.forras }, forrasok));
      eredmeny.appendChild(felismPanel);

      var kozep = el('div', 'megk-kozepso-sor');

      var szabalyPanel = el('div', 'megk-panel megk-szabaly-panel');
      szabalyPanel.appendChild(el('p', 'megk-panel-cim', '3. Szabály'));
      var kartya = adat.kartya || {};
      KARTYA_MEZOK.forEach(function (mezo) {
        szabalyPanel.appendChild(forrasSorLetrehoz(mezo.cimke, kartya[mezo.kulcs] || null, forrasok));
      });
      kozep.appendChild(szabalyPanel);

      var levelPanel = el('div', 'megk-panel megk-level-panel');
      levelPanel.appendChild(el('p', 'megk-panel-cim', '4. Válasz'));
      levelPanel.appendChild(el('p', 'megk-level-sugo',
        'Vidd az egeret egy aláhúzott mondat fölé — bal oldalon kiemelődik a forrás, amiből következik.'));
      var level = adat.level || {};
      levelPanel.appendChild(el('p', 'megk-level-fejlec', 'Tárgy: ' + biztonsagosSzoveg(level.targy, '(nincs tárgy megadva)')));
      levelPanel.appendChild(el('p', 'megk-level-megszolitas', biztonsagosSzoveg(level.megszolitas, '')));

      var mondatok = Array.isArray(level.mondatok) ? level.mondatok : [];
      var bekezdesek = [];
      var aktualisBekezdes = el('p', 'megk-level-bekezdes');
      bekezdesek.push(aktualisBekezdes);
      mondatok.forEach(function (m, idx) {
        if (idx > 0 && m && m.uj_bekezdes) {
          aktualisBekezdes = el('p', 'megk-level-bekezdes');
          bekezdesek.push(aktualisBekezdes);
        }
        var vanHiany = m && m.hiany;
        var span = el('span', 'megk-level-mondat' + (vanHiany ? ' megk-hiany-mondat' : ''));
        span.dataset.forras = (m && m.forras) ? m.forras : 'null';
        span.textContent = vanHiany
          ? (biztonsagosSzoveg(m.szoveg, '') + '[KITÖLTENDŐ]')
          : ((m && m.szoveg) ? m.szoveg : '');
        if (aktualisBekezdes.childNodes.length > 0) {
          aktualisBekezdes.appendChild(document.createTextNode(' '));
        }
        aktualisBekezdes.appendChild(span);
        if (vanHiany) {
          aktualisBekezdes.appendChild(document.createElement('br'));
          aktualisBekezdes.appendChild(el('span', 'megk-hiany-cimke', biztonsagosSzoveg(m.hiany, 'hiányzó adat')));
        }
      });
      bekezdesek.forEach(function (p) { levelPanel.appendChild(p); });
      levelPanel.appendChild(el('p', 'megk-level-elkoszones', biztonsagosSzoveg(level.elkoszones, '')));
      kozep.appendChild(levelPanel);
      eredmeny.appendChild(kozep);

      var kikPanel = el('div', 'megk-panel');
      kikPanel.appendChild(el('p', 'megk-panel-cim', '5. Kiküldhető'));
      var beerk = adat.beerkezett || {};
      kikPanel.appendChild(el('div', 'megk-cimzett-sor',
        'Címzett: ' + biztonsagosSzoveg(beerk.felado, '(ismeretlen)') +
        (beerk.email ? ' <' + beerk.email + '>' : '') +
        (beerk.ceg ? ' · ' + beerk.ceg : '')));

      var kikGombsor = el('div', 'megk-kikuldheto-gombsor');
      var jovahagyGomb = el('button', 'megk-gomb megk-gomb-elsodleges', 'Jóváhagyom (vágólapra)');
      var mailtoGomb = el('button', 'megk-gomb', 'Megnyitás levelezőben');
      kikGombsor.appendChild(jovahagyGomb);
      kikGombsor.appendChild(mailtoGomb);
      kikPanel.appendChild(kikGombsor);
      var visszajelzes = el('div', 'megk-visszajelzes', '');
      kikPanel.appendChild(visszajelzes);
      eredmeny.appendChild(kikPanel);

      function levelTeljesSzoveg() {
        var sorok = [biztonsagosSzoveg(level.megszolitas, ''), ''];
        var bekezdesSzovegek = [], aktualisMondatok = [];
        mondatok.forEach(function (m, idx) {
          if (idx > 0 && m && m.uj_bekezdes) {
            bekezdesSzovegek.push(aktualisMondatok.join(' '));
            aktualisMondatok = [];
          }
          var alap = (m && m.szoveg) ? m.szoveg : '';
          aktualisMondatok.push(m && m.hiany ? (alap + '[KITÖLTENDŐ — ' + m.hiany + ']') : alap);
        });
        bekezdesSzovegek.push(aktualisMondatok.join(' '));
        sorok.push(bekezdesSzovegek.join('\n\n'));
        sorok.push('');
        sorok.push(biztonsagosSzoveg(level.elkoszones, ''));
        return sorok.join('\n');
      }

      function esemenyKuld() {
        document.dispatchEvent(new CustomEvent('megkeresesek-jovahagyva', {
          detail: {
            levelSzoveg: levelTeljesSzoveg(),
            kartya: kartya,
            forrasok: forrasok,
            ugytipus: (adat.felismeres && adat.felismeres.ugytipus) || null,
            cimzett: { nev: beerk.felado || null, email: beerk.email || null, ceg: beerk.ceg || null },
            idopont: new Date().toISOString()
          }
        }));
        allomasBeallit(4, 'kesz');
      }

      jovahagyGomb.addEventListener('click', function () {
        var szoveg = levelTeljesSzoveg();
        function visszajelez() {
          visszajelzes.textContent = 'A levél a vágólapra másolva.';
          visszajelzes.classList.add('megk-lathato');
          esemenyKuld();
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(szoveg).then(visszajelez, function () {
            regiVagolapMasolas(szoveg); visszajelez();
          });
        } else {
          regiVagolapMasolas(szoveg); visszajelez();
        }
      });

      mailtoGomb.addEventListener('click', function () {
        var href = 'mailto:' + encodeURIComponent(beerk.email || '') +
          '?subject=' + encodeURIComponent(biztonsagosSzoveg(level.targy, '')) +
          '&body=' + encodeURIComponent(levelTeljesSzoveg());
        window.location.href = href;
        visszajelzes.textContent = 'Megnyitva a levelezőben.';
        visszajelzes.classList.add('megk-lathato');
        esemenyKuld();
      });
    }

    function regiVagolapMasolas(szoveg) {
      var ta = document.createElement('textarea');
      ta.value = szoveg;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* néma */ }
      document.body.removeChild(ta);
    }

    // --- kétirányú kiemelés ---
    function kiemel(id, be) {
      if (!id || id === 'null') return;
      var lista = eredmeny.querySelectorAll('[data-forras="' + id + '"], [data-forras-id="' + id + '"]');
      for (var i = 0; i < lista.length; i++) {
        lista[i].classList[be ? 'add' : 'remove']('megk-kiemel');
      }
    }
    eredmeny.addEventListener('mouseover', function (ev) {
      var cel = ev.target.closest('[data-forras], [data-forras-id]');
      if (cel) kiemel(cel.dataset.forras || cel.dataset.forrasId, true);
    });
    eredmeny.addEventListener('mouseout', function (ev) {
      var cel = ev.target.closest('[data-forras], [data-forras-id]');
      if (cel) kiemel(cel.dataset.forras || cel.dataset.forrasId, false);
    });

    // --- hibakezelés + indítás ---
    function hibaMutat(uzenet) {
      hibaSzoveg.textContent = uzenet;
      hibaSav.classList.add('megk-lathato');
    }
    function hibaElrejt() { hibaSav.classList.remove('megk-lathato'); }

    feldolgozGomb.addEventListener('click', async function () {
      var szoveg = textarea.value.trim();
      if (!szoveg) return;
      hibaElrejt();
      eredmeny.classList.remove('megk-lathato');
      feldolgozGomb.disabled = true;
      utvonalReset();

      var demoMod = !(window.MEGKERESESEK && typeof window.MEGKERESESEK.feldolgoz === 'function');
      var animleallit = false;

      try {
        allomasBeallit(0, 'kesz');
        allomasBeallit(1, 'aktiv');

        var hivo = demoMod ? demoFeldolgoz : window.MEGKERESESEK.feldolgoz;
        var hivasIgeret = hivo(szoveg);

        (async function () {
          await kesleltet(UTVONAL_LEPES_MS); if (animleallit) return;
          allomasBeallit(1, 'kesz'); allomasBeallit(2, 'aktiv');
          await kesleltet(UTVONAL_LEPES_MS); if (animleallit) return;
          allomasBeallit(2, 'kesz'); allomasBeallit(3, 'aktiv');
        })();

        var nyersAdat = await hivasIgeret;
        animleallit = true;
        var adat = nyersAdat && typeof nyersAdat === 'object' ? nyersAdat : {};
        ellenorzoUzenetekKiir(adat);

        eredmenyRenderel(adat);
        eredmeny.classList.add('megk-lathato');
        await utvonalElore(3, 120);
        allomasBeallit(3, 'kesz');
        allomasBeallit(4, 'aktiv');
      } catch (err) {
        animleallit = true;
        hibaMutat('Hiba történt a feldolgozás közben: ' + (err && err.message ? err.message : String(err)) +
          '. A beillesztett szöveg megmaradt, próbáld újra.');
        allomasBeallit(0, 'kesz');
      } finally {
        feldolgozGomb.disabled = !textarea.value.trim();
      }
    });

    AKTIV_PELDANY = {
      renderel: function (adat) {
        hibaElrejt();
        eredmenyRenderel(adat);
        eredmeny.classList.add('megk-lathato');
        utvonalReset();
        for (var i = 0; i < 4; i++) allomasBeallit(i, 'kesz');
        allomasBeallit(4, 'aktiv');
      }
    };
  }

  // ------------------------------------------------------------------------
  // Tesztfüggvény — window.MEGKERESESEK_TESZT(sajatJson)
  // ------------------------------------------------------------------------
  window.MEGKERESESEK_TESZT = function (sajatJson) {
    var uzenetek = ellenorzoUzenetek(sajatJson);
    if (uzenetek.length) {
      console.warn('[Megkeresések] MEGKERESESEK_TESZT — ' + uzenetek.length + ' probléma található:');
      uzenetek.forEach(function (u) { console.warn('[Megkeresések] - ' + u); });
    } else {
      console.log('[Megkeresések] MEGKERESESEK_TESZT — minden rendben, a JSON megfelel a sémának.');
    }
    if (AKTIV_PELDANY) {
      AKTIV_PELDANY.renderel(sajatJson && typeof sajatJson === 'object' ? sajatJson : {});
    } else {
      console.warn('[Megkeresések] MEGKERESESEK_TESZT — nincs betöltött modulpéldány (#megkeresesek).');
    }
    return uzenetek;
  };

  function init() {
    injectStyles();
    var root = document.getElementById(MOUNT_ID);
    if (!root) return;
    try {
      letrehoz(root);
    } catch (e) {
      root.innerHTML = '<div class="megk-hiba megk-lathato">A Megkeresések modul betöltése hibába ütközött: ' +
        (e && e.message ? e.message : String(e)) + '</div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
