import warnings; warnings.filterwarnings('ignore')
from probe import *
from transformers import Wav2Vec2ForCTC
L=int(sys.argv[1]); PT=sys.argv[2] if len(sys.argv)>2 else f'probe{L}.pt'
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/snu_hf').eval(); torch.set_num_threads(4)
m.wav2vec2.encoder.layers=m.wav2vec2.encoder.layers[:L]; m.wav2vec2.encoder.layer_norm=torch.nn.Identity()
head=torch.nn.Sequential(torch.nn.LayerNorm(1024),torch.nn.Linear(1024,1024),torch.nn.GELU(),torch.nn.Linear(1024,218)); head.load_state_dict(torch.load(f'head{L}.pt')); head.eval()
ck=torch.load(PT,weights_only=False)
def mk(n):
    return torch.nn.Sequential(torch.nn.Linear(n,128),torch.nn.GELU(),torch.nn.Dropout(0.3),torch.nn.Linear(128,4))
nets={}
for k,sd in ck['nets'].items(): net=mk(sd['0.weight'].shape[1]); net.load_state_dict(sd); net.eval(); nets[k]=net
meta=pickle.load(open('mmeta.pkl','rb')); lens=json.load(open('mwavlen.json')); MF=json.load(open('mf0.json'))
buf=np.fromfile('mwavs.bin',np.float32); off=0
st=defaultdict(Counter); REC=[]
for j,(md,n) in enumerate(zip(meta,lens)):
    x=buf[off:off+n]; off+=n; it=D[md['n']]; k=md['k']; e=md['e']; nt=md['nt']
    xx=(x-x.mean())/(x.std()+1e-7)
    with torch.no_grad():
        h=m.wav2vec2(torch.tensor(xx)[None]).last_hidden_state[0]; lp=torch.log_softmax(head(h),-1).numpy()
    r=item_X(it,lp,h.numpy(),MF[j])
    if r is None: continue
    P,Hh,ok=r
    p_=(P[k]-ck['pm'])/ck['ps']; h_=(Hh[k]-ck['hm'])/ck['hs']
    preds={}
    with torch.no_grad():
        for name,net in nets.items():
            xin={'pitch':p_,'hid':h_,'both':np.r_[p_,h_]}[name]
            preds[name]=int(net(torch.tensor(xin,dtype=torch.float32)[None]).argmax())+1
    with torch.no_grad(): pr=torch.softmax(nets['hid'](torch.tensor(h_,dtype=torch.float32)[None]),-1)[0].numpy()
    REC.append((e,nt,pr))
    # GOP student
    seq,own=toks(it['syls'],it['tones']); path=align(lp,seq); tf=[];cur=-1
    jf=[q for q,o in enumerate(own) if o[0]==k and o[1]=='f'][0]
    for t,s in enumerate(path):
        if s%2==1: cur=(s-1)//2
        if cur==jf: tf.append(t)
    v={t:i for t,i in variants(own[jf][2]).items() if t<=4}; sc={t:lp[tf,i].max() for t,i in v.items()}; preds['gop']=max(sc,key=sc.get)
    for name,p in preds.items():
        if nt==0: st[name]['ctrl_n']+=1; st[name]['ctrl_ok']+=p==e
        else: st[name]['n']+=1; st[name]['detect']+=p!=e; st[name]['exact']+=p==nt
for name,s in st.items():
    print(name,'native(vocoded) acc %.1f'%(100*s['ctrl_ok']/s['ctrl_n']),'| wrong-tone detected %.1f exact %.1f'%(100*s['detect']/s['n'],100*s['exact']/s['n']),s['ctrl_n'],s['n'])

pickle.dump(REC,open('mrec.pkl','wb'))
