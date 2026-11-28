import pickle,torch,numpy as np,sys
from transformers import Wav2Vec2ForCTC
D=pickle.load(open('data.pkl','rb'))
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/'+sys.argv[1]).eval(); torch.set_num_threads(4)
out=[]
for i,it in enumerate(D):
    x=it['wav']; x=(x-x.mean())/(x.std()+1e-7)
    with torch.no_grad(): lg=torch.log_softmax(m(torch.tensor(x)[None]).logits[0],-1)
    out.append(lg.numpy().astype(np.float16))
    if i%200==0: print(i,flush=True)
pickle.dump(out,open('lp_'+sys.argv[1]+'.pkl','wb'))
