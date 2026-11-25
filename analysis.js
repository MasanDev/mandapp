/* Mandapp Skuggning – ljudanalys och pinyin. Ren JS, inga beroenden.
   Exponerar window.MA = { pinyin..., analyze, ... } */
(function () {
"use strict";
const SR = 16000;          // analys-samplingsfrekvens
const HOP = 160;           // 10 ms
const WIN = 640;           // 40 ms
const FMIN = 70, FMAX = 500;

/* ---------------- pinyin ---------------- */
const MARKS = { "ā":"a1","á":"a2","ǎ":"a3","à":"a4","ē":"e1","é":"e2","ě":"e3","è":"e4","ī":"i1","í":"i2","ǐ":"i3","ì":"i4","ō":"o1","ó":"o2","ǒ":"o3","ò":"o4","ū":"u1","ú":"u2","ǔ":"u3","ù":"u4","ǖ":"v1","ǘ":"v2","ǚ":"v3","ǜ":"v4","ü":"v0" };
const TM = { a: "āáǎàa", e: "ēéěèe", i: "īíǐìi", o: "ōóǒòo", u: "ūúǔùu", v: "ǖǘǚǜü" };
const INITIALS = ["zh","ch","sh","b","p","m","f","d","t","n","l","g","k","h","j","q","x","r","z","c","s","y","w"];
// Dela upp en pinyinsträng i stavelser med tonnummer. Klarar "yin2 hang2", "yínháng" (med blanksteg eller utan, om tonmärken finns) och "yin2hang2".
function parsePinyin(str) {
  if (!str) return [];
  let s = str.toLowerCase().replace(/u:/g, "v").replace(/[,.!?;:，。！？；：、“”"'()（）…·\-]/g, " ");
  // tonmärkt -> numrerat per ord
  const words = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (let w of words) {
    if (/[1-5]/.test(w)) { const m = w.match(/[a-zv]+[1-5]?/g) || []; m.forEach(x => out.push(norm(x))); continue; }
    // tonmärkt: dela vid gränser med en enkel girig algoritm
    const plain = []; const tones = [];
    for (const ch of w) { if (MARKS[ch]) { const [b, t] = [MARKS[ch][0], +MARKS[ch][1]]; plain.push(b); tones.push(t); } else { plain.push(ch); tones.push(-1); } }
    const p = plain.join("");
    const parts = splitSyllables(p);
    let idx = 0;
    for (const part of parts) {
      let tone = 5; for (let k = idx; k < idx + part.length; k++) if (tones[k] > 0) tone = tones[k];
      idx += part.length; out.push(norm(part + tone));
    }
  }
  return out.filter(Boolean);
  function norm(x) { const m = x.match(/^([a-zv]+)([1-5])?$/); if (!m) return null; return { syl: m[1], tone: m[2] ? +m[2] : 5 }; }
}
const FINALS = ["iang","iong","uang","ueng","ang","eng","ing","ong","ian","iao","uai","uan","van","ai","ei","ao","ou","an","en","in","un","vn","ia","ie","iu","ua","uo","ui","ve","ue","er","a","o","e","i","u","v"];
function splitSyllables(p) {
  // DP: färst antal stavelser där alla delar är giltiga; vid lika föredras längre första del
  const n = p.length, best = new Array(n + 1).fill(null); best[n] = [];
  for (let i = n - 1; i >= 0; i--) {
    for (let len = Math.min(6, n - i); len > 0; len--) {
      const cand = p.slice(i, i + len); const rest = best[i + len];
      if (rest && isSyl(cand) && (!best[i] || rest.length + 1 < best[i].length)) best[i] = [cand, ...rest];
    }
  }
  return best[0] || [p];
}
function isSyl(s) { const { ini, fin } = splitIF(s); return FINALS.includes(fin) && (ini || /^[aoe]/.test(fin)); }
function splitIF(s) {
  for (const ini of INITIALS) if (s.startsWith(ini)) return { ini, fin: s.slice(ini.length) };
  return { ini: "", fin: s };
}
function marked(syl, tone) {
  const lo = syl; if (tone === 5 || !tone) return lo.replace(/v/g, "ü");
  let idx = -1;
  if (lo.includes("a")) idx = lo.indexOf("a"); else if (lo.includes("e")) idx = lo.indexOf("e"); else if (lo.includes("ou")) idx = lo.indexOf("o");
  else for (let i = lo.length - 1; i >= 0; i--) if ("aeiouv".includes(lo[i])) { idx = i; break; }
  if (idx < 0) return lo;
  return (lo.slice(0, idx) + TM[lo[idx]][tone - 1] + lo.slice(idx + 1)).replace(/v/g, "ü");
}
// Beskrivning av initial/final + vanliga fällor (Hacking Chinese-inspirerat)
const INI_INFO = {
  b: ["oaspirerad", "Som svenskt p utan luftpuff, nästan b. Ingen pust."], p: ["aspirerad", "Kraftig luftpuff, mer än svenskt p."],
  d: ["oaspirerad", "Som t utan luftpuff."], t: ["aspirerad", "Kraftig luftpuff."],
  g: ["oaspirerad", "Som k utan luftpuff."], k: ["aspirerad", "Kraftig luftpuff."],
  z: ["oaspirerad affrikata", "ts utan puff (som i 'katts')."], c: ["aspirerad affrikata", "ts + kraftig puff. Inte svenskt c/s!"],
  zh: ["oaspirerad retroflex", "Tungspetsen bakåt mot gommen, ingen puff."], ch: ["aspirerad retroflex", "Tungspetsen bakåt + kraftig puff."],
  sh: ["retroflex frikativa", "Tungspetsen bakåt; mörkare än svenskt sj-ljud i 'sked'."], r: ["retroflex", "Som sh men tonande, nästan engelskt r i 'pleasure'."],
  j: ["oaspirerad palatal", "Tungryggen mot gommen, läppar spridda, ingen puff. Inte svenskt j!"], q: ["aspirerad palatal", "Som j men med kraftig puff. Inte kv!"],
  x: ["palatal frikativa", "Ljust tje-ljud med spridda läppar, mellan s och sh."],
  s: ["frikativa", "Vasst s."], f: ["frikativa", "Som svenskt f."], h: ["frikativa", "Hårdare än svenskt h, mer som tyskt ch i 'Bach'."],
  m: ["nasal", ""], n: ["nasal", ""], l: ["lateral", ""], y: ["halvvokal", ""], w: ["halvvokal", ""], "": ["ingen initial", ""]
};
const ASP = { p: 1, t: 1, k: 1, c: 1, ch: 1, q: 1 }, UNASP = { b: 1, d: 1, g: 1, z: 1, zh: 1, j: 1 };
const AFFR = { z: 1, c: 1, zh: 1, ch: 1, j: 1, q: 1 };
function sylInfo(syl, tone) {
  const { ini, fin } = splitIF(syl);
  const traps = [];
  if (ASP[ini]) traps.push("Aspirerad: pusta kraftigt");
  if (UNASP[ini]) traps.push("Oaspirerad: ingen luftpuff");
  if (["j","q","x","y"].includes(ini) && fin.startsWith("u")) traps.push("u efter " + ini + " uttalas ü");
  if (ini === "q") traps.push("q är inte kv");
  if (ini === "x") traps.push("x är inte ks");
  if (ini === "c") traps.push("c är ts + puff");
  if (["zh","ch","sh","r"].includes(ini) && fin === "i") traps.push("i efter " + ini + " är ett surrande ljud, inte i");
  if (["z","c","s"].includes(ini) && fin === "i") traps.push("i efter " + ini + " är ett surrande ljud, inte i");
  if (fin === "e") traps.push("e är ett ljud långt bak i munnen (ɤ), inte svenskt e");
  if (/ng$/.test(fin)) traps.push("-ng: stäng med tungryggen bak, som i 'lång'");
  else if (/n$/.test(fin)) traps.push("-n: stäng med tungspetsen fram");
  if (fin === "ian") traps.push("ian låter nästan 'jen'");
  if (fin === "ui") traps.push("ui = uei");
  if (fin === "iu") traps.push("iu = iou");
  if (fin === "un" && !["j","q","x","y"].includes(ini)) traps.push("un = uen");
  if (fin === "ong") traps.push("ong: o mot u, inte svenskt å");
  if (fin === "eng") traps.push("eng: e som i 'the', inte svenskt e");
  if (tone === 3) traps.push("Tredje ton: oftast bara låg, inte uppåt");
  if (tone === 5) traps.push("Neutral ton: kort och lätt");
  return { ini, fin, iniKind: (INI_INFO[ini] || ["", ""])[0], iniTip: (INI_INFO[ini] || ["", ""])[1], traps };
}
// Tonsandhi: returnerar uttalade toner
function sandhi(syls, hanzi) {
  const t = syls.map(s => s.tone); const chars = hanzi ? [...hanzi].filter(c => /[\u3400-\u9fff]/.test(c)) : [];
  const notes = [];
  for (let i = 0; i < t.length - 1; i++) {
    const c = chars[i];
    if (c === "不" && syls[i].syl === "bu" && t[i] === 4 && syls[i + 1].tone === 4) { t[i] = 2; notes.push("不 före fjärde ton uttalas bú"); }
    else if (c === "一" && syls[i].syl === "yi" && t[i] === 1) {
      if (syls[i + 1].tone === 4) { t[i] = 2; notes.push("一 före fjärde ton uttalas yí"); }
      else if ([1, 2, 3].includes(syls[i + 1].tone)) { t[i] = 4; notes.push("一 före ton 1–3 uttalas yì"); }
    }
  }
  // 3+3: vänster blir 2 (från höger i kedjor förenklat)
  for (let i = t.length - 2; i >= 0; i--) if (syls[i].tone === 3 && t[i + 1] === 3 && syls[i + 1].tone === 3) { t[i] = 2; notes.push("Två tredje toner i rad: den första uttalas som andra ton"); }
  return { tones: t, notes: [...new Set(notes)] };
}

/* ---------------- DSP ---------------- */
async function toMono16k(arrayBuffer) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(); let buf;
  try { buf = await ac.decodeAudioData(arrayBuffer.slice(0)); } finally { try { ac.close(); } catch {} }
  return resample(buf);
}
async function resample(buf) {
  const len = Math.ceil(buf.duration * SR);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(1, Math.max(1, len), SR);
  const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start();
  const out = await oc.startRendering();
  return out.getChannelData(0).slice();
}
// YIN på ett fönster; returnerar [f0, aperiodicitet]
function yin(x, off, n, sr, fmin, fmax) {
  const tmin = Math.floor(sr / fmax), tmax = Math.min(Math.floor(sr / fmin), Math.floor(n / 2));
  const W = n - tmax; if (W < 32) return [0, 1];
  const d = new Float32Array(tmax + 1);
  for (let tau = 1; tau <= tmax; tau++) {
    let s = 0; for (let j = 0; j < W; j++) { const v = x[off + j] - x[off + j + tau]; s += v * v; } d[tau] = s;
  }
  let run = 0; const cm = new Float32Array(tmax + 1); cm[0] = 1;
  for (let tau = 1; tau <= tmax; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = tmin; t <= tmax; t++) { if (cm[t] < 0.15) { while (t + 1 <= tmax && cm[t + 1] < cm[t]) t++; tau = t; break; } }
  if (tau < 0) { let mi = tmin; for (let t = tmin; t <= tmax; t++) if (cm[t] < cm[mi]) mi = t; if (cm[mi] > 0.35) return [0, cm[mi]]; tau = mi; }
  // parabolisk interpolation
  let bt = tau;
  if (tau > 1 && tau < tmax) { const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1]; const den = a - 2 * b + c; if (den) bt = tau + 0.5 * (a - c) / den; }
  return [sr / bt, cm[tau]];
}
// liten radix-2 FFT (in place), returnerar magnitud^2 för halva spektrumet
function powerSpectrum(frame) {
  const n = frame.length; const re = Float32Array.from(frame), im = new Float32Array(n);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j]; const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci; const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr; } }
  }
  const p = new Float32Array(n / 2); for (let i = 0; i < n / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i]; return p;
}
const NFFT = 512; const HANN = new Float32Array(NFFT).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NFFT - 1)));
const MEL = (() => { // 24 triangelfilter 100–7600 Hz
  const nb = 24, mel = f => 2595 * Math.log10(1 + f / 700), inv = m => 700 * (Math.pow(10, m / 2595) - 1);
  const lo = mel(100), hi = mel(7600); const pts = []; for (let i = 0; i < nb + 2; i++) pts.push(Math.floor(inv(lo + (hi - lo) * i / (nb + 1)) / SR * NFFT));
  const f = []; for (let b = 0; b < nb; b++) f.push([pts[b], pts[b + 1], pts[b + 2]]); return f;
})();
function frames(x) {
  const n = Math.max(0, Math.floor((x.length - WIN) / HOP) + 1);
  const F = { n, rms: new Float32Array(n), db: new Float32Array(n), f0: new Float32Array(n), ap: new Float32Array(n), zcr: new Float32Array(n), cent: new Float32Array(n), hf: new Float32Array(n), mel: [] };
  const buf = new Float32Array(NFFT);
  for (let i = 0; i < n; i++) {
    const off = i * HOP; let s = 0, z = 0;
    for (let j = 0; j < WIN; j++) { const v = x[off + j]; s += v * v; if (j && (v >= 0) !== (x[off + j - 1] >= 0)) z++; }
    const rms = Math.sqrt(s / WIN); F.rms[i] = rms; F.db[i] = 20 * Math.log10(rms + 1e-7); F.zcr[i] = z / WIN;
    const [f0, ap] = yin(x, off, WIN, SR, FMIN, FMAX); F.f0[i] = f0; F.ap[i] = ap;
    const c = off + (WIN >> 1) - (NFFT >> 1);
    for (let j = 0; j < NFFT; j++) { const k = c + j; buf[j] = (k >= 0 && k < x.length ? x[k] : 0) * HANN[j]; }
    const p = powerSpectrum(buf); let tot = 0, wsum = 0, hfe = 0;
    for (let k = 1; k < p.length; k++) { const f = k * SR / NFFT; tot += p[k]; wsum += p[k] * f; if (f > 3000) hfe += p[k]; }
    F.cent[i] = tot ? wsum / tot : 0; F.hf[i] = tot ? hfe / tot : 0;
    const m = new Float32Array(MEL.length);
    for (let b = 0; b < MEL.length; b++) { const [a, cc, d] = MEL[b]; let e = 0; for (let k = a; k <= d; k++) { const w = k < cc ? (k - a) / ((cc - a) || 1) : (d - k) / ((d - cc) || 1); if (w > 0) e += w * p[k]; } m[b] = Math.log(e + 1e-9); }
    F.mel.push(m);
  }
  return F;
}
function pct(arr, p) { const a = Array.from(arr).sort((x, y) => x - y); if (!a.length) return 0; return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]; }
const st = (f, ref) => 12 * Math.log2(f / ref);

