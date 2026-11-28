import warnings; warnings.filterwarnings('ignore')
from ev import *
import pyworld as pw, torch, random
from transformers import Wav2Vec2ForCTC
D=pickle.load(open('data.pkl','rb')); LP=pickle.load(open('lp_snu_hf.pkl','rb'))
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/snu_hf').eval(); torch.set_num_threads(4)
def logp(x):
    x=(x-x.mean())/(x.std()+1e-7)
    with torch.no_grad(): return torch.log_softmax(m(torch.tensor(x,dtype=torch.float32)[None]).logits[0],-1).numpy()
def spans(lp,it):
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq)
    tokf=defaultdict(list); cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur>=0: tokf[cur].append(t)
    syl=defaultdict(list); fin={}
    for j,o in enumerate(own):
        syl[o[0]]+=tokf[j]
        if o[1]=='f': fin[o[0]]=(j,o[2])
    return syl,fin
def judge(lp,it,k):
    syl,fin=spans(lp,it); j,f=fin[k]; v={t:i for t,i in variants(f).items() if t<=4}
    # frames of final token
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq)
    tokf=[];cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur==j: tokf.append(t)
    sc={t:lp[tokf,i].max() for t,i in v.items()}; return max(sc,key=sc.get)
LV={1:(5,5),2:(2.5,5),3:(1.8,1),4:(5,1.2)}
random.seed(1); cands=[]
for n,(it,lp) in enumerate(zip(D,LP)):
    if it['set'] not in('aishell','stcmds'): continue
    for k,e in enumerate(it['tones']):
        if e in(1,2,3,4) and not it['amb'][k] and e==it['lex'][k] and (k==0 or it['lex'][k-1]!=3 or e!=3) and (k+1>=len(it['lex']) or it['lex'][k+1]!=3 or e!=3):
            cands.append((n,k))
random.shuffle(cands); cands=cands[:int(sys.argv[1])]
st=Counter(); conf=Counter()
for c,(n,k) in enumerate(cands):
    it=D[n]; x=it['wav'].astype(np.float64); e=it['tones'][k]
    f0,tt=pw.harvest(x,16000,f0_floor=60,f0_ceil=500,frame_period=5); sp=pw.cheaptrick(x,f0,tt,16000); ap=pw.d4c(x,f0,tt,16000)
    vo=f0[f0>0]
    if len(vo)<20: continue
    lo,hi=np.percentile(12*np.log2(vo),[10,90])
    syl,_=spans(LP[n].astype(np.float32),it); fr=syl[k]
    a,b=min(fr)*20,(max(fr)+1)*20  # ms
    idx=np.where((tt*1000>=a)&(tt*1000<b)&(f0>0))[0]
    if len(idx)<6: continue
    i0,i1=idx[0],idx[-1]
    ctrl=pw.synthesize(f0,sp,ap,16000,5)
    pc=judge(logp(ctrl),it,k); st['ctrl_n']+=1; st['ctrl_ok']+=pc==e
    if pc!=e: continue
    for nt in (1,2,3,4):
        if nt==e: continue
        g=f0.copy(); L=np.linspace(0,1,i1-i0+1); s0,s1=LV[nt]
        lev=s0+(s1-s0)*L
        if nt==3: lev=1.8-0.8*np.sin(np.pi*np.minimum(L*1.3,1))  # dip
        stv=lo+(hi-lo)*(lev-1)/4; seg=2**(stv/12)
        g[i0:i1+1]=np.where(f0[i0:i1+1]>0,seg,0)
        y=pw.synthesize(g,sp,ap,16000,5); p=judge(logp(y),it,k)
        st['n']+=1; st['detect']+=p!=e; st['exact']+=p==nt; conf[(e,nt,p)]+=1
    if c%25==0: print(c,dict(st),flush=True)
print(dict(st)); 
for e in (1,2,3,4):
    for nt in (1,2,3,4):
        if e!=nt: print(e,'->',nt,[conf[(e,nt,p)] for p in (1,2,3,4)])
