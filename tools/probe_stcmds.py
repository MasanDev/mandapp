"""Visar vilka metadata ST-CMDS-arkivet har (filtyper, exempel på .metadata och andra textfiler)."""
import collections, os, tarfile, urllib.request
URLS = ["https://openslr.trmal.net/resources/38/ST-CMDS-20170001_1-OS.tar.gz", "https://openslr.elda.org/resources/38/ST-CMDS-20170001_1-OS.tar.gz"]
resp = None
for u in URLS:
    try: resp = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "mandapp-personal-study/1.0"}), timeout=120); break
    except Exception as e: print("fel", u, e)
tf = tarfile.open(fileobj=resp, mode="r|gz"); ext = collections.Counter(); shown = collections.Counter(); n = 0
for m in tf:
    n += 1
    e = os.path.splitext(m.name)[1].lower(); ext[e] += 1
    if m.isfile() and e not in (".wav",) and shown[e] < 4:
        shown[e] += 1
        print("=====", m.name); print(tf.extractfile(m).read()[:800].decode("utf-8", "replace"))
    if n > int(os.environ.get("N", "6000")): break
print("filtyper:", ext.most_common())
