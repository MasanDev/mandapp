"""Plockar ut meningar från några utvalda manliga talare i Free ST Chinese Mandarin Corpus (OpenSLR 38, CC BY-NC-ND 4.0).
Varje inspelning har metadata (SEX, AGE, BIR = födelseort). Vi samlar meningar från män födda i norra Kina,
där uttalet ligger närmast standardmandarin (putonghua bygger på Pekingdialekten), plus Shaanxi/Xi'an.
Sedan väljs de talare som har flest användbara meningar. Ljudet konverteras bara till mp3."""
import json, os, re, subprocess, sys, tarfile, urllib.request, collections, shutil
sys.path.insert(0, os.path.dirname(__file__))
from pypinyin import pinyin, Style

N_STD = int(os.environ.get("N_STANDARD", "4"))     # talare från Peking/norr
N_XIAN = int(os.environ.get("N_XIAN", "2"))        # talare från Xi'an/Shaanxi
PER = int(os.environ.get("PER_SPEAKER", "120"))
URLS = ["https://openslr.trmal.net/resources/38/ST-CMDS-20170001_1-OS.tar.gz", "https://openslr.elda.org/resources/38/ST-CMDS-20170001_1-OS.tar.gz"]
OUT = "audio/rost"; INDEX = "audio/rost.json"; TMP = "/tmp/rost"
STD = ["北京", "天津", "河北", "承德", "黑龙江", "哈尔滨", "吉林", "长春", "辽宁", "沈阳", "大连"]
XIAN = ["西安", "陕西"]
REGION_SV = {"北京": "Peking", "天津": "Tianjin", "河北": "Hebei", "承德": "Chengde", "黑龙江": "Heilongjiang", "哈尔滨": "Harbin", "吉林": "Jilin", "长春": "Changchun", "辽宁": "Liaoning", "沈阳": "Shenyang", "大连": "Dalian", "西安": "Xi'an", "陕西": "Shaanxi"}

hsk = json.load(open("artifact/hsk.json", encoding="utf-8"))
ok_chars = set(c for w, l in hsk.items() if l <= 6 for c in w)
CJK = re.compile(r"[㐀-鿿]")
def good(t):
    ch = CJK.findall(t)
    return 4 <= len(ch) <= 24 and not re.search(r"[A-Za-z0-9０-９]", t) and sum(c not in ok_chars for c in ch) <= 1
def meta(raw):
    d = {}
    for line in raw.decode("utf-8", "ignore").splitlines():
        p = line.strip().split(None, 1)
        if p: d[p[0]] = p[1].strip() if len(p) > 1 else ""
    return d
def group(bir):
    if any(k in bir for k in XIAN): return "xian"
    if any(k in bir for k in STD): return "std"
    return None
def region_sv(bir):
    for k, v in REGION_SV.items():
        if k in bir: return v
    return bir

def main():
    os.makedirs(TMP, exist_ok=True)
    resp = None
    for u in URLS:
        try: resp = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "mandapp-personal-study/1.0"}), timeout=120); break
        except Exception as e: print("fel", u, e)
    if not resp: sys.exit("kunde inte hämta arkivet")
    tf = tarfile.open(fileobj=resp, mode="r|gz")
    pending = {}; spk = {}; got = collections.defaultdict(list); seen = collections.defaultdict(set); n = 0; males = collections.Counter()
    for m in tf:
        n += 1
        if n % 50000 == 0: print("poster", n, "kandidater", {k: len(v) for k, v in sorted(got.items(), key=lambda x: -len(x[1]))[:12]})
        if not m.isfile(): continue
        base, ext = os.path.splitext(os.path.basename(m.name))
        if ext not in (".wav", ".txt", ".metadata"): continue
        s = base[:14]
        if s in spk and spk[s] is None: continue  # talare vi inte vill ha
        d = pending.setdefault(base, {}); d[ext] = tf.extractfile(m).read()
        if ".metadata" in d and s not in spk:
            md = meta(d[".metadata"]); bir = md.get("BIR", ""); sex = md.get("SEX", "")
            if sex in ("男", "M", "Male"): males[bir] += 1
            g = group(bir) if sex in ("男", "M", "Male") else None
            spk[s] = {"group": g, "bir": bir, "age": md.get("AGE", ""), "region": region_sv(bir)} if g else None
            if spk[s]: print("talare", s, sex, md.get("AGE"), bir, g)
        if len(d) == 3:
            del pending[base]
            info = spk.get(s)
            if not info or len(got[s]) >= PER: continue
            raw = d[".txt"]
            try: text = raw.decode("utf-8").strip()
            except UnicodeDecodeError: text = raw.decode("gbk", "ignore").strip()
            text = text.replace(" ", "")
            if text in seen[s] or not good(text): continue
            py = " ".join(x[0] for x in pinyin(text, style=Style.TONE3, neutral_tone_with_five=True, errors="ignore") if re.match(r"^[a-zü]+[1-5]$", x[0].replace("v", "ü"))).replace("ü", "v")
            if len(py.split()) != len(CJK.findall(text)): continue
            fn = f"{TMP}/{base}.mp3"
            p = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0", "-ac", "1", "-ar", "22050", "-b:a", "48k", fn], input=d[".wav"])
            if p.returncode or not os.path.exists(fn): continue
            seen[s].add(text); got[s].append({"id": base, "zh": text, "pinyin": py, "audio": base + ".mp3", "speaker": s})
        if len(pending) > 5000: pending.clear()
    print("Män per födelseort (topp 30):", males.most_common(30))
    def pick(g, k): return sorted([s for s in got if spk[s] and spk[s]["group"] == g and got[s]], key=lambda s: -len(got[s]))[:k]
    chosen = pick("std", N_STD) + pick("xian", N_XIAN)
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT); items = []; voices = []
    for i, s in enumerate(chosen, 1):
        info = spk[s]; label = f"Röst {i}: man, {info['age']} år, {info['region']}"
        voices.append({"speaker": s, "label": label, "region": info["region"], "bir": info["bir"], "age": info["age"], "n": len(got[s])})
        for x in got[s]:
            shutil.copy(f"{TMP}/{x['audio']}", f"{OUT}/{x['audio']}"); x["voice"] = label; items.append(x)
    json.dump({"voices": voices, "items": items}, open(INDEX, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("Klart:", voices)

main()
