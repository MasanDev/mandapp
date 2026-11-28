import warnings; warnings.filterwarnings('ignore')
from ev import *
import pyworld as pw, random, json
D=pickle.load(open('data.pkl','rb')); LP=pickle.load(open('lp_snu_hf.pkl','rb'))
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
def sylspan(lp,it,k):
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq); fr=[]; cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur>=0 and own[cur][0]==k: fr.append(t)
    return fr
LV={1:(5,5),2:(2.5,5),4:(5,1.2)}
random.seed(2); cands=[]
for n,it in enumerate(D):
    if (it['set'],it['spk']) not in TEST: continue
    for k,e in enumerate(it['tones']):
        if e in(1,2,3,4) and not it['amb'][k] and e==it['lex'][k] and not (e==3 and ((k>0 and it['lex'][k-1]==3) or (k+1<len(it['lex']) and it['lex'][k+1]==3))):
            cands.append((n,k))
random.shuffle(cands); cands=cands[:int(sys.argv[1])]
meta=[]; f=open('mwavs.bin','wb'); lens=[]
for n,k in cands:
    it=D[n]; x=it['wav'].astype(np.float64); e=it['tones'][k]
    f0,tt=pw.harvest(x,16000,f0_floor=60,f0_ceil=500,frame_period=5); sp=pw.cheaptrick(x,f0,tt,16000); ap=pw.d4c(x,f0,tt,16000)
    vo=f0[f0>0]
    if len(vo)<20: continue
    lo,hi=np.percentile(12*np.log2(vo),[10,90]); fr=sylspan(LP[n].astype(np.float32),it,k)
    a,b=min(fr)*20,(max(fr)+1)*20
    idx=np.where((tt*1000>=a)&(tt*1000<b)&(f0>0))[0]
    if len(idx)<6: continue
    i0,i1=idx[0],idx[-1]
    for nt in (0,1,2,3,4):
        if nt==e: continue
        g=f0.copy()
        if nt:
            L=np.linspace(0,1,i1-i0+1)
            if nt==3: lev=1.8-0.8*np.sin(np.pi*np.minimum(L*1.3,1))
            else: s0,s1=LV[nt]; lev=s0+(s1-s0)*L
            seg=2**((lo+(hi-lo)*(lev-1)/4)/12); g[i0:i1+1]=np.where(f0[i0:i1+1]>0,seg,0)
        y=pw.synthesize(g,sp,ap,16000,5).astype(np.float32)
        f.write(y.tobytes()); lens.append(len(y)); meta.append(dict(n=n,k=k,e=e,nt=nt))
json.dump(lens,open('mwavlen.json','w')); pickle.dump(meta,open('mmeta.pkl','wb')); print(len(meta))
