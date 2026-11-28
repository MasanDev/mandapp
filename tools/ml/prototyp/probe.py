from ev import *
import json,random,torch
import feat as FE
L=int(sys.argv[1]) if len(sys.argv)>1 else 8
D=FE.D; F0=FE.F0
LPs=pickle.load(open(f'lp_l{L}.pkl','rb')) if L!=24 else pickle.load(open('lp_snu_hf.pkl','rb'))
H=pickle.load(open(f'hid{L}.pkl','rb'))
def spans_frames(lp,it):
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq); fr=defaultdict(list); cur=-1
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur>=0: fr[own[cur][0]].append(t)
    return fr
def item_X(it,lp,h,f):
    """features per syllable: hidden mean (span), pitch feats"""
    if f is None: return None
    fr=spans_frames(lp,it); n=len(it['syls'])
    FE.LP_override=lp
    # pitch spans from same alignment
    sp=[]
    for k in range(n):
        a=fr[k][0]; b=fr[k+1][0] if k+1<n else fr[k][-1]+1
        sp.append((a*0.02,b*0.02+0.01))
    vals=[v for v in f['st'] if v is not None]; mu=np.mean(vals); sd=np.std(vals)+1e-3
    fs=[FE.sylfeat(f,a,b,mu,sd) for a,b in sp]; Z=np.zeros_like(fs[0][0])
    P=[];Hh=[]
    for k in range(n):
        prev=fs[k-1][0] if k>0 else Z; nxt=fs[k+1][0] if k+1<n else Z
        P.append(np.r_[fs[k][0],prev,nxt,k==0,k==n-1,sd]); Hh.append(h[fr[k]].astype(np.float32).mean(0))
    return np.array(P),np.array(Hh),[x[1] for x in fs]
if __name__=='__main__':
    spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
    out=[]
    for i,it in enumerate(D):
        out.append(item_X(it,LPs[i].astype(np.float32),H[i],F0[i]))
    pickle.dump(out,open(f'px{L}.pkl','wb'))
