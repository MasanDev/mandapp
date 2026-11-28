import warnings; warnings.filterwarnings('ignore')
import pickle,numpy as np,torch,random,json,sys
from collections import Counter
ck=torch.load('probe8aug.pt',weights_only=False)
def mk(sd): n=torch.nn.Sequential(torch.nn.Linear(sd['0.weight'].shape[1],128),torch.nn.GELU(),torch.nn.Dropout(0.3),torch.nn.Linear(128,4)); n.load_state_dict(sd); n.eval(); return n
net=mk(ck['nets']['hid'])
D=pickle.load(open('data.pkl','rb')); PX=pickle.load(open('px8.pkl','rb'))
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
H=[];y=[];G=[]
for it,px in zip(D,PX):
    if px is None or not ((it['set'],it['spk']) in TEST or it['set'] in('tonpar','tatoeba')): continue
    for k,t in enumerate(it['tones']):
        if t==5 or it['amb'][k] or not px[2][k] or it['lex'][k]!=t: continue
        H.append(px[1][k]); y.append(t-1); G.append(it['set'])
with torch.no_grad(): P=torch.softmax(net(torch.tensor((np.array(H,np.float32)-ck['hm'])/ck['hs'])),-1).numpy()
y=np.array(y); pe=P[np.arange(len(y)),y]
for th in (0.5,0.3,0.2,0.1,0.05):
    fa=(pe<th).mean(); print('flag if P(expected)<%.2f: native false alarm %.1f%%'%(th,100*fa), {g:'%.1f'%(100*(pe[np.array(G)==g]<th).mean()) for g in sorted(set(G))})
