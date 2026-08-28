# Kamarai Tudástár — 5 perces pitch

> Felépítés a kiírás 6. fejezete szerint. A zsűri nem jegyzetel, hanem dönt:
> nem funkciólistát mondunk, technológia-nevet nem használunk érvként,
> és nem betanított kérdésen futtatjuk a demót.

**Időzítés:** 30 mp probléma · 90 mp élő demó · 30 mp „nincs fedezet” · 60 mp Megkeresések · 60 mp a három szempont · 30 mp zárás.

---

## 1. A probléma (30 mp)

Egy kamarai munkatárs nekifut egy kérdésnek: milyen határidővel kell válaszolni, ki hagyhatja jóvá, melyik nyomtatvány az érvényes. A válasz létezik — húsz dokumentumban szétszórva. Ezért inkább megkérdezi a tapasztalt kollégát.

**Ez két embert állít meg:** a kérdezőt, amíg vár, és a tapasztaltat, akinek a napja azzal telik, hogy leírt dolgokat mond fel.

És van egy nagyobb tét. Ha a munkatárs téves választ ad tovább, azt **a kamara nevében** teszi. Ezért itt a magabiztosan előadott téves válasz többe kerül, mint a meg nem válaszolt kérdés.

> **Ez a mondat a pitch tengelye. Erre épül minden, amit utána mutatunk.**

---

## 2. Élő demó (90 mp)

**Kérdés, amit a zsűri is feltehetne:** „Ki hagyhat jóvá egy 8 millió forintos beszerzést?”

A rendszer válasza:

> A megadott 8 000 000 Ft a III. kategóriába esik (5 000 001 – 15 000 000 Ft). Ebben az esetben a jóváhagyó **főtitkár**, a minimális eljárás: legalább 3 ajánlat + Beszerzési Bizottság.

Alatta a szó szerinti részlet a szabályzatból, mellette: **Beszerzési Szabályzat · 10. § · 6. oldal · BSZ-2026/01 · v1.0 · hatályos 2026. január 1.**

**Most jön a lényeg — kattintás a „Forrás megnyitása” gombra.** Megnyílik a szabályzat 6. oldala, a hivatkozott bekezdés kiemelve.

> „A munkatársnak nem kell hinnie a rendszernek. Meg tudja nézni, mielőtt továbbadja.”

**Kérd meg a zsűrit, hogy ők kérdezzenek.** A rendszer 4 szabályzatból, 439 idézhető szövegrészből dolgozik.

---

## 3. A „nincs fedezet” pillanat (30 mp)

**Kérdés:** „Hány nap szabadság jár a munkatársaknak?”

A rendszer nem tippel. Piros sáv: **„Erre nincs fedezet a dokumentumokban.”**

> „A betöltött szabályzatokban nincs erre rendelkezés. A rendszer szándékosan nem fogalmaz meg tippet.”

És a kérdés nem vész el: bekerül a **Hiánylistába**, ami megmutatja a vezetőségnek, hol hiányos a belső szabályozás. **A hiba adattá válik.**

Mérésünk: 8 szándékosan lefedetlen kérdésből **8-szor** mondott nemet. Magabiztos téves válasz: **nulla**.

---

## 4. A saját ötletünk: Megkeresések (60 mp)

Eddig a rendszer válaszolt. Most **elvégzi a munka javát.**

Beérkezik egy megkeresés egy cégtől. Bemásoljuk. A rendszer öt lépésben:
felismeri az ügytípust → kikeresi a rá vonatkozó szabályt → **megírja a válaszlevél-tervezetet**.

Minden mondat alá van húzva: **rámutatva látszik, melyik szabályzatrészletből következik.** Amire nincs fedezet, az sárgán, `[KITÖLTENDŐ]` jelöléssel marad a levélben — nem tűnik el csendben.

A munkatárs elolvassa, jóváhagyja, kimegy. **A rendszer soha nem küld el semmit magától.**

