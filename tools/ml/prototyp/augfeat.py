import warnings; warnings.filterwarnings('ignore')
from probe import *
from transformers import Wav2Vec2ForCTC
L=8
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/snu_hf').eval(); torch.set_num_threads(4)
m.wav2vec2.encoder.layers=m.wav2vec2.encoder.layers[:L]; m.wav2vec2.encoder.layer_norm=torch.nn.Identity()
head=torch.nn.Sequential(torch.nn.LayerNorm(1024),torch.nn.Linear(1024,1024),torch.nn.GELU(),torch.nn.Linear(1024,218)); head.load_state_dict(torch.load(f'head{L}.pt')); head.eval()
meta=pickle.load(open('tmeta.pkl','rb')); lens=json.load(open('twavlen.json')); MF=json.load(open('tf0.json'))
buf=np.memmap('twavs.bin',np.float32,'r'); off=0; out=[]
for j,(md,n) in enumerate(zip(meta,lens)):
    x=np.array(buf[off:off+n]); off+=n; it=D[md['n']]; k=md['k']
    xx=(x-x.mean())/(x.std()+1e-7)
    with torch.no_grad(): h=m.wav2vec2(torch.tensor(xx)[None]).last_hidden_state[0]; lp=torch.log_softmax(head(h),-1).numpy()
    r=item_X(it,lp,h.numpy(),MF[j])
    if r is None or not r[2][k]: continue
    out.append((md,r[0][k],r[1][k]))
pickle.dump(out,open('augX.pkl','wb')); print(len(out))
