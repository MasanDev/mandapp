import pickle,torch,numpy as np
from transformers import Wav2Vec2ForCTC
D=pickle.load(open('data.pkl','rb'))
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/snu_hf').eval(); torch.set_num_threads(4)
L=[6,8,10,12,16]; out={l:[] for l in L}
for i,it in enumerate(D):
    x=it['wav']; x=(x-x.mean())/(x.std()+1e-7)
    with torch.no_grad(): hs=m.wav2vec2(torch.tensor(x)[None],output_hidden_states=True).hidden_states
    for l in L: out[l].append(hs[l][0].numpy().astype(np.float16))
    if i%300==0: print(i,flush=True)
for l in L: pickle.dump(out[l],open(f'hid{l}.pkl','wb'),protocol=4)
