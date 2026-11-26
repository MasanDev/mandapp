"""Strömmar Free ST Chinese Mandarin Corpus (OpenSLR 38, CC BY-NC-ND 4.0) och plockar ut
vardagsmeningar på ungefär HSK 1–5-nivå. Ljudet konverteras till mp3 (endast formatbyte, inget redigerat).
Laddar bara ner så mycket av arkivet som behövs."""
import io, json, os, re, subprocess, sys, tarfile, urllib.request, collections

MAX = int(os.environ.get("MAX_SENTENCES", "1500"))
PER_SPK = int(os.environ.get("PER_SPEAKER", "8"))
URLS = ["https://openslr.trmal.net/resources/38/ST-CMDS-20170001_1-OS.tar.gz",
        "https://openslr.elda.org/resources/38/ST-CMDS-20170001_1-OS.tar.gz"]
OUT = "audio/stcmds"; INDEX = "audio/stcmds.json"
from pypinyin import pinyin, Style

hsk = json.load(open("artifact/hsk.json", encoding="utf-8"))
ok_chars = set(c for w, l in hsk.items() if l <= 5 for c in w)
CJK = re.compile(r"[㐀-鿿]")

def good(text):
    chars = CJK.findall(text)
    if not (5 <= len(chars) <= 18): return False
    if re.search(r"[A-Za-z0-9０-９]", text): return False
    unknown = [c for c in chars if c not in ok_chars]
    return len(unknown) == 0

def to_mp3(wav_bytes, path):
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0", "-ac", "1", "-ar", "22050", "-b:a", "48k", path], input=wav_bytes)
    return p.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 1000

def main():
    os.makedirs(OUT, exist_ok=True)
    items = []; per = collections.Counter(); seen_text = set(); pending = {}
    for url in URLS:
        try:
            resp = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mandapp-personal-study/1.0"}), timeout=120)
            break
        except Exception as e:
            print("misslyckades", url, e); resp = None
    if not resp: sys.exit("kunde inte hämta arkivet")
    tf = tarfile.open(fileobj=resp, mode="r|gz"); n = 0
    for m in tf:
        n += 1
        if not m.isfile(): continue
        base, ext = os.path.splitext(os.path.basename(m.name))
        if ext not in (".wav", ".txt"): continue
        data = tf.extractfile(m).read()
        d = pending.setdefault(base, {}); d[ext] = data
        if ".wav" in d and ".txt" in d:
            del pending[base]
            raw = d[".txt"]
            try: text = raw.decode("utf-8").strip()
            except UnicodeDecodeError: text = raw.decode("gbk", "ignore").strip()
            text = text.replace(" ", "")
            spk = base[:14]
            if n < 20: print("exempel:", base, text)
            if text in seen_text or per[spk] >= PER_SPK or not good(text): continue
            py = " ".join(x[0] for x in pinyin(text, style=Style.TONE3, neutral_tone_with_five=True, errors="ignore") if re.match(r"^[a-zü]+[1-5]$", x[0].replace("v", "ü")))
            py = py.replace("ü", "v")
            if len(py.split()) != len(CJK.findall(text)): continue
            fn = f"{OUT}/{base}.mp3"
            if not to_mp3(d[".wav"], fn): continue
            seen_text.add(text); per[spk] += 1
            items.append({"id": base, "zh": text, "pinyin": py, "audio": base + ".mp3", "speaker": spk})
            if len(items) % 100 == 0: print(len(items), "meningar,", len(per), "talare, poster lästa", n)
            if len(items) >= MAX: break
        if len(pending) > 5000: pending.clear()
    items.sort(key=lambda x: (len(x["zh"]), x["id"]))
    json.dump(items, open(INDEX, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("Klart:", len(items), "meningar från", len(per), "talare")

main()
