/* Stavelsegränser med en liten taligenkänningsmodell i webbläsaren (wav2vec2, CTC, initialer + tonmärkta finaler).
   Modellen (116 MB, int8 ONNX, 8 lager av snu-nia-12/wav2vec2-large-xlsr-53_nia12_phone-pinyin_chinese, se tools/ml/)
   laddas ner en gång och sparas av service workern. Den används bara för att hitta var varje stavelse börjar och slutar;
   inga domar om ton eller initial visas (se tools/ml/README.md för mätningarna). */
(function () {
"use strict";
const PARTS = ["models/mandarin-ctc-8l-int8.part00", "models/mandarin-ctc-8l-int8.part01"];
const ML_CACHE = "mandapp-ml-v1";
const SYM = ["<s>","<pad>","</s>","<unk>","a","a1","a2","a3","a4","a5","ai1","ai2","ai3","ai4","an1","an2","an3","an4","ang1","ang2","ang3","ang4","ao1","ao2","ao3","ao4","b","c","ch","d","e1","e2","e3","e4","e5","ei1","ei2","ei3","ei4","en1","en2","en3","en4","en5","eng1","eng2","eng3","eng4","er2","er3","er4","f","g","h","i1","i2","i3","i4","i5","ia1","ia2","ia3","ia4","ian1","ian2","ian3","ian4","ian5","iang1","iang2","iang3","iang4","iao1","iao2","iao3","iao4","ie1","ie2","ie3","ie4","in1","in2","in3","in4","ing1","ing2","ing3","ing4","iong1","iong2","iong3","iu1","iu2","iu3","iu4","j","k","l","m","n","o1","o2","o3","o4","o5","ong1","ong2","ong3","ong4","ou1","ou2","ou3","ou4","p","q","r","s","sh","t","u1","u2","u3","u4","u:2","u:3","u:4","u:e4","ua1","ua2","ua3","ua4","uai1","uai2","uai3","uai4","uan1","uan2","uan3","uan4","uang1","uang2","uang3","uang4","ue1","ue2","ue3","ue4","ui1","ui2","ui3","ui4","un1","un2","un3","un4","uo1","uo2","uo3","uo4","uo5","w","x","ya1","ya2","ya3","ya4","ya5","yan1","yan2","yan3","yan4","yang1","yang2","yang3","yang4","yao1","yao2","yao3","yao4","ye1","ye2","ye3","ye4","yi1","yi2","yi3","yi4","yin1","yin2","yin3","yin4","ying1","ying2","ying3","ying4","yong1","yong3","yong4","you1","you2","you3","you4","yu1","yu2","yu3","yu4","yuan1","yuan2","yuan3","yuan4","yue1","yue4","yun1","yun2","yun3","yun4","z","zh"];
const SI = {}; SYM.forEach((s, i) => SI[s] = i);
const INI = ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s"];
let sess = null, loading = null;

function split(s) {
  s = s.replace(/ü/g, "v");
  if (s[0] === "y") return [null, s];
  if (s[0] === "w") return ["w", s.slice(1) || "u"];
  for (const i of INI) if (s.startsWith(i) && s.length > i.length) {
    let f = s.slice(i.length);
    if (i === "l" || i === "n") f = f.replace("ve", "u:e").replace("v", "u:");
    if (i === "j" || i === "q" || i === "x") f = f.replace("v", "u");
    return [i, f];
  }
  return [null, s];
}
function ftok(f, t) {
  for (const c of [f + t, f + "5", f]) if (c in SI) return SI[c];
  for (const t2 of [1, 2, 3, 4, 5]) if ((f + t2) in SI) return SI[f + t2];
  return SI["<unk>"];
}
// syls: [{syl, tone}], tones: uttalade toner -> tokens och vilken stavelse varje token hör till
function tokens(syls, tones) {
  const seq = [], own = [];
  syls.forEach((s, k) => {
    const [i, f] = split(s.syl);
    if (i && i in SI) { seq.push(SI[i]); own.push(k); }
    seq.push(ftok(f, tones ? tones[k] : s.tone)); own.push(k);
  });
  return { seq, own };
}
// CTC-tvångsjustering (Viterbi), blank = 0. lp: Float32Array T*V
function viterbi(lp, T, V, seq) {
  const S = 2 * seq.length + 1, ext = new Int32Array(S);
  for (let j = 0; j < seq.length; j++) ext[2 * j + 1] = seq[j];
  const NEG = -1e30; let dp = new Float64Array(S).fill(NEG); const bp = new Uint8Array(T * S);
  dp[0] = lp[ext[0]]; if (S > 1) dp[1] = lp[ext[1]];
  for (let t = 1; t < T; t++) {
    const nd = new Float64Array(S).fill(NEG), o = t * V;
    for (let s = 0; s < S; s++) {
      let best = dp[s], b = 0;
      if (s > 0 && dp[s - 1] > best) { best = dp[s - 1]; b = 1; }
      if (s > 1 && ext[s] !== 0 && ext[s] !== ext[s - 2] && dp[s - 2] > best) { best = dp[s - 2]; b = 2; }
      nd[s] = best + lp[o + ext[s]]; bp[t * S + s] = b;
    }
    dp = nd;
  }
  let s = S > 1 && dp[S - 2] > dp[S - 1] ? S - 2 : S - 1; const path = new Int32Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = s; s -= bp[t * S + s]; }
  return path;
}
function loadScript(src) { return new Promise((res, rej) => { const e = document.createElement("script"); e.src = src; e.onload = res; e.onerror = () => rej(new Error("kunde inte ladda " + src)); document.head.append(e); }); }
async function fetchPart(url, onBytes) {
  const r = await fetch(url); if (!r.ok) throw new Error("modellen saknas (" + r.status + ")");
  if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); onBytes(b.byteLength); return new Uint8Array(b); }
  const rd = r.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onBytes(value.length); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
