import pickle,torch,numpy as np,random,sys
l=int(sys.argv[1])
D=pickle.load(open('data.pkl','rb')); H=pickle.load(open(f'hid{l}.pkl','rb')); LP=pickle.load(open('lp_snu_hf.pkl','rb'))
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); test=set(spk[:len(spk)//5])
tr=[i for i,it in enumerate(D) if it['set'] in('aishell','stcmds') and (it['set'],it['spk']) not in test]
torch.manual_seed(0); torch.set_num_threads(4)
head=torch.nn.Sequential(torch.nn.LayerNorm(1024),torch.nn.Linear(1024,1024),torch.nn.GELU(),torch.nn.Linear(1024,218))
X=torch.tensor(np.concatenate([H[i] for i in tr]).astype(np.float32)); Y=torch.tensor(np.concatenate([LP[i] for i in tr]).astype(np.float32)).exp()
opt=torch.optim.AdamW(head.parameters(),1e-3,weight_decay=1e-2); N=len(X)
for ep in range(8):
    perm=torch.randperm(N); tot=0
    for b in range(0,N,1024):
        idx=perm[b:b+1024]; out=torch.log_softmax(head(X[idx]),-1)
        loss=-(Y[idx]*out).sum(-1).mean(); opt.zero_grad(); loss.backward(); opt.step(); tot+=loss.item()*len(idx)
    print(ep,tot/N,flush=True)
with torch.no_grad(): out=[torch.log_softmax(head(torch.tensor(h.astype(np.float32))),-1).numpy().astype(np.float16) for h in H]
pickle.dump(out,open(f'lp_l{l}.pkl','wb')); torch.save(head.state_dict(),f'head{l}.pt')