/* ---------------- analys ---------------- */
// x: Float32Array 16 kHz. nSyl: förväntat antal stavelser (kan vara 0 = okänt)
function analyze(x, nSyl) {
  const F = frames(x); const n = F.n;
  if (n < 10) return { ok: false, reason: "För kort inspelning." };
  const floor = pct(F.db, 0.1), peak = pct(F.db, 0.98);
  if (peak - floor < 15) return { ok: false, reason: "Hör nästan inget tal. Prata närmare mikrofonen." };
  const actTh = floor + Math.max(10, (peak - floor) * 0.25);
  const active = new Uint8Array(n), voiced = new Uint8Array(n);
  for (let i = 0; i < n; i++) { active[i] = F.db[i] > actTh ? 1 : 0; voiced[i] = active[i] && F.f0[i] > 0 && F.ap[i] < 0.3 ? 1 : 0; }
  // oktavfel: median-filtrera f0 och korrigera hopp
  const vf = []; for (let i = 0; i < n; i++) if (voiced[i]) vf.push(F.f0[i]);
  const med = pct(vf, 0.5) || 150;
  for (let i = 0; i < n; i++) if (voiced[i]) { let f = F.f0[i]; while (f > med * 1.8) f /= 2; while (f < med / 1.8) f *= 2; F.f0[i] = f; }
  const f0s = medianFilter(F.f0, voiced, 5);
  // tonande sektioner
  let runs = [];
  for (let i = 0; i < n;) { if (!voiced[i]) { i++; continue; } let j = i; while (j < n && voiced[j]) j++; runs.push([i, j]); i = j; }
  runs = mergeRuns(runs, 4).filter(r => r[1] - r[0] >= 5);
  if (!runs.length) return { ok: false, reason: "Hittade ingen tonande röst. Försök igen lite högre." };
  if (nSyl > 0) {
    let guard = 0;
    while (runs.length > nSyl && guard++ < 50) { // slå ihop minsta glipan
      let bi = 0, bg = 1e9; for (let i = 0; i < runs.length - 1; i++) { const g = runs[i + 1][0] - runs[i][1]; if (g < bg) { bg = g; bi = i; } }
      runs.splice(bi, 2, [runs[bi][0], runs[bi + 1][1]]);
    }
    guard = 0;
    while (runs.length < nSyl && guard++ < 50) { // dela längsta vid energiminimum
      let bi = 0; for (let i = 1; i < runs.length; i++) if (runs[i][1] - runs[i][0] > runs[bi][1] - runs[bi][0]) bi = i;
      const [a, b] = runs[bi]; if (b - a < 14) break;
      const lo = a + Math.floor((b - a) * 0.2), hi = b - Math.floor((b - a) * 0.2);
      let mi = lo; const sm = smooth(F.db, 3); for (let i = lo; i < hi; i++) if (sm[i] < sm[mi]) mi = i;
      // pitch-hopp kan också markera gräns
      runs.splice(bi, 1, [a, mi], [mi + 1, b]);
    }
  }
  // tonhöjd i halvtoner relativt talarens median
  const allSt = []; for (const [a, b] of runs) for (let i = a; i < b; i++) if (f0s[i] > 0) allSt.push(st(f0s[i], med));
  const p10 = pct(allSt, 0.1), p90 = pct(allSt, 0.9);
  const range = Math.max(3, p90 - p10);
  const syls = runs.map(([a, b], k) => {
    const cont = []; for (let i = a; i < b; i++) if (f0s[i] > 0) cont.push(st(f0s[i], med));
    // konsonantdel före röststart: aktiva, icke tonande ramar direkt före a
    let c0 = a; const prevEnd = k ? runs[k - 1][1] : 0;
    while (c0 - 1 >= prevEnd && active[c0 - 1] && !voiced[c0 - 1] && a - c0 < 30) c0--;
    const consMs = (a - c0) * 10;
    let cent = 0, hf = 0, zc = 0; if (a > c0) { for (let i = c0; i < a; i++) { cent += F.cent[i]; hf += F.hf[i]; zc += F.zcr[i]; } cent /= (a - c0); hf /= (a - c0); zc /= (a - c0); }
    // energiburst (stopp) – brant ökning precis före konsonantdelen
    return { a, b, c0, durMs: (b - a) * 10, consMs, consCent: cent, consHf: hf, consZcr: zc, contour: resampleArr(cont, 12), raw: cont, mel: F.mel.slice(a, b) };
  });
  // global kurva (för ritning)
  const curve = []; for (let i = 0; i < n; i++) curve.push(f0s[i] > 0 && active[i] ? st(f0s[i], med) : null);
  return { ok: true, n, med, range, p10, p90, syls, curve, db: Array.from(F.db), actTh, durMs: n * 10 };
}
function medianFilter(a, mask, k) { const o = new Float32Array(a.length); const h = k >> 1; for (let i = 0; i < a.length; i++) { if (!mask[i]) continue; const w = []; for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < a.length && mask[j]) w.push(a[j]); w.sort((x, y) => x - y); o[i] = w[w.length >> 1]; } return o; }
function smooth(a, k) { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, c = 0; for (let j = i - k; j <= i + k; j++) if (j >= 0 && j < a.length) { s += a[j]; c++; } o[i] = s / c; } return o; }
function mergeRuns(r, gap) { const o = []; for (const x of r) { if (o.length && x[0] - o[o.length - 1][1] <= gap) o[o.length - 1][1] = x[1]; else o.push(x.slice()); } return o; }
function resampleArr(a, m) { if (!a.length) return new Array(m).fill(0); const o = []; for (let i = 0; i < m; i++) { const t = i * (a.length - 1) / (m - 1 || 1); const lo = Math.floor(t), hi = Math.min(a.length - 1, lo + 1); o.push(a[lo] + (a[hi] - a[lo]) * (t - lo)); } return o; }

