#!/usr/bin/env python3
"""
Kamarai Tudástár - dokumentum-indexelő.

Beolvassa a docs/ mappa PDF-jeit, és előállítja a data/kb.js fájlt:
oldalszámmal és §-hivatkozással ellátott, szó szerint idézhető szövegrészekkel.

A file:// protokollból nem lehet helyi JSON-t fetch-elni, ezért a kimenet
egy JS fájl, ami a window.KB globálisra tölt.

Futtatás:  python3 tools/build_index.py
"""
import json, os, re, sys, unicodedata
from datetime import datetime, timezone

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("Hiányzik a PyMuPDF. Telepítés: pip install pymupdf")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT  = os.path.join(ROOT, "data", "kb.js")

# A dokumentum-állomány leíró adatai. Új szabályzat felvételéhez elég ide
# egy sort írni; az admin felület később ezt a szerkezetet szerkeszti majd.
MANIFEST = {
    "MKIK_Beszerzesi_Szabalyzat.pdf": {
        "id":        "bsz-2026-01",
        "title":     "Beszerzési Szabályzat",
        "code":      "BSZ-2026/01",
        "version":   "1.0",
        "effective": "2026. január 1.",
        "issuer":    "MKIK Elnöksége",
        "owner":     "gazdasági vezető",
        "category":  "szabalyzat",
        "chamber":   0,          # 0 = MKIK (országos)
        "access":    "all",      # all | hr | penzugy | vezetoi
        "review":    "évente, illetve jogszabályváltozáskor",
    },
}

# ---------------------------------------------------------------- szövegtisztítás
SOFT_HYPHENS = "‐‑­"
RUNNING = [
    re.compile(r"^MKIK\s*·", re.I),
    re.compile(r"^\d+\s*/\s*\d+$"),
    re.compile(r"^[IVX]+\.\s+[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ\s,]+$"),  # nagybetűs futó fejléc
]

def normalize(t):
    t = unicodedata.normalize("NFC", t)
    t = t.replace(" ", " ").replace("–", "-").replace("—", "-")
    for h in SOFT_HYPHENS:
        t = t.replace(h, "-")
    return t

def dehyphenate(lines):
    """A sortörésnél elválasztott szavakat összevonja: 'szabá-\\nlyozási' -> 'szabályozási'."""
    out = []
    for ln in lines:
        if out and out[-1].endswith("-") and ln[:1].islower():
            out[-1] = out[-1][:-1] + ln
        else:
            out.append(ln)
    return out

def is_running(line):
    return any(rx.match(line) for rx in RUNNING)

# ---------------------------------------------------------------- összeg-felismerés
MULT = {"ezer": 1_000, "millió": 1_000_000, "millio": 1_000_000, "milliárd": 1_000_000_000}

def parse_amounts(text):
    """Forintösszegeket keres: '1 000 001', '15 millió', '5 M Ft'."""
    t = normalize(text).lower()
    found = []
    for m in re.finditer(r"(\d[\d\s.]{0,14}\d|\d)\s*(ezer|millió|millio|milliárd)?", t):
        raw, mult = m.group(1), m.group(2)
        digits = re.sub(r"[\s.]", "", raw)
        if not digits.isdigit():
            continue
        val = int(digits)
        if mult:
            val *= MULT[mult]
        elif val < 1000:
            continue                     # paragrafusszám, oldalszám, sorszám
        found.append(val)
    return found

def parse_range(cell):
    """Táblázat-cellából értékhatár: '1 000 001 - 5 000 000 Ft' -> (1000001, 5000000)."""
    a = parse_amounts(cell)
    low = re.search(r"felett", cell, re.I)
    if len(a) >= 2:
        return [min(a), max(a)]
    if len(a) == 1:
        return [a[0], None] if low else [0, a[0]]
    return None

# ---------------------------------------------------------------- feldolgozás
SEC_RX = re.compile(r"^(\d+)\.\s*§\s+(.+)$")

def is_section(line):
    """Valódi paragrafuscím, nem tartalomjegyzék-sor."""
    m = SEC_RX.match(line)
    if not m:
        return None
    title = m.group(2)
    if "·" in line or len(line) > 90:   # a tartalomjegyzék középpontokkal fűz össze §-okat
        return None
    if re.search(r"\d\s*$", title):     # címsor végén oldalszám = tartalomjegyzék
        return None
    return f"{m.group(1)}. § {title}".strip()

def is_junk(text):
    """Címlap (ritkított szedés) és tartalomjegyzék-törmelék kiszűrése."""
    toks = text.split()
    if not toks:
        return True
    single = sum(1 for t in toks if len(t) == 1)
    if single / len(toks) > 0.25:                 # "B E L S Ő S Z A B Á LY Z AT"
        return True
    if "." not in text and len(re.findall(r"(?<!\d)\d{1,2}(?!\d)", text)) >= 2:
        return True                               # tartalomjegyzék-sor oldalszámokkal
    return False

