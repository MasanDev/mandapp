import pickle,json,numpy as np,sys
from collections import Counter,defaultdict
SYM=json.load(open('/tmp/claude-0/models/snu_hf/symbols.json')); SI={s:i for i,s in enumerate(SYM)}
INI=['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h','j','q','x','r','z','c','s']
def split(s):
    if s.startswith('y'): return None,s
    if s.startswith('w'): return 'w',(s[1:] or 'u')
    for i in INI:
        if s.startswith(i) and len(s)>len(i):
            f=s[len(i):]
            if i in('l','n'): f=f.replace('ve','u:e').replace('v','u:')
            if i in('j','q','x'): f=f.replace('v','u')
            return i,f
    return None,s
def ftok(f,t):
    for c in [f+str(t),f+'5',f]:
        if c in SI: return SI[c]
    return None
def variants(f): return {t:SI[f+str(t)] for t in (1,2,3,4,5) if f+str(t) in SI}
def toks(syls,tones):
    seq=[];own=[]
    for k,(s,t) in enumerate(zip(syls,tones)):
        i,f=split(s)
        if i: seq.append(SI[i]); own.append((k,'i'))
        ft=ftok(f,t)
        if ft is None:
            v=variants(f); ft=list(v.values())[0] if v else SI['<unk>']
        seq.append(ft); own.append((k,'f',f))
    return seq,own
def align(lp,seq):
    T=lp.shape[0]; S=2*len(seq)+1; ext=[0]*S
    for j,t in enumerate(seq): ext[2*j+1]=t
    NEG=-1e9; dp=np.full((T,S),NEG); bp=np.zeros((T,S),int)
    dp[0,0]=lp[0,0]; dp[0,1]=lp[0,ext[1]]
    for t in range(1,T):
        for s in range(S):
            c=[(dp[t-1,s],s)]
            if s>0: c.append((dp[t-1,s-1],s-1))
            if s>1 and ext[s]!=0 and ext[s]!=ext[s-2]: c.append((dp[t-1,s-2],s-2))
            v,b=max(c); dp[t,s]=v+lp[t,ext[s]]; bp[t,s]=b
    s=S-1 if dp[T-1,S-1]>dp[T-1,S-2] else S-2
    path=[0]*T
    for t in range(T-1,-1,-1): path[t]=s; s=bp[t,s]
    return path  # state per frame
