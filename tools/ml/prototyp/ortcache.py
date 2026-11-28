import onnxruntime as ort,pickle,numpy as np,sys,random,time
D=pickle.load(open('data.pkl','rb'))
spk=sorted({(it['set'],it['spk']) for it in D if it['set'] in('aishell','stcmds')}); random.seed(0); random.shuffle(spk); TEST=set(spk[:len(spk)//5])
so=ort.SessionOptions(); so.intra_op_num_threads=2
s=ort.InferenceSession(sys.argv[1],so); out=[]; H=[]; t0=time.time(); dur=0
for it in D:
    if (it['set'],it['spk']) in TEST or it['set'] in('tonpar','tatoeba'):
        lp,h=s.run(None,{'audio':it['wav'][None].astype(np.float32)}); out.append(lp[0].astype(np.float16)); H.append(h[0].astype(np.float16)); dur+=len(it['wav'])/16000
    else: out.append(None); H.append(None)
print('RTF %.3f'%((time.time()-t0)/dur))
pickle.dump(out,open(sys.argv[2],'wb')); pickle.dump(H,open('h_'+sys.argv[2],'wb'))
