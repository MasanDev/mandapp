from ev import *
D=pickle.load(open('data.pkl','rb')); LP=pickle.load(open(sys.argv[1],'rb'))
res=defaultdict(Counter); conf=defaultdict(Counter); free=defaultdict(Counter)
rows=[]
import random
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
ONLY=len(sys.argv)>2
for it,lp in zip(D,LP):
    if lp is None: continue
    if ONLY and not ((it['set'],it['spk']) in TEST or it['set'] in ('tonpar','tatoeba')): continue
    lp=lp.astype(np.float32); seq,own=toks(it['syls'],it['tones'])
    if lp.shape[0]<len(seq)*2: continue
    path=align(lp,seq); T=len(path)
    # token index per frame (state odd -> token (s-1)//2); blanks attach to previous token
    tokf=defaultdict(list); cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur>=0: tokf[cur].append(t)
    for j,o in enumerate(own):
        if o[1]!='f': continue
        k=o[0]; e=it['tones'][k]; lx=it['lex'][k]
        if e==5 or it['amb'][k]: continue
        v={t:i for t,i in variants(o[2]).items() if t<=4}
        if e not in v or len(v)<2: continue
        fr=tokf[j]; sc={t:lp[fr,i].max() for t,i in v.items()}
        p=max(sc,key=sc.get); g=it['set']
        res[g]['n']+=1; res[g]['ok']+=p==e; res[g]['oklex']+=p==lx
        if lx!=e: res[g]['sandhi_n']+=1; res[g]['sandhi_surf']+=p==e; res[g]['sandhi_lex']+=p==lx
        conf[g][(e,p)]+=1
        rows.append((g,it['id'],k,e,lx,p,{t:float(s) for t,s in sc.items()}))
for g in res:
    r=res[g]; print(g, 'n',r['n'],'surf acc %.1f'%(100*r['ok']/r['n']), 'lex acc %.1f'%(100*r['oklex']/r['n']), 'sandhi syl',r['sandhi_n'],'->surf',r['sandhi_surf'],'lex',r['sandhi_lex'])
    print('  ',[[conf[g][(e,p)] for p in (1,2,3,4)] for e in (1,2,3,4)])
pickle.dump(rows,open('rows_'+sys.argv[1],'wb'))
