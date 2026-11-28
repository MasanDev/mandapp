import json,subprocess,numpy as np,os,re,pickle
R='/home/user/mandapp/audio/'
def load(f):
    b=subprocess.run(['ffmpeg','-v','quiet','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(b,np.float32).copy()
def parse(p):
    out=[]
    for s in p.split():
        m=re.match(r'([a-zü:v]+)([1-5])$',s.lower())
        if not m: return None
        out.append((m.group(1).replace('ü','v').replace('u:','v'),int(m.group(2))))
    return out
def sandhi(syls,zh):
    t=[x[1] for x in syls]; ch=[c for c in zh if '㐀'<=c<='鿿']; amb=[False]*len(t)
    for i in range(len(t)-1):
        c=ch[i] if i<len(ch) else ''
        if c=='不' and syls[i][0]=='bu' and t[i]==4 and syls[i+1][1]==4: t[i]=2
        elif c=='一' and syls[i][0]=='yi' and t[i]==1:
            if syls[i+1][1]==4: t[i]=2
            elif syls[i+1][1] in (1,2,3): t[i]=4
            amb[i]=True  # 一 also ordinal yi1
    for i in range(len(t)-2,-1,-1):
        if syls[i][1]==3 and t[i+1]==3 and syls[i+1][1]==3: t[i]=2
    # mark 3-chains (>=3 in a row) ambiguous
    i=0
    while i<len(t):
        j=i
        while j<len(t) and syls[j][1]==3: j+=1
        if j-i>=3:
            for k in range(i,j): amb[k]=True
        i=max(j,i+1)
    return t,amb
items=[]
for name in ['aishell','stcmds','tatoeba']:
    d=json.load(open(R+name+'.json')); it=d if isinstance(d,list) else d['items']
    for x in it:
        s=parse(x['pinyin']); f=R+name+'/'+x['audio']
        if not s or not os.path.exists(f): continue
        zh=[c for c in x['zh'] if '㐀'<=c<='鿿']
        if len(zh)!=len(s): continue
        t,amb=sandhi(s,x['zh'])
        items.append(dict(set=name,id=str(x['id']),zh=''.join(zh),syls=[a for a,_ in s],lex=[b for _,b in s],tones=t,amb=amb,spk=x.get('speaker',x.get('author','')),wav=load(f)))
t=json.load(open(R+'tonpar.json'))
for v in t.values():
    for w in v:
        f=R+'tonpar/'+w['zh']+'.mp3'; s=parse(w['pinyin'])
        if not s or not os.path.exists(f): continue
        tt,amb=sandhi(s,w['zh'])
        items.append(dict(set='tonpar',id=w['zh'],zh=w['zh'],syls=[a for a,_ in s],lex=[b for _,b in s],tones=tt,amb=amb,spk='yuetan',wav=load(f)))
pickle.dump(items,open('data.pkl','wb'))
from collections import Counter
print(Counter(i['set'] for i in items), sum(len(i['syls']) for i in items))