def process(path, meta):
    doc = fitz.open(path)
    chunks, pages = [], []
    section = None
    n = 0

    for pno in range(doc.page_count):
        page = doc[pno]
        pageno = pno + 1

        # A táblázat a fölötte álló paragrafuscímhez tartozik, ezért előbb
        # összegyűjtjük az oldal címeit a függőleges helyükkel együtt.
        heads_on_page = []
        for b in page.get_text("blocks"):
            for ln in b[4].split("\n"):
                sec = is_section(normalize(ln).strip())
                if sec:
                    heads_on_page.append((b[1], sec))
        heads_on_page.sort()

        def section_at(y, fallback):
            best = fallback
            for hy, hs in heads_on_page:
                if hy <= y:
                    best = hs
            return best

        # 1) táblázatok külön, mert a soraik önmagukban értelmes állítások
        table_boxes = []
        try:
            tabs = page.find_tables()
        except Exception:
            tabs = None
        if tabs and tabs.tables:
            for t in tabs.tables:
                table_boxes.append(fitz.Rect(t.bbox))
                rows = t.extract()
                if not rows:
                    continue
                head = [normalize((c or "").replace("\n", " ")).strip() for c in rows[0]]
                for row in rows[1:]:
                    cells = [normalize((c or "").replace("\n", " ")).strip() for c in row]
                    if not any(cells):
                        continue
                    parts = [f"{head[i]}: {cells[i]}" for i in range(min(len(head), len(cells))) if cells[i]]
                    text = " · ".join(parts)
                    n += 1
                    ch = {"i": n, "d": meta["id"], "p": pageno,
                          "s": section_at(t.bbox[1], section),
                          "t": text, "k": "table"}
                    rng = None
                    for c in cells:
                        if re.search(r"\d", c) and re.search(r"Ft|felett|-", c):
                            rng = parse_range(c)
                            if rng:
                                break
                    if rng:
                        ch["r"] = rng
                    chunks.append(ch)

        # 2) folyó szöveg, a táblázatok területének kihagyásával
        raw_lines = []
        for b in page.get_text("blocks"):
            rect = fitz.Rect(b[:4])
            if any(rect.intersects(tb) and rect.get_area() and
                   (rect & tb).get_area() / rect.get_area() > 0.5 for tb in table_boxes):
                continue
            for ln in b[4].split("\n"):
                ln = normalize(ln).strip()
                if ln and not is_running(ln):
                    raw_lines.append(ln)

        raw_lines = dehyphenate(raw_lines)
        pages.append(" ".join(raw_lines))

        buf = []
        def flush():
            nonlocal buf, n
            if not buf:
                return
            text = re.sub(r"\s+", " ", " ".join(buf)).strip()
            buf = []
            if len(text) < 40 or is_junk(text):   # cím, címlap vagy tartalomjegyzék
                return
            n += 1
            chunks.append({"i": n, "d": meta["id"], "p": pageno, "s": section,
                           "t": text, "k": "para"})

        for ln in raw_lines:
            sec = is_section(ln)
            if sec:                        # új paragrafus kezdődik
                flush()
                section = sec
                continue
            # bekezdés-kezdet: (1), 1., a) vagy nagybetűs mondatkezdet hosszabb blokk után
            if re.match(r"^\(\d+\)", ln) and buf:
                flush()
            buf.append(ln)
        flush()

    first = next((c["p"] for c in chunks if c.get("s")), 1)
    chunks = [c for c in chunks if c["p"] >= first]
    for k, c in enumerate(chunks, 1):
        c["i"] = k
    return chunks, pages, doc.page_count

def main():
    docs, all_chunks = [], []
    for fn, meta in MANIFEST.items():
        path = os.path.join(DOCS, fn)
        if not os.path.exists(path):
            print(f"  KIHAGYVA (nincs meg): {fn}")
            continue
        chunks, pages, npages = process(path, meta)
        d = dict(meta)
        d["file"] = fn
        d["pages"] = npages
        d["pageText"] = pages
        d["chunkCount"] = len(chunks)
        docs.append(d)
        all_chunks.extend(chunks)
        print(f"  {fn}: {npages} oldal, {len(chunks)} szövegrész")

    kb = {
        "builtAt": datetime.now(timezone.utc).astimezone().strftime("%Y. %m. %d. %H:%M"),
        "docs": docs,
        "chunks": all_chunks,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Generált fájl - ne szerkeszd kézzel. Forrás: tools/build_index.py */\n")
        f.write("window.KB = ")
        json.dump(kb, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"\nkész: {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)/1024:.0f} KB), "
          f"{len(docs)} dokumentum, {len(all_chunks)} szövegrész")

if __name__ == "__main__":
    main()
