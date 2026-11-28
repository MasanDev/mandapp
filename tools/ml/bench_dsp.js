const fs=require('fs'),cp=require('child_process'),path=require('path');
global.window={}; eval(fs.readFileSync(process.env.AJS||__dirname+'/../../analysis.js','utf8')); const MA=window.MA;
const R=__dirname+'/../../audio/';
function load(f){const b=cp.execFileSync('ffmpeg',['-v','quiet','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],{maxBuffer:1e8});return new Float32Array(b.buffer,b.byteOffset,b.length/4).slice();}
function run(items,dir,label){let tot=0,ok=0,segOk=0,n=0,conf={};const perPos={};
 for(const it of items){const f=R+dir+'/'+it.audio; if(!fs.existsSync(f))continue; const x=load(f);
  const syls=MA.parsePinyin(it.pinyin); const sd=MA.sandhi(syls,it.zh); const an=MA.analyze(x,syls.length); n++;
  if(!an.ok)continue; const j=MA.judge(an,syls,sd.tones,null); if(j.sylFound===syls.length)segOk++;
  for(const r of j.rows){ if(r.exp===5||r.heard==null)continue; tot++; if(r.toneOk)ok++; const k=r.exp+'>'+r.heard; conf[k]=(conf[k]||0)+1;}
 }
 const M={};for(const e of [1,2,3,4]){M[e]=[1,2,3,4].map(h=>conf[e+'>'+h]||0);}
 console.log(label,'files',n,'segcount ok',segOk,'tone acc',(100*ok/tot).toFixed(1)+'%',tot); console.log(' rows=expected, cols=heard 1..4',JSON.stringify(M));}
const which=process.argv[2];
if(which==='tonpar'){const t=JSON.parse(fs.readFileSync(R+'tonpar.json'));const items=[];for(const v of Object.values(t))for(const w of v)items.push({...w,audio:w.zh+'.mp3'});run(items,'tonpar','tonpar(isolated 2-syl words)');}
else{const a=JSON.parse(fs.readFileSync(R+which+'.json'));let items=Array.isArray(a)?a:a.items; items=items.slice(0,+process.argv[3]||120); run(items,which,which);}
