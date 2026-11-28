import pickle,numpy as np,random,torch,sys
L=int(sys.argv[1])
D=pickle.load(open('data.pkl','rb')); PX=pickle.load(open(f'px{L}.pkl','rb'))
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
def rows(cond):
    P=[];H=[];y=[];g=[]
    for it,px in zip(D,PX):
        if px is None or not cond(it): continue
        Pp,Hh,ok=px
        for k,t in enumerate(it['tones']):
            if t==5 or it['amb'][k] or not ok[k] or it['lex'][k]!=t: continue
            P.append(Pp[k]);H.append(Hh[k]);y.append(t-1);g.append(it['set'])
    return np.array(P,np.float32),np.array(H,np.float32),np.array(y),g
tr=lambda it: it['set'] in('aishell','stcmds') and (it['set'],it['spk']) not in TEST
te=lambda it: (it['set'],it['spk']) in TEST or it['set'] in('tonpar','tatoeba')
Ptr,Htr,ytr,_=rows(tr); Pte,Hte,yte,gte=rows(te)
A=pickle.load(open('augX.pkl','rb'))
Ptr=np.r_[Ptr,np.array([a[1] for a in A],np.float32)]; Htr=np.r_[Htr,np.array([a[2] for a in A],np.float32)]
ytr=np.r_[ytr,np.array([(a[0]['nt'] or a[0]['e'])-1 for a in A])]; print('train',len(ytr))
pm,ps=Ptr.mean(0),Ptr.std(0)+1e-6; hm,hs=Htr.mean(0),Htr.std(0)+1e-6
def fit(Xtr,Xte,name):
    torch.manual_seed(0); net=torch.nn.Sequential(torch.nn.Linear(Xtr.shape[1],128),torch.nn.GELU(),torch.nn.Dropout(0.3),torch.nn.Linear(128,4))
    opt=torch.optim.AdamW(net.parameters(),1e-3,weight_decay=1e-2); X=torch.tensor(Xtr); Y=torch.tensor(ytr)
    for ep in range(40):
        net.train(); perm=torch.randperm(len(X))
        for b in range(0,len(X),256):
            i=perm[b:b+256]; loss=torch.nn.functional.cross_entropy(net(X[i]),Y[i]); opt.zero_grad(); loss.backward(); opt.step()
    net.eval()
    with torch.no_grad(): pr=torch.softmax(net(torch.tensor(Xte)),-1).numpy()
    p=pr.argmax(1); s=name
    for g in sorted(set(gte)):
        m=np.array([x==g for x in gte]); s+=' %s %.1f'%(g,100*(p[m]==yte[m]).mean())
    print(s); return net
nets={}
nets['pitch']=fit((Ptr-pm)/ps,(Pte-pm)/ps,'pitch ')
nets['hid']=fit((Htr-hm)/hs,(Hte-hm)/hs,'hid   ')
nets['both']=fit(np.c_[(Ptr-pm)/ps,(Htr-hm)/hs],np.c_[(Pte-pm)/ps,(Hte-hm)/hs],'both  ')
torch.save({'nets':{k:v.state_dict() for k,v in nets.items()},'pm':pm,'ps':ps,'hm':hm,'hs':hs},f'probe{L}aug.pt')
