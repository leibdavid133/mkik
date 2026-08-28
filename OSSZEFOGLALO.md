# Kamarai Tudástár — összefoglaló a prezihez

*MKIK x AI Klub hackathon, 2026.08.28. — minden szám mérés, nem becslés.*

## Egy mondatban
Belső kereső a kamarai munkatársaknak, ami **a hatályos szabályzatokból válaszol, minden állításhoz megmutatja a forrást, és nemet mond, ha nincs fedezet.**

## A probléma
A válaszok léteznek, csak húsz dokumentumban szétszórva. Ezért a munkatárs a kollégát kérdezi — ez két embert állít meg. A nagyobb tét: a téves válasz **a kamara nevében** megy ki. Ezért a magabiztosan előadott téves válasz többe kerül, mint a meg nem válaszolt kérdés.

## Mit tud — 5 pont
1. **Magyar kérdés → megfogalmazott, 1–2 mondatos válasz**, alatta a szó szerinti részlet a szabályzatból.
2. **Forrás egy kattintással ellenőrizhető:** megnyílik az adott oldal, a hivatkozott bekezdés kiemelve. Dokumentum, §, oldalszám, verzió, hatálybalépés.
3. **„Nincs fedezet"** — nem tippel. A meg nem válaszolt kérdés bekerül a **Hiánylistába**, ami megmutatja, hol hiányos a belső szabályozás.
4. **Jogosultságkezelés élőben:** ugyanaz a kérdés ügyintézőként „nincs hozzáférésed", HR-vezetőként megválaszolva. Tartalom nem szivárog.
5. **Megkeresések modul:** beérkezett céges levélből **válaszlevél-tervezet**, mondatonként forráshoz kötve.

## Számok (mind mérve)
| | |
|---|---|
| Betöltött szabályzat | **4** (Beszerzési, Adatkezelési, Dokumentumkezelési, IT Biztonsági) |
| Idézhető szövegrész | **439** |
| Kamara a rendszerben | **24** (MKIK + 23 területi), kamaránként külön készlet |
| Lefedett kérdésre helyes válasz | **12/12** |
| Magabiztos téves válasz | **0/8** |
| Válaszidő | **1,5 ms / kérdés** |
| Költség | **0 Ft / kérdés** (nyelvi modell nem fut) |

## A saját ötletünk: Megkeresések
Nem válaszol, hanem **elvégzi a munka javát.** Öt állomás: Beérkezett → Felismerve → Szabály → Válasz → Kiküldhető.
A levéltervezet minden mondata alá van húzva: rámutatva látszik, melyik szabályzatrészletből következik. Amire nincs fedezet, az sárgán `[KITÖLTENDŐ]` marad — nem tűnik el csendben. **A rendszer soha nem küld el semmit magától**, a munkatárs hagyja jóvá.

## A három kötelező szempont
**Ár.** Egy kérdés 0 Ft. Havi üzemeltetés: 850 munkatárs × 1,2 kérdés/nap × 21 nap ≈ 21 400 kérdés. Betöltés: 120 dokumentum ≈ 2 perc gépidő + 30 óra ellenőrzés. Havi frissítés: a változó szabályzatok arányában. A felületen **négy faragási kar** látszik, mindegyiknél odaírva, mi az ára minőségben.

**Skálázhatóság.** Ma 1,5 ms/kérdés. **A határ ~50 dokumentumnál van** — efölött a keresés a szerverre kerül, a felület, a forrásmegjelölés és a jogosultság változatlan marad.

**Bővíthetőség.** Jogosultsági körök, 24 kamara, hiánylista, admin felület — mind működik. Az iktató, intranet és megosztott meghajtó csatlakozási pontja meg van nevezve ráfordítás-becsléssel (~1–5 fejlesztőnap). A Megkeresések modul **két sor HTML-lel** beilleszthető bármelyik belső felületbe.

## A kulcsmondat a prezihez
> **A hallucináció itt nem tiltva van, hanem szerkezetileg lehetetlen:** minden mondat vagy szó szerinti idézet forrásazonosítóval, vagy megjelölt hiány.

## Amit őszintén elmondunk
- **Alapértelmezés szerint semmi nem hagyja el a gépet.** A közös napló kikapcsolva, egy kattintással bekapcsolható.
- A dokumentumok **fiktív minta-szabályzatok**, a szervezők anyagára építve.
- Nyelvi modell **nincs bekötve** — ezért 0 Ft/kérdés. Ha kell, egy végpont bekötése, a séma nem változik.
- A hangasszisztens csatlakozási pontja kész, a modul még nem érkezett meg.

## Demó-forgatókönyv (5 perc)
1. **Kérdés:** „Ki hagyhat jóvá egy 8 millió forintos beszerzést?" → válasz + **Forrás megnyitása**
2. **Zsűri kérdezzen** — 4 szabályzat, 439 szövegrész
3. **„Hány nap szabadság jár?"** → „Erre nincs fedezet" → Hiánylista
4. **Jogosultság:** Kovács Anna (ügyintéző) vs. Szabó Judit (HR vezető), ugyanaz az adatvédelmi kérdés
5. **Megkeresések:** 1. minta betöltése → válaszlevél-tervezet forrásokkal
6. **Költség nézet:** a három szempont számokkal

**Belépés:** `kovacs.anna@mkik.hu` · `szabo.judit@mkik.hu` · admin: `admin@mkik.hu` — jelszó mindegyikhez `kamara2026`.
