"""Hämtar utvalda manliga, nordliga röster ur AISHELL-3 (Apache 2.0) från Hugging Face.
Skriver audio/aishell/*.mp3 och audio/aishell.json ({voices, items})."""
import json, os, re, subprocess, urllib.request, urllib.error, collections, time
H = "https://huggingface.co/datasets/AISHELL/AISHELL-3/resolve/main/"
GROUPS = [g.split(":") for g in os.environ.get("GROUPS", "male:north:4,male:south:3,female:north:3,female:south:3").split(",")]; PER = int(os.environ.get("PER_SPEAKER", "150"))
OUT = "audio/aishell"; os.makedirs(OUT, exist_ok=True)
def get(p):
    for t in range(8):
        try:
            d = urllib.request.urlopen(H + p, timeout=120).read(); time.sleep(0.4); return d
        except urllib.error.HTTPError as e:
            if e.code != 429 or t == 7: raise
            w = int(e.headers.get("Retry-After") or 0) or 30 * (t + 1); print("429, väntar", w, "s"); time.sleep(min(w, 300))
hsk = json.load(open("artifact/hsk.json", encoding="utf-8"))
lvl = {}
for w, l in hsk.items():
    for c in w: lvl[c] = min(lvl.get(c, 9), l)
NUM = set("零一二三四五六七八九十百千万亿点两")
BAD = re.compile(r"歌|播放|放一首|来一首|点一首|调至|调到|模式|空调|电视|窗帘|台湾|股|证监|有什么$|的信息$")
spk = {}
for line in get("spk-info.txt").decode("utf-8").splitlines():
    p = line.split()
    if len(p) == 4 and not line.startswith("#"): spk[p[0]] = p[1:]
males = {s for s, v in spk.items() if any(v[1] == g and v[2] == a for g, a, _ in GROUPS)}
AGE = {"A": "under 14", "B": "14–25", "C": "26–40", "D": "över 40"}
cand = collections.defaultdict(list)
for split in ("train", "test"):
    for line in get(split + "/content.txt").decode("utf-8").splitlines():
        p = line.split()
        if len(p) < 3: continue
        f = p[0]; s = f[:7]
        if s not in males: continue
        toks = p[1:]; ch = toks[0::2]; py = toks[1::2]
        if len(ch) != len(py) or not all(re.match(r"^[㐀-鿿]$", c) for c in ch): continue
        zh = "".join(ch)
        if not 5 <= len(ch) <= 18 or BAD.search(zh): continue
        if sum(c in NUM for c in ch) > len(ch) * 0.3: continue
        hard = [c for c in ch if lvl.get(c, 9) > 6]
        if len(hard) > 1: continue
        score = sum(lvl.get(c, 9) for c in ch) / len(ch) + 3 * len(hard) + (2 if len(ch) > 14 else 0)
        cand[s].append((score, f, split, zh, " ".join(py)))
chosen = [s for g, a, n in GROUPS for s in sorted([s for s in males if spk[s][1] == g and spk[s][2] == a], key=lambda s: -len(cand[s]))[:int(n)]]
voices, items = [], []
for k, s in enumerate(chosen, 1):
    seen = set(); n = 0
    for score, f, split, zh, py in sorted(cand[s]):
        if n >= PER: break
        if zh in seen: continue
        fn = f"{OUT}/{f[:-4]}.mp3"
        if os.path.exists(fn) and os.path.getsize(fn) > 1000:
            seen.add(zh); n += 1
            items.append({"id": f[:-4], "zh": zh, "pinyin": py, "audio": f[:-4] + ".mp3", "speaker": s, "voice": f"Röst {k}"}); continue
        try: wav = get(f"{split}/wav/{s}/{f}")
        except Exception as e: print("miss", f, e); continue
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", "pipe:0", "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,adelay=150", "-ac", "1", "-ar", "22050", "-b:a", "48k", fn], input=wav)
        if r.returncode or not os.path.exists(fn): continue
        seen.add(zh); n += 1
        items.append({"id": f[:-4], "zh": zh, "pinyin": py, "audio": f[:-4] + ".mp3", "speaker": s, "voice": f"Röst {k}"})
    gen = spk[s][1]; acc = spk[s][2]
    label = f"Röst {k}: {'man' if gen == 'male' else 'kvinna'}, {AGE.get(spk[s][0], '')} år, {'nord' if acc == 'north' else 'syd'}"
    if n: voices.append({"speaker": s, "label": label, "age": spk[s][0], "gender": gen, "accent": acc, "n": n})
    print("röst", k, s, spk[s], "kandidater", len(cand[s]), "valda", n, [i["zh"] for i in items if i["speaker"] == s][:8])
json.dump({"voices": voices, "items": items}, open("audio/aishell.json", "w", encoding="utf-8"), ensure_ascii=False)
print("Klart:", voices)
