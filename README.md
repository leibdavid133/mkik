# Kamarai Tudástár — MKIK x AI Klub AI Hackathon (2026.08.28.)

Belső dokumentumkereső a kamarai munkatársaknak: a kérdésre a **hatályos szabályzat
szó szerinti részletével** válaszol, dokumentum- és oldalhivatkozással. Ha nincs
fedezet a dokumentumokban, ezt kimondja, nem talál ki választ.

## Mit tud

- **Determinisztikus visszakeresés** — nyelvi modell nélkül is teljes értékű választ ad,
  mert a válasz maga az idézett szabályzatrészlet. Nincs futásidejű API-költség.
- **Szigorú fedezet-kapu** (`GATE` az `app.js`-ben: `minScore`, `minCoverage`, `minTerms`) —
  a küszöb alatt a rendszer nemet mond. Ez a rendszer legfontosabb beállítása.
- **Forrásmegjelölés** minden válasznál (dokumentum + oldal).
- **24 kamara** (MKIK + 23 területi) jogosultság-szerinti tartalommal.
- **Admin felület** (`admin.html`) — küszöbök hangolása, dokumentum-index kezelése.
- **Opcionális megfogalmazó réteg**: `CONFIG.LLM_ENDPOINT` és `CONFIG.VOICE_ENDPOINT`
  mount-pont készen áll; `null` esetén idézetes módban fut.

## Futtatás

Statikus oldal, build nélkül:

```
python3 -m http.server 8000
```

Utána: <http://localhost:8000>

Bemutató fiókok a bejelentkező képernyőn (jelszó: `kamara2026`). Éles rendszerben a
kamara SSO-címtára hitelesít, jelszó nem kerül a böngészőbe.

## Felépítés

| Fájl | Szerep |
|---|---|
| `index.html`, `app.js` | kereső felület + visszakereső motor, fedezet-kapu |
| `admin.html`, `admin.js` | adminisztrációs felület |
| `common.js` | közös segédfüggvények, jogosultság/kamara-kezelés |
| `style.css` | MKIK arculat (Roboto Slab / Roboto Condensed / Open Sans) |
| `data/kb.js` | előállított dokumentum-index |
| `tools/build_index.py` | az index előállítása a forrás-PDF-ekből |
| `docs/` | a feladatkiírás és a (fiktív) kamarai szabályzatok |

## Megjegyzés a `docs/` mappáról

A `docs/` a szervezőktől kapott feladatleírást és a fiktív kamarai szabályzatokat
tartalmazza. Ez a repó **privát**; ha publikussá válik, ezeket előbb el kell távolítani
a git előzményből is.