const TOTAL = 115812074;
async function load(onProgress) {
  if (sess) return sess; if (loading) return loading;
  loading = (async () => {
    if (!window.ort) await loadScript("vendor/ort/ort.wasm.min.js");
    ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
    let got = 0; const tick = b => { got += b; if (onProgress) onProgress(Math.min(1, got / TOTAL)); };
    const parts = []; for (const p of PARTS) parts.push(await fetchPart(p, tick));
    const buf = new Uint8Array(parts.reduce((a, b) => a + b.length, 0)); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    sess = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
    return sess;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}
async function isCached() { try { const c = await caches.open(ML_CACHE); return !!(await c.match(new URL(PARTS[1], location.href).href)); } catch { return false; } }
// x: Float32Array 16 kHz. Returnerar { bounds: [start_0, ..., start_n-1, slut] } i sekunder, eller null
let queue = Promise.resolve();
function segment(x, syls, tones) {
  const run = async () => {
    if (!syls.length || x.length < 8000) return null;
    const s = await load();
    const r = await s.run({ audio: new ort.Tensor("float32", x, [1, x.length]) });
    const lp = r.logp.data, T = r.logp.dims[1], V = r.logp.dims[2];
    const { seq, own } = tokens(syls, tones);
    if (T < seq.length + 2) return null;
    const path = viterbi(lp, T, V, seq);
    const first = new Array(syls.length).fill(-1), last = new Array(syls.length).fill(-1);
    for (let t = 0; t < T; t++) { const st = path[t]; if (st % 2 === 1) { const k = own[(st - 1) >> 1]; if (first[k] < 0) first[k] = t; last[k] = t; } }
    if (first.some(v => v < 0)) return null;
    const FR = 0.02; const bounds = first.map(f => f * FR); bounds.push(Math.min(T, last[last.length - 1] + 8) * FR);
    return { bounds };
  };
  const p = queue.then(run, run); queue = p.catch(() => null); return p;
}
window.MAL = { load, isCached, segment, tokens, viterbi, split };
})();