/* ---------------- tonbedömning ---------------- */
// Mallar i "normerade halvtoner" där talarens p10..p90 ≈ -4..+4
const TPL = {
  1: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  2: [-1, -1.2, -1.2, -1, -0.6, 0, 0.6, 1.3, 2, 2.6, 3.1, 3.5],
  3: [-2, -2.6, -3.2, -3.7, -4.1, -4.4, -4.5, -4.5, -4.4, -4.2, -4, -3.8],
  4: [4, 4.2, 4, 3.4, 2.6, 1.7, 0.8, -0.2, -1.2, -2.2, -3, -3.6],
};
function normContour(c, an) { const scale = Math.min(2, Math.max(0.5, 8 / an.range)); const mid = (an.p10 + an.p90) / 2; return c.map(v => (v - mid) * scale); }
function classifyTone(syl, an, posLast) {
  if (!syl.raw.length) return { tone: 0, conf: 0, scores: {} };
  const c = normContour(syl.contour, an);
  const scores = {};
  for (const t of [1, 2, 3, 4]) {
    let tpl = TPL[t];
    if (t === 3 && posLast) tpl = [-2, -2.8, -3.6, -4.2, -4.5, -4.5, -4.2, -3.6, -2.8, -1.8, -0.8, 0]; // full tredje ton i slutet
    const cm = mean(c), tm = mean(tpl);
    let shape = 0, lvl = (cm - tm) ** 2;
    for (let i = 0; i < c.length; i++) shape += ((c[i] - cm) - (tpl[i] - tm)) ** 2;
    scores[t] = shape / c.length + 0.35 * lvl;
    if (t === 3 && posLast) { // tillåt även halv tredje ton i slutet
      const tpl2 = TPL[3]; const tm2 = mean(tpl2); let s2 = 0; for (let i = 0; i < c.length; i++) s2 += ((c[i] - cm) - (tpl2[i] - tm2)) ** 2; scores[t] = Math.min(scores[t], s2 / c.length + 0.35 * (cm - tm2) ** 2);
    }
  }
  const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const best = +sorted[0][0]; const conf = Math.max(0, Math.min(1, (sorted[1][1] - sorted[0][1]) / (sorted[1][1] + 1e-6)));
  const start = mean(c.slice(0, 3)), end = mean(c.slice(-3)), lo = Math.min(...c), hi = Math.max(...c);
  return { tone: best, conf, scores, start, end, lo, hi, norm: c };
}
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }

