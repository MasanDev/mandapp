const fs=require('fs'); global.window={}; eval(fs.readFileSync('/home/user/mandapp/analysis.js','utf8')); const MA=window.MA;
const lens=JSON.parse(fs.readFileSync('wavlen.json')); const buf=fs.readFileSync('wavs.bin'); let off=0; const out=[];
for(const n of lens){const x=new Float32Array(buf.buffer.slice(buf.byteOffset+off*4,buf.byteOffset+(off+n)*4)); off+=n;
 const p=MA.pitchTrack(x); out.push(p?{st:p.st,en:p.en,start:p.startSec,med:p.medHz}:null);}
fs.writeFileSync('f0.json',JSON.stringify(out)); console.log(out.filter(x=>!x).length,'null');
