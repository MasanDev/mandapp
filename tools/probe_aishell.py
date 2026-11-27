import json, re, collections
hsk = json.load(open("artifact/hsk.json", encoding="utf-8"))
ok5 = set(c for w, l in hsk.items() if l <= 5 for c in w); ok6 = set(c for w, l in hsk.items() if l <= 6 for c in w)
spk = {}
for line in open("spk.txt", encoding="utf-8"):
    p = line.split()
    if len(p) == 4 and not line.startswith("#"): spk[p[0]] = p[1:]
males = {s for s, v in spk.items() if v[1] == "male" and v[2] == "north"}
tot = collections.Counter(); g5 = collections.Counter(); g6 = collections.Counter(); ex = collections.defaultdict(list)
for f in ("train.txt", "test.txt"):
    for line in open(f, encoding="utf-8"):
        p = line.split()
        if not p: continue
        s = p[0][:7]
        if s not in males: continue
        ch = re.findall(r"[㐀-鿿]", "".join(p[1:]))
        tot[s] += 1
        if 4 <= len(ch) <= 24 and all(c in ok5 for c in ch): g5[s] += 1
        if 4 <= len(ch) <= 24 and sum(c not in ok6 for c in ch) <= 1:
            g6[s] += 1
            if len(ex[s]) < 6: ex[s].append("".join(ch))
print("format exempel:", open("train.txt", encoding="utf-8").readline().strip())
print("norra män:", len(males))
for s in sorted(males, key=lambda s: -g6[s])[:15]: print(s, spk[s], "tot", tot[s], "hsk5", g5[s], "mild", g6[s], ex[s][:6])