/* ---------------- jämförelse ---------------- */
function dtw(a, b, distFn) {
  const n = a.length, m = b.length; if (!n || !m) return { cost: Infinity, path: [] };
  const D = new Float32Array((n + 1) * (m + 1)).fill(Infinity); D[0] = 0;
  const w = Math.max(Math.abs(n - m) + 5, Math.floor(Math.max(n, m) * 0.3));
  for (let i = 1; i <= n; i++) {
    const jc = Math.round(i * m / n);
    for (let j = Math.max(1, jc - w); j <= Math.min(m, jc + w); j++) {
      const d = distFn(a[i - 1], b[j - 1]);
      D[i * (m + 1) + j] = d + Math.min(D[(i - 1) * (m + 1) + j], D[i * (m + 1) + j - 1], D[(i - 1) * (m + 1) + j - 1]);
    }
  }
  const path = []; let i = n, j = m;
  while (i > 0 && j > 0) { path.push([i - 1, j - 1]); const a1 = D[(i - 1) * (m + 1) + j - 1], a2 = D[(i - 1) * (m + 1) + j], a3 = D[i * (m + 1) + j - 1]; if (a1 <= a2 && a1 <= a3) { i--; j--; } else if (a2 <= a3) i--; else j--; }
  path.reverse();
  return { cost: D[n * (m + 1) + m] / (n + m), path };
}
function melDist(a, b) { let s = 0; const ma = mean(a), mb = mean(b); for (let i = 0; i < a.length; i++) { const d = (a[i] - ma) - (b[i] - mb); s += d * d; } return Math.sqrt(s / a.length); }
// Jämför användarens analys (u) mot förlagan (m), stavelse för stavelse
function compareToModel(u, m) {
  const out = [];
  const k = Math.min(u.syls.length, m.syls.length);
  for (let i = 0; i < k; i++) {
    const us = u.syls[i], ms = m.syls[i];
    const uc = normContour(us.contour, u), mc = normContour(ms.contour, m);
    let pd = 0; const um = mean(uc), mm = mean(mc); for (let j = 0; j < uc.length; j++) pd += ((uc[j] - um) - (mc[j] - mm)) ** 2;
    pd = Math.sqrt(pd / uc.length);
    const sd = us.mel.length && ms.mel.length ? dtw(us.mel, ms.mel, melDist).cost : null;
    out.push({ pitchDist: pd, specDist: sd, durRatio: us.durMs / (ms.durMs || 1), consRatio: ms.consMs ? us.consMs / ms.consMs : null, centDiff: us.consCent - ms.consCent, uMove: uc[uc.length - 1] - uc[0], mMove: mc[mc.length - 1] - mc[0] });
  }
  // global DTW på tonkurvan för ritning
  const ua = interpCurve(u.curve), ma2 = interpCurve(m.curve);
  const g = dtw(ua.v, ma2.v, (x, y) => Math.abs(x - y));
  return { syl: out, global: g, ua, ma: ma2 };
}
function interpCurve(c) { // fyll luckor linjärt inom tal, trimma ändar
  let s = c.findIndex(v => v != null), e = c.length - 1; while (e >= 0 && c[e] == null) e--;
  if (s < 0) return { v: [], off: 0 };
  const v = c.slice(s, e + 1); let last = null;
  for (let i = 0; i < v.length; i++) { if (v[i] != null) { if (last != null && i - last > 1) for (let k = last + 1; k < i; k++) v[k] = v[last] + (v[i] - v[last]) * (k - last) / (i - last); last = i; } }
  return { v: v.filter((x, i) => i % 2 === 0), off: s }; // 20 ms upplösning
}

