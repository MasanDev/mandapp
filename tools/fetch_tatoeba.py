"""Hämtar kinesiska (cmn) meningar med ljud från Tatoebas API till audio/tatoeba/.
Bara ljud vars licens tillåter återanvändning utanför Tatoeba tas med (tom licens eller 403 hoppas över).
Körs av GitHub Actions (.github/workflows/tatoeba.yml)."""
import json, os, re, sys, time, urllib.request, urllib.parse, urllib.error

MAX = int(os.environ.get("MAX_SENTENCES", "2000"))
OUT_DIR = "audio/tatoeba"
INDEX = "audio/tatoeba.json"
API = "https://api.tatoeba.org/v1/sentences"
UA = {"User-Agent": "mandapp-personal-study/1.0 (GitHub Actions)"}
CJK = re.compile(r"[㐀-鿿]")
SYL = re.compile(r"[a-zü:v]+[1-5]")

def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return data if binary else json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                print("HTTP", e.code, url, file=sys.stderr)
                return None
            print("HTTP", e.code, url, file=sys.stderr)
        except Exception as e:
            print("fel", e, url, file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None

def pinyin_for(sent, nchars):
    for t in sent.get("transcriptions") or []:
        txt = (t.get("text") or "").lower().replace("u:", "v")
        # ta bort ad hoc-markup som [..|..]
        txt = re.sub(r"\[[^|\]]*\|([^\]]*)\]", r"\1", txt)
        syl = SYL.findall(txt)
        if len(syl) == nchars:
            return " ".join(syl)
    return None

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    old = {}
    if os.path.exists(INDEX):
        for x in json.load(open(INDEX, encoding="utf-8")):
            old[x["id"]] = x
    params = {"lang": "cmn", "has_audio": "yes", "sort": "words", "limit": "100",
              "include": "audios,transcriptions", "showtrans": "all"}
    url = API + "?" + urllib.parse.urlencode(params)
    items = dict(old)
    pages = 0; seen = 0; skipped = {"len": 0, "pinyin": 0, "licence": 0, "dl": 0}
    while url and len(items) < MAX and pages < 400:
        page = get(url)
        if not page:
            print("Inget svar för", url); break
        if pages == 0:
            print("Totalt enligt API:", page.get("paging", {}).get("total"))
            if page.get("data"):
                print("Exempel:", json.dumps(page["data"][0], ensure_ascii=False)[:1500])
        pages += 1
        for s in page.get("data", []):
            seen += 1
            sid = s.get("id"); text = (s.get("text") or "").strip()
            if s.get("script") == "Hant":
                alt = [t.get("text") for t in (s.get("transcriptions") or []) if t.get("type") == "altscript" and t.get("script") == "Hans"]
                if alt and alt[0]: text = alt[0].strip()
            if sid in items:
                continue
            chars = CJK.findall(text)
            if not (3 <= len(chars) <= 24) or re.search(r"[A-Za-z0-9０-９]", text):
                skipped["len"] += 1; continue
            py = pinyin_for(s, len(chars))
            if not py:
                skipped["pinyin"] += 1; continue
            auds = [a for a in (s.get("audios") or []) if (a.get("license") or a.get("licence") or "").strip()]
            if not auds:
                skipped["licence"] += 1; continue
            a = auds[0]
            dl = a.get("download_url") or f"https://api.tatoeba.org/v1/audios/{a['id']}/file"
            fn = f"{OUT_DIR}/{a['id']}.mp3"
            if not os.path.exists(fn):
                data = None
                for u in (dl, f"https://api.tatoeba.org/v1/audios/{a['id']}/file", f"https://tatoeba.org/audio/download/{a['id']}"):
                    data = get(u, binary=True, tries=2)
                    if data and len(data) >= 1000: break
                if not data or len(data) < 1000:
                    skipped["dl"] += 1; continue
                open(fn, "wb").write(data)
                time.sleep(0.25)
            tr = {}
            for t in s.get("translations") or []:
                lg = t.get("lang")
                if lg in ("eng", "swe") and lg not in tr:
                    tr[lg] = t.get("text")
            items[sid] = {"id": sid, "zh": text, "pinyin": py, "en": tr.get("eng", ""), "sv": tr.get("swe", ""),
                          "audio": f"{a['id']}.mp3", "author": a.get("author") or "", "licence": a.get("license") or a.get("licence"),
                          "attribution": a.get("attribution_url") or f"https://tatoeba.org/sentences/show/{sid}"}
            if len(items) >= MAX:
                break
        paging = page.get("paging") or {}
        url = paging.get("next") if paging.get("has_next") else None
        print(f"sida {pages}: {len(items)} meningar, sett {seen}, hoppat {skipped}")
    out = sorted(items.values(), key=lambda x: (len(x["zh"]), x["id"]))
    json.dump(out, open(INDEX, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    lic = {}
    for x in out: lic[x["licence"]] = lic.get(x["licence"], 0) + 1
    print("Klart:", len(out), "meningar. Licenser:", lic)

if __name__ == "__main__":
    main()
