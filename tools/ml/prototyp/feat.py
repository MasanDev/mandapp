from ev import *
import json
D=pickle.load(open('data.pkl','rb')); LP=pickle.load(open('lp_snu_hf.pkl','rb')); F0=json.load(open('f0.json'))
NP=8
def sylspans(lp,it):
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq)
    first={}; last={}
    for t,s in enumerate(path):
        if s%2==1:
            k=own[(s-1)//2][0]; first.setdefault(k,t); last[k]=t
    n=len(it['syls']); sp=[]
    for k in range(n):
        a=first.get(k); b=first.get(k+1, (last.get(k,a)+6))
        sp.append((a*0.02, b*0.02+0.01))
    return sp
def contour(f,a,b):
    st=f['st']; s0=f['start']; i0=max(0,int(round((a-s0)/0.01-2))); i1=min(len(st),int(round((b-s0)/0.01-2)))
    seg=[(i,v) for i,v in enumerate(st[i0:i1]) if v is not None]
    en=f['en'][i0:i1]
    return seg,(i1-i0),(float(np.mean(en)) if len(en) else 0.)
def sylfeat(f,a,b,mu,sd):
    seg,n,en=contour(f,a,b)
    if len(seg)<3: return np.r_[np.zeros(NP),0,b-a,en,0,0], False
    xs=np.array([i for i,_ in seg])/max(n-1,1); ys=(np.array([v for _,v in seg])-mu)/sd
    pts=np.interp(np.linspace(0,1,NP),xs,ys)
    sl=np.polyfit(xs,ys,1)[0] if len(seg)>2 else 0
    return np.r_[pts,len(seg)/max(n,1),b-a,en,sl,pts.min()], True
def item_feats(i):
    it=D[i]; f=F0[i]
    if f is None: return None
    sp=sylspans(LP[i].astype(np.float32),it)
    vals=[v for v in f['st'] if v is not None]; mu=np.mean(vals); sd=np.std(vals)+1e-3
    fs=[sylfeat(f,a,b,mu,sd) for a,b in sp]; n=len(fs); X=[]
    Z=np.zeros_like(fs[0][0])
    for k in range(n):
        prev=fs[k-1][0] if k>0 else Z; nxt=fs[k+1][0] if k+1<n else Z
        X.append(np.r_[fs[k][0],prev,nxt,k==0,k==n-1,k/max(n-1,1),sd, f['med']/200])
    return np.array(X),[x[1] for x in fs],sp
if __name__=='__main__':
    out=[]
    for i in range(len(D)):
        r=item_feats(i); out.append(r)
    pickle.dump(out,open('feats.pkl','wb'))