> „A hallucináció itt nem tiltva van. Szerkezetileg lehetetlen: minden mondat vagy szó szerinti idézet forrásazonosítóval, vagy megjelölt hiány.”

---

## 5. A három szempont — számokkal (60 mp)

### Ár
- **Egy kérdés: 0 Ft.** A visszakeresés determinisztikus, nyelvi modell nem fut.
- **Havi üzemeltetés:** 850 munkatárs × 1,2 kérdés/nap × 21 nap ≈ 21 400 kérdés → az infrastruktúra fix, a kérdésszám nem drágítja.
- **Betöltés:** 10 oldal ≈ 1 másodperc indexelés. A frissítés a változó szabályzatok arányával skálázódik.
- **Ahol faragni lehet:** a kalkulátorban négy kar látszik, mindegyiknél odaírva, mi az ára minőségben.

> „Aki azt mondja, hogy olcsó, az nem számolta ki. Mi kiszámoltuk, és a felületen állítható.”

### Skálázhatóság
- Ma: **1,5 ms / kérdés**, 439 szövegrész.
- **A határ ~50 dokumentumnál van.** Efölött a keresés a szerverre kerül — a felület, a forrásmegjelölés és a jogosultság változatlan marad.
- Ami nem változik: a séma, a felület, a munkafolyamat. Ami cserélődik: a keresés futtatási helye.

### Bővíthetőség
- **Jogosultság — élő demó:** ugyanaz a kérdés ügyintézőként „nincs hozzáférésed”, vezetőként megválaszolva. A tartalom nem szivárog.
- **24 kamara**, kamaránként külön dokumentumkészlet, az adminban átsorolható.
- **Adatforrások:** az iktató, az intranet és a megosztott meghajtó csatlakozási pontja meg van nevezve, ráfordítás-becsléssel.
- **Munkafolyamatba ágyazás:** a Megkeresések modul ma is beilleszthető **két sor HTML-lel** bármelyik belső felületbe.

---

## 6. Zárás (30 mp)

Amit ez tud, és amit más nem:

1. **Minden állítás visszavezethető** egy dokumentumra, oldalra, szó szerinti mondatra — egy kattintással.
2. **A nemet mondás beépített képesség**, nem hiányosság.
3. **Alapértelmezés szerint semmi nem hagyja el a gépet.**
4. **A meg nem válaszolt kérdés is hasznot hoz:** megmutatja, hol hiányos a szabályozás.

---

## 7. A helyszíni vezetőkkel egyeztetve

<!-- KITÖLTENDŐ: kivel beszéltünk, mit mondtak, és ez hol épült be a rendszerbe.
     A kiírás ezt külön értékeli:
       - megkerested-e a vezetőket, és be tudsz-e számolni róla
       - valódi, tőlük jövő igényre válaszol-e
       - beépítetted-e, akár egyszerű formában
       - elmondod-e a pitchben, honnan jött és kivel egyeztetted -->

---

## Amit a kérdésekre válaszolunk

**„Mi van, ha rossz választ ad?”**
Nem ad kitalált választ: vagy szó szerinti részletet mutat forrással, vagy nemet mond. Ha a találat gyenge, borostyán sávval jelzi, és kiírja: olvasd el a forrást, mielőtt továbbadod.

**„Mennyi munka bevezetni?”**
A dokumentumok betöltése automatizált. A jogosultsági körök és a kamarák beállítása az adminban történik, fejlesztő nélkül.

**„Mi van, ha változik egy szabályzat?”**
A verzió és a hatálybalépés minden válaszban látszik. Új verziónál a rendszer jelzi azoknak, akik a régiből kaptak választ — az elavult válasz rosszabb, mint a semmi.

**„Miért nem egy általános chatbot?”**
Mert az nem tudja megmondani, honnan tudja. Belső rendszerben a válasz forrása nem extra, hanem a termék lényege.
