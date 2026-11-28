import sys,types,torch
# stub fairseq classes so torch.load(weights_only=True) can load without executing foreign code
def stub(path):
    mod,cls=path.rsplit('.',1); parts=mod.split('.')
    for i in range(1,len(parts)+1):
        n='.'.join(parts[:i]); sys.modules.setdefault(n,types.ModuleType(n))
    C=type(cls,(),{'__setstate__':lambda self,s: self.__dict__.update(s if isinstance(s,dict) else {'state':s})}); C.__module__=mod
    setattr(sys.modules[mod],cls,C); return C
def load(p):
    allowed=[]
    while True:
        try:
            with torch.serialization.safe_globals(allowed):
                return torch.load(p,map_location='cpu',weights_only=True)
        except Exception as e:
            import re; m=re.search(r'Unsupported global: GLOBAL ([\w\.]+)',str(e))
            if not m: raise
            print('stub',m.group(1)); allowed.append(stub(m.group(1)))
if __name__=='__main__':
    sd=load(sys.argv[1]); print(type(sd), list(sd.keys())[:20] if isinstance(sd,dict) else '')
