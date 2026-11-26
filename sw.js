const C="skuggning-v7";const FILES=["./","index.html","analysis.js","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","icon-180.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
// Nätet först och förbi webbläsarens HTTP-cache för appens egna filer, så att uppdateringar syns direkt. Cache som reserv offline.
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);const app=u.origin===location.origin&&!u.pathname.includes("/audio/");
e.respondWith(fetch(r,app?{cache:"no-store"}:undefined).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res}).catch(()=>caches.match(r,{ignoreSearch:true})))});