/* ---------------- bedömning per stavelse ---------------- */
const TONE_NAME = { 1: "första", 2: "andra", 3: "tredje", 4: "fjärde", 5: "neutral" };
function judge(an, pinyinSyls, spokenTones, cmp) {
  const rows = [];
  const N = Math.min(an.syls.length, pinyinSyls.length);
  for (let i = 0; i < pinyinSyls.length; i++) {
    const py = pinyinSyls[i]; const info = sylInfo(py.syl, py.tone); const exp = spokenTones[i];
    const row = { py, info, exp, heard: null, toneOk: null, tips: [], ini: null, sim: null };
    if (i >= N) { row.tips.push("Hittade inte den här stavelsen i inspelningen."); rows.push(row); continue; }
    const s = an.syls[i]; const cl = classifyTone(s, an, i === pinyinSyls.length - 1);
    row.heard = cl.tone; row.toneConf = cl.conf; row.durMs = s.durMs; row.contour = cl.norm;
    if (exp === 5) { row.toneOk = s.durMs < 260 ? true : null; if (s.durMs >= 260) row.tips.push("Neutral ton: gör stavelsen kortare och lättare."); }
    else {
      row.toneOk = cl.tone === exp;
      const mv = cl.end - cl.start;
      if (!row.toneOk) {
        if (exp === 1) row.tips.push(mv < -2 ? "Första ton ska ligga högt och plant. Du föll " + fmt(-mv) + " halvtoner." : mv > 2 ? "Första ton ska vara plan. Du steg " + fmt(mv) + " halvtoner." : "Lägg första ton högre i ditt register.");
        if (exp === 2) row.tips.push(mv < 1.5 ? "Andra ton ska stiga tydligt (ungefär 5 halvtoner). Du steg bara " + fmt(Math.max(0, mv)) + "." : "Börja andra ton lägre, i mitten av registret.");
        if (exp === 3) row.tips.push(cl.lo > -2 ? "Tredje ton ska gå riktigt lågt, nästan knarrigt. Sänk dig mer." : "Tredje ton: stanna i botten i stället för att stiga.");
        if (exp === 4) row.tips.push(mv > -3 ? "Fjärde ton ska falla från toppen till botten. Du föll bara " + fmt(Math.max(0, -mv)) + " halvtoner." : "Börja fjärde ton högre.");
        if (cl.tone && exp !== cl.tone) row.tips.push("Lät mest som " + TONE_NAME[cl.tone] + " ton.");
      }
      if (exp === 3 && s.durMs < 120) row.tips.push("Tredje ton blev väldigt kort.");
    }
    // initial
    const ini = info.ini;
    if (ASP[ini] || UNASP[ini]) {
      const asp = !!ASP[ini]; const thr = AFFR[ini] ? 80 : 50; const ms = s.consMs;
      const okA = asp ? ms >= thr : ms < thr + (AFFR[ini] ? 10 : 0);
      row.ini = { kind: asp ? "aspirerad" : "oaspirerad", ms, ok: okA };
      if (!okA) row.tips.push(asp ? "Mer luftpuff på " + ini + ": brus före vokalen var " + ms + " ms, sikta på över " + thr + " ms." : "Mindre luftpuff på " + ini + " (" + ms + " ms). Det ska låta nästan tonande.");
    } else if (["s", "sh", "x"].includes(ini) && s.consMs >= 40) {
      const c = Math.round(s.consCent); let heard = c > 5200 ? "s" : c > 3900 ? "x" : "sh";
      row.ini = { kind: "frikativa", cent: c, heard, ok: heard === ini };
      if (heard !== ini) row.tips.push("Ditt " + ini + " lät mer som " + heard + " (tyngdpunkt " + (c / 1000).toFixed(1).replace(".", ",") + " kHz). " + (ini === "sh" ? "Böj tungspetsen bakåt." : ini === "x" ? "Tungryggen mot gommen, spridda läppar." : "Tungspetsen fram mot tänderna."));
    }
    if (cmp && cmp.syl[i]) {
      const c = cmp.syl[i];
      const simP = Math.max(0, 100 - c.pitchDist * 18), simS = c.specDist != null ? Math.max(0, 100 - (c.specDist - 0.6) * 60) : null;
      row.sim = { pitch: Math.round(simP), spec: simS == null ? null : Math.round(Math.min(100, simS)), dur: c.durRatio };
      if (c.durRatio > 1.6) row.tips.push("Stavelsen var mycket längre än förlagan.");
      else if (c.durRatio < 0.55) row.tips.push("Stavelsen var mycket kortare än förlagan.");
      if (c.consRatio != null && (ASP[ini]) && c.consRatio < 0.5) row.tips.push("Förlagan har dubbelt så lång luftpuff som du.");
      if (simS != null && simS < 45) row.tips.push("Ljudet skiljer sig från förlagan. Lyssna på final och vokal (" + info.fin + ").");
    }
    rows.push(row);
  }
  const toneRows = rows.filter(r => r.toneOk !== null && r.exp !== 5);
  const toneScore = toneRows.length ? Math.round(toneRows.filter(r => r.toneOk).length / toneRows.length * 100) : null;
  const iniRows = rows.filter(r => r.ini); const iniScore = iniRows.length ? Math.round(iniRows.filter(r => r.ini.ok).length / iniRows.length * 100) : null;
  const sims = rows.filter(r => r.sim).map(r => r.sim.pitch); const simScore = sims.length ? Math.round(mean(sims)) : null;
  return { rows, toneScore, iniScore, simScore, sylFound: an.syls.length };
}
function fmt(v) { return (Math.round(v * 10) / 10).toString().replace(".", ","); }

// syntetisk tonkurva för ritning när förlaga saknas
function templateCurve(tones, durs) { const pts = []; tones.forEach((t, i) => { const tpl = t === 5 ? [0, 0, -0.5, -1, -1.2, -1.5, -1.5, -1.5, -1.5, -1.5, -1.5, -1.5] : TPL[t]; const n = Math.max(4, Math.round((durs[i] || 250) / 20)); for (let k = 0; k < n; k++) pts.push(tpl[Math.round(k * 11 / (n - 1))]); pts.push(null); }); return pts; }

window.MA = { SR, parsePinyin, splitIF, sylInfo, sandhi, marked, toMono16k, resample, analyze, classifyTone, compareToModel, judge, yin, templateCurve, normContour, TONE_NAME, INI_INFO, ASP, UNASP };
})();
