const C="mandapp-v21";const ML="mandapp-ml-v1";const FILES=["./","index.html","skugga.html","skugga.js","analysis.js","align.js","hsk.json","skuggmeningar.json","vendor/ts-fsrs-5.4.2.umd.js","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","icon-180.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==ML).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
// Nätet först och förbi webbläsarens HTTP-cache för appens egna filer, så att uppdateringar syns direkt. Cache som reserv offline.
// Ordboken (cedict.txt, 9 MB) sparar appen själv i IndexedDB, så den läggs inte i cachen. Anrop till Claude går aldrig via cachen.
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);if(u.origin!==location.origin&&!/raw\.githubusercontent|fonts\./.test(u.host))return;
const app=u.origin===location.origin&&!u.pathname.includes("/audio/");const big=u.pathname.endsWith("cedict.txt");
// Stavelsemodellen (116 MB) och onnxruntime: cache först i en egen cache som överlever appuppdateringar.
if(u.origin===location.origin&&/\/(models|vendor\/ort)\//.test(u.pathname)){e.respondWith(caches.open(ML).then(c=>c.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}))));return}
e.respondWith(fetch(r,app?{cache:"no-store"}:undefined).then(res=>{if(res.ok&&!big){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res}).catch(()=>caches.match(r,{ignoreSearch:true})))});
