from ev import *
D=pickle.load(open('data.pkl','rb')); LP=pickle.load(open(sys.argv[1],'rb'))
G=[['s','sh','x'],['z','zh','j'],['c','ch','q'],['b','p'],['d','t'],['g','k'],['z','c'],['zh','ch'],['j','q'],['n','l'],['r','l'],['f','h']]
comp={}
for g in G:
    for i in g: comp.setdefault(i,set()).update(g)
res=defaultdict(Counter)
import random
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
ONLY=len(sys.argv)>2
for it,lp in zip(D,LP):
    if lp is None: continue
    if ONLY and not ((it['set'],it['spk']) in TEST or it['set'] in ('tonpar','tatoeba')): continue
    lp=lp.astype(np.float32); seq,own=toks(it['syls'],it['tones'])
    if lp.shape[0]<len(seq)*2: continue
    path=align(lp,seq); tokf=defaultdict(list); cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur>=0: tokf[cur].append(t)
    for j,o in enumerate(own):
        if o[1]!='i' or o[0]>=len(it['syls']): continue
        i=SYM[seq[j]]
        if i not in comp: continue
        fr=tokf[j]; sc={c:lp[fr,SI[c]].max() for c in comp[i]}; p=max(sc,key=sc.get)
        res[i]['n']+=1; res[i]['ok']+=p==i; res[i]['->'+p]+=1
tot=sum(r['n'] for r in res.values()); ok=sum(r['ok'] for r in res.values())
print('all %.1f%% of %d'%(100*ok/tot,tot))
for i in sorted(res): r=res[i]; print(i,r['n'],'%.1f'%(100*r['ok']/r['n']),{k:v for k,v in r.items() if k.startswith('->') and k!='->'+i})
