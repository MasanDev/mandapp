/* Skugga: skuggning inne i Mandapp. Laddas av index.html. Allt ligger i en egen funktion så att namnen inte krockar med huvudappen. */
(function () {
"use strict";
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) { const e = document.createElement(tag); if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); } for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); return e; }
function toast(t) { const e = h("div", { class: "toast", role: "status" }, t); document.body.append(e); setTimeout(() => e.remove(), 2200); }
const uid = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt1 = v => (Math.round(v * 10) / 10).toString().replace(".", ",");

/* ---------- IndexedDB ---------- */
const DB = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open("mandapp-studio", 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("items", { keyPath: "id" }); const a = d.createObjectStore("attempts", { keyPath: "id" }); a.createIndex("item", "itemId"); d.createObjectStore("kv"); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async tx(store, mode, fn) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out); t.onerror = () => rej(t.error); }); },
  all(store) { return this.tx(store, "readonly", s => s.getAll()); },
  put(store, v, k) { return this.tx(store, "readwrite", s => k === undefined ? s.put(v) : s.put(v, k)); },
  del(store, k) { return this.tx(store, "readwrite", s => s.delete(k)); },
  get(store, k) { return this.tx(store, "readonly", s => s.get(k)); },
  byItem(id) { return this.tx("attempts", "readonly", s => s.index("item").getAll(id)); }
};

/* ---------- data ---------- */
const STARTER = [
  ["你好", "ni3 hao3", "hej"], ["谢谢", "xie4 xie5", "tack"], ["我不知道", "wo3 bu4 zhi1 dao4", "jag vet inte"],
  ["请问，银行在哪里？", "qing3 wen4 yin2 hang2 zai4 na3 li3", "ursäkta, var ligger banken?"],
  ["我想开一个账户", "wo3 xiang3 kai1 yi1 ge4 zhang4 hu4", "jag vill öppna ett konto"],
  ["出租车", "chu1 zu1 che1", "taxi"], ["学习中文", "xue2 xi2 zhong1 wen2", "studera kinesiska"],
  ["四十四", "si4 shi2 si4", "fyrtiofyra"], ["吃饭了吗？", "chi1 fan4 le5 ma5", "har du ätit?"], ["一起去", "yi1 qi3 qu4", "gå tillsammans"]
];
let ITEMS = [], CUR = null;
async function loadItems() {
  ITEMS = await DB.all("items");
  if (!ITEMS.length && !(await DB.get("kv", "seeded"))) {
    for (const [zh, py, sv] of STARTER) await DB.put("items", { id: uid(), zh, pinyin: py, sv, audio: null, added: Date.now(), source: "start" });
    await DB.put("kv", true, "seeded"); ITEMS = await DB.all("items");
  }
  ITEMS.sort((a, b) => a.added - b.added);
}
function itemSyls(it) { return MA.parsePinyin(it.pinyin); }

/* ---------- TTS ---------- */
let zhVoice = null;
function pickVoice() { try { const v = speechSynthesis.getVoices(); zhVoice = v.find(x => /zh[-_]CN/i.test(x.lang)) || v.find(x => /^zh/i.test(x.lang)) || null; } catch { } }
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(t, rate) { return new Promise(res => { try { const u = new SpeechSynthesisUtterance(t); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = rate || 0.85; u.onend = res; u.onerror = res; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { res(); } }); }

/* ---------- pinyin-rendering ---------- */
function pyNode(syls, tones) { const w = h("span"); syls.forEach((s, i) => { if (i) w.append(" "); const t = tones ? tones[i] : s.tone; w.append(h("span", { class: "t" + s.tone }, MA.marked(s.syl, s.tone)), tones && t !== s.tone ? h("sup", { class: "t" + t, title: "uttalas med ton " + t }, "→" + t) : ""); }); return w; }

/* ---------- ÖVA ---------- */
const audioEl = new Audio(); audioEl.preload = "auto"; let audioUrl = null;
const AB = { a: null, b: null, loop: false };
// Röster ur AISHELL-3 (audio/aishell.json). VOICE = "sel" (alla som passar filtret), "all" eller ett talar-id.
let VOICES = []; let VOICE = "sel"; try { VOICE = localStorage.getItem("studio-voice") || "sel"; } catch { }
let GEN = "any", ACC = "any"; try { GEN = localStorage.getItem("studio-gen") || "any"; ACC = localStorage.getItem("studio-acc") || "any"; } catch { }
const voiceList = () => VOICES.filter(v => (GEN === "any" || !v.gender || v.gender === GEN) && (ACC === "any" || !v.accent || v.accent === ACC));
function voiceOk(i) {
  if (!VOICES.length || VOICE === "all") return true;
  if (!isSentence(i)) return true; // enstaka ord har en egen inläsare (audio-cmn)
  return VOICE === "sel" ? voiceList().some(v => v.speaker === i.speaker) : i.speaker === VOICE;
}
const practiceItems = () => ITEMS.filter(i => (i.audio || i.audioPath) && voiceOk(i));
function voiceLabel() {
  const g = { any: "", male: "Man", female: "Kvinna" }[GEN], a = { any: "", north: "Nord", south: "Syd" }[ACC];
  if (VOICE === "all") return "Alla röster";
  const v = VOICES.find(x => x.speaker === VOICE); if (v) return v.label.split(":")[0];
  return [g, a].filter(Boolean).join(" · ") || "Alla röster";
}
function renderVoiceSel() {
  const L = voiceList();
  if (VOICES.length && !(VOICE === "all" || VOICE === "sel" || L.some(v => v.speaker === VOICE))) { VOICE = "sel"; try { localStorage.setItem("studio-voice", VOICE); } catch { } }
  document.querySelectorAll(".voiceLbl, #voiceLbl").forEach(e => e.textContent = voiceLabel());
}
const prevAudio = new Audio();
function openVoiceSheet() {
  const box = h("div", { class: "stack" });
  const seg = (opts, cur, set) => h("div", { class: "segctl" }, opts.map(([v, l]) => h("button", { type: "button", class: "chip" + (cur === v ? " on" : ""), onclick: () => { set(v); draw(); } }, l)));
  const draw = () => {
    const L = voiceList(); const tot = L.reduce((a, v) => a + v.n, 0);
    box.replaceChildren(
      h("h2", { style: "margin:0" }, "Röster"),
      seg([["any", "Alla"], ["male", "Män"], ["female", "Kvinnor"]], GEN, v => { GEN = v; try { localStorage.setItem("studio-gen", v); } catch { } }),
      seg([["any", "Båda"], ["north", "Nord"], ["south", "Syd"]], ACC, v => { ACC = v; try { localStorage.setItem("studio-acc", v); } catch { } }),
      h("div", null,
        vrow("sel", "Alla som passar", L.length + " röster · " + tot + " meningar · växlar per mening"),
        L.map(v => vrow(v.speaker, v.label.split(":")[0], (v.label.split(":")[1] || "").trim() + " · " + v.n + " meningar", v)),
        vrow("all", "Alla inspelningar", "blandade röster, även utan uppgift om kön och accent")),
      h("button", { class: "btn primary block", type: "button", onclick: () => { closeSheet(); } }, "Klar"));
  };
  const vrow = (id, title, sub, v) => h("div", { class: "vrow" + (VOICE === id ? " sel" : "") },
    v ? h("button", { class: "pl", type: "button", "aria-label": "Provlyssna " + title, onclick: () => { const it = ITEMS.find(i => i.speaker === v.speaker && i.audioPath); if (it) { prevAudio.src = it.audioPath; prevAudio.play().catch(() => { }); } } }, "▶") : h("span", { class: "pl" }, "∗"),
    h("button", { type: "button", style: "all:unset;cursor:pointer;min-width:0", onclick: () => { setVoice(id); draw(); } }, h("b", null, title), h("small", null, sub)),
    h("span", { class: "chk" }, VOICE === id ? "✓" : ""));
  draw(); openSheet(box);
  const obs = new MutationObserver(() => { if (!box.isConnected) { obs.disconnect(); renderVoiceSel(); setVoice(VOICE); if (typeof window.SK_onVoice === "function") window.SK_onVoice(); } });
  obs.observe(document.body, { childList: true });
}
function setVoice(v) {
  VOICE = v; try { localStorage.setItem("studio-voice", v); } catch { } renderVoiceSel();
  if (CUR && !voiceOk(CUR)) { const P = practiceItems().filter(isSentence); const n = P[0] || practiceItems()[0]; if (n) { selectItem(n.id); return; } }
  renderItemSel(); showSentHits($("#sentQ").value.trim());
}
function renderItemSel() {
  const P = practiceItems(); const list = CUR && !CUR.audio ? [CUR, ...P] : P;
  const isSent = it => [...it.zh].filter(c => /[\u3400-\u9fff]/.test(c)).length > 4 || /[，。！？、,.!?]/.test(it.zh);
  const opt = it => h("option", { value: it.id }, it.zh + (it.audio || it.audioPath ? "" : " (saknar native)"));
  const sent = list.filter(isSent), words = list.filter(it => !isSent(it));
  const sel = $("#itemSel"); sel.replaceChildren(...[sent.length ? h("optgroup", { label: "Meningar (" + sent.length + ")" }, sent.map(opt)) : null, words.length ? h("optgroup", { label: "Ord (" + words.length + ")" }, words.map(opt)) : null].filter(Boolean));
  if (CUR) sel.value = CUR.id;
  $("#missNote").textContent = "";
}
// Lägg in alla Tatoeba-meningar med native-ljud i biblioteket (en gång), så att det finns meningar att skugga
const SENT_PACKS = [
  { name: "tatoeba", file: "audio/tatoeba.json", dir: "audio/tatoeba/", credit: x => (x.author || "") + " " + (x.licence || "") + " " + (x.attribution || "") },
  { name: "stcmds", file: "audio/stcmds.json", dir: "audio/stcmds/", credit: () => "Free ST Chinese Mandarin Corpus (OpenSLR 38), CC BY-NC-ND 4.0" },
  { name: "rost", file: "audio/rost.json", dir: "audio/rost/", credit: x => x.voice + " · Free ST Chinese Mandarin Corpus (OpenSLR 38), CC BY-NC-ND 4.0" },
  { name: "aishell", file: "audio/aishell.json", dir: "audio/aishell/", voices: true, credit: x => x.voice + " · AISHELL-3 (OpenSLR 93), Apache 2.0" }
];
// Lägg in alla meningar med native-ljud i biblioteket. Ljudet hämtas först när meningen öppnas.
async function seedSentences() {
  let n = 0; const have = new Set(ITEMS.map(i => i.zh)); const byZh = new Map(ITEMS.map(i => [i.zh, i]));
  for (const P of SENT_PACKS) {
    let pack = []; try { const r = await fetch(P.file); if (r.ok) pack = await r.json(); } catch { }
    if (P.voices && pack && pack.voices) { VOICES = pack.voices; renderVoiceSel(); }
    if (!Array.isArray(pack)) pack = (pack && pack.items) || [];
    const key = "seeded-" + P.name + "-" + pack.length; if (!pack.length || await DB.get("kv", key)) continue;
    for (const x of pack) {
      if (P.voices && have.has(x.zh)) { const old = byZh.get(x.zh); if (old && old.source !== P.name) { Object.assign(old, { audio: null, audioPath: P.dir + x.audio, speaker: x.speaker, voice: x.voice, source: P.name, credit: P.credit(x) }); await DB.put("items", old); n++; } continue; }
      if (have.has(x.zh)) continue; have.add(x.zh); const it = { id: uid(), zh: x.zh, pinyin: x.pinyin, sv: x.sv || x.en || "", audio: null, audioPath: P.dir + x.audio, added: Date.now() + n, source: P.name, credit: P.credit(x), speaker: x.speaker || null, voice: x.voice || null }; await DB.put("items", it); byZh.set(x.zh, it); n++; }
    await DB.put("kv", true, key);
  }
  if (n) await loadItems(); return n;
}
async function ensureAudio(it) {
  if (!it || it.audio || !it.audioPath) return;
  try { const r = await fetch(it.audioPath); if (r.ok) { it.audio = await r.blob(); await DB.put("items", it); } } catch { }
}
let fillingNative = false;
async function fillNative() {
  if (fillingNative) return; fillingNative = true; let n = 0;
  for (const it of ITEMS.filter(i => !i.audio && !i.audioPath)) { if (triedNative.has(it.id)) continue; triedNative.add(it.id); const b = await fetchNative(it.zh); if (b) { it.audio = b; it.audioSrc = "audio-cmn"; await DB.put("items", it); n++; } }
  fillingNative = false; if (n) { if (!CUR || !CUR.audio) { const P = practiceItems(); if (P[0]) { await selectItem(P[0].id); return; } } renderItemSel(); }
}
async function selectItem(id) {
  CUR = ITEMS.find(i => i.id === id) || practiceItems()[0] || ITEMS[0] || null;
  if (CUR && !CUR.audio && CUR.audioPath) { $("#recNote").textContent = "Hämtar native…"; await ensureAudio(CUR); }
  try { localStorage.setItem("studio-cur", CUR ? CUR.id : ""); } catch { }
  renderItemSel(); renderItem();
}
function renderItem() {
  $("#result").replaceChildren(); TAKES.length = 0; TAKE_SEL = -1; NATIVE = null; renderTakes(); drawMimic(); AB.a = AB.b = null; AB.loop = false; $("#loopBtn").classList.remove("on"); updAB();
  if (!CUR) { $("#oZh").textContent = "Biblioteket är tomt"; $("#oPy").textContent = ""; $("#oSv").textContent = ""; $("#breakdown").replaceChildren(); $("#modelRow").replaceChildren(); return; }
  const syls = itemSyls(CUR); const sd = MA.sandhi(syls, CUR.zh);
  $("#oZh").textContent = CUR.zh; $("#oPy").replaceChildren(pyNode(syls, sd.tones)); $("#oSv").textContent = CUR.sv || ""; $("#oVoice").textContent = CUR.voice || "";
  // breakdown
  const tb = h("table", null, h("thead", null, h("tr", null, h("th", null, "Stavelse"), h("th", null, "Initial"), h("th", null, "Final"), h("th", null, "Ton"))));
  const body = h("tbody"); const chars = [...CUR.zh].filter(c => /[㐀-鿿]/.test(c));
  syls.forEach((s, i) => {
    const info = MA.sylInfo(s.syl, sd.tones[i]);
    body.append(h("tr", null,
      h("td", null, h("span", { class: "zh" }, chars[i] || ""), " ", h("span", { class: "mono t" + s.tone }, MA.marked(s.syl, s.tone))),
      h("td", null, h("b", { class: "mono" }, info.ini || "–"), h("div", { class: "note" }, info.iniKind)),
      h("td", null, h("b", { class: "mono" }, info.fin.replace(/v/g, "ü"))),
      h("td", null, h("span", { class: "t" + sd.tones[i] }, sd.tones[i] === 5 ? "neutral" : sd.tones[i]), sd.tones[i] !== s.tone ? h("div", { class: "note" }, "(skrivs " + s.tone + ")") : null)));
    if (info.traps.length || info.iniTip) body.append(h("tr", null, h("td", { colspan: 4, style: "border-bottom:1px solid var(--line);padding-top:0" }, info.iniTip ? h("div", { class: "note" }, info.ini + ": " + info.iniTip) : null, info.traps.map(t => h("span", { class: "tag warn" }, t)))));
  });
  tb.append(body);
  const box = $("#breakdown"); box.replaceChildren(tb);
  if (sd.notes.length) box.append(h("div", { class: "note", style: "margin-top:6px" }, "Tonsandhi: " + sd.notes.join(". ") + "."));
  if (syls.length !== chars.length && chars.length) box.append(h("div", { class: "banner", style: "margin-top:6px" }, "Antalet stavelser i pinyin (" + syls.length + ") stämmer inte med antalet tecken (" + chars.length + "). Rätta pinyin i biblioteket."));
  // model
  const mr = $("#modelRow"); mr.replaceChildren();
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
  if (CUR.audio) {
    audioUrl = URL.createObjectURL(CUR.audio); audioEl.src = audioUrl;
    mr.append(h("button", { class: "btn primary", onclick: playModel }, "▶ Native"), h("button", { class: "btn", onclick: () => { audioEl.pause(); } }, "■"));
    $("#modelNote").textContent = "Riktig inspelning. Tonkurvan jämförs med den.";
    nativeTrack(CUR);
  } else {
    audioEl.removeAttribute("src");
    tryNativeAudio(CUR);
    $("#modelNote").textContent = "Den här frasen saknar native-inspelning. Välj en ljudfil eller låt en kinesisktalande spela in den.";
    const fi = h("input", { type: "file", accept: "audio/*,video/*", hidden: true }); fi.onchange = async () => { const f = fi.files[0]; if (!f) return; CUR.audio = f; await DB.put("items", CUR); await loadItems(); toast("Native sparad"); renderItemSel(); renderItem(); };
    mr.append(h("label", { class: "btn primary" }, "Välj native-ljudfil", fi));
    $("#modelBox").open = true;
  }
  mr.append(h("button", { class: "btn", onclick: () => recordModel() }, "● Spela in native"));
  $("#recBtn").disabled = !CUR.audio && !CONT.on; $("#playNative").disabled = !CUR.audio; $("#contBtn").disabled = !CUR.audio; $("#modeLoop").disabled = !CUR.audio;
  $("#recNote").textContent = CUR.audio ? "Lyssna, tryck på den röda knappen och härma. Tryck igen när du är klar." : "Den här frasen saknar native-ljud. Lägg till det under Fler inställningar.";
  renderHistory(); renderRelated();
}
function playModel() {
  if (!CUR || !CUR.audio) return;
  audioEl.playbackRate = +$("#speed").value; try { audioEl.preservesPitch = true; audioEl.webkitPreservesPitch = true; } catch { }
  if (AB.a != null) audioEl.currentTime = AB.a; else audioEl.currentTime = 0;
  audioEl.play().catch(() => toast("Kunde inte spela upp"));
}
audioEl.addEventListener("timeupdate", () => { if (AB.loop && AB.b != null && audioEl.currentTime >= AB.b) { audioEl.currentTime = AB.a || 0; } });
audioEl.addEventListener("ended", () => { if (AB.loop) { audioEl.currentTime = AB.a || 0; audioEl.play(); } });
$("#setA").onclick = () => { AB.a = audioEl.currentTime || 0; updAB(); };
$("#setB").onclick = () => { AB.b = audioEl.currentTime || null; updAB(); };
$("#loopBtn").onclick = () => { AB.loop = !AB.loop; $("#loopBtn").classList.toggle("on", AB.loop); if (AB.loop) playModel(); else audioEl.pause(); };
function updAB() { $("#abInfo").textContent = (AB.a != null ? "A " + fmt1(AB.a) + " s " : "") + (AB.b != null ? "B " + fmt1(AB.b) + " s" : ""); }
$("#speed").onchange = () => setSpeed($("#speed").value);

/* ---------- inspelning ---------- */
const REC = { on: false, stream: null, mr: null, chunks: [], ac: null, an: null, raf: 0, live: [], t0: 0, target: "user" };
async function getStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("nomic");
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } });
}
async function startRec(target) {
  if (REC.on) return;
  try { REC.stream = await getStream(); } catch (e) { $("#recNote").textContent = "Fick inte tillgång till mikrofonen. Tillåt mikrofon för den här sidan i webbläsarens inställningar."; return; }
  REC.target = target; REC.chunks = []; REC.live = []; REC.on = true; REC.t0 = performance.now();
  const types = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"]; const mt = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
  REC.mr = new MediaRecorder(REC.stream, mt ? { mimeType: mt } : undefined);
  REC.mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  REC.mr.onstop = onRecStop;
  await beep("start");
  REC.mr.start();
  const AC = window.AudioContext || window.webkitAudioContext; REC.ac = new AC();
  const src = REC.ac.createMediaStreamSource(REC.stream); REC.an = REC.ac.createAnalyser(); REC.an.fftSize = 2048; src.connect(REC.an);
  const buf = new Float32Array(2048); let frame = 0;
  const loop = () => {
    if (!REC.on) return; REC.raf = requestAnimationFrame(loop);
    if (frame++ % 2) return;
    REC.an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; const db = 10 * Math.log10(s / buf.length + 1e-12);
    const [f0, ap] = db > -55 ? MA.yin(buf, 0, 2048, REC.ac.sampleRate, 70, 500) : [0, 1];
    REC.live.push({ t: (performance.now() - REC.t0) / 1000, f0: f0 && ap < 0.3 ? f0 : 0, db });
    drawLive();
    if (performance.now() - REC.t0 > 30000) stopRec();
  };
  loop();
  const btn = $("#recBtn"); btn.classList.add("live"); btn.setAttribute("aria-label", "Stoppa inspelningen");
  $("#recNote").textContent = target === "model" ? "Spelar in native… låt en kinesisktalande säga frasen tydligt." : "Spelar in… säg frasen.";
  if (target === "user" && $("#withModel").checked && CUR.audio) playModel();
}
function stopRec() {
  if (!REC.on) return; REC.on = false; cancelAnimationFrame(REC.raf);
  try { REC.mr.stop(); } catch { }
  setTimeout(() => beep("stop"), 60);
  REC.stream.getTracks().forEach(t => t.stop()); try { REC.ac.close(); } catch { }
  const btn = $("#recBtn"); btn.classList.remove("live"); btn.setAttribute("aria-label", "Spela in");
}
$("#recBtn").onclick = () => { if (CONT.on) { contStop(); return; } if (!CUR) return; audioEl.pause(); meEl.pause(); REC.on ? stopRec() : startRec("user"); };
function recordModel() { if (REC.on) return; if (!CUR) return; startRec("model"); }
async function onRecStop() {
  const blob = new Blob(REC.chunks, { type: (REC.mr && REC.mr.mimeType) || "audio/webm" });
  if (blob.size < 1000) { $("#recNote").textContent = "Inspelningen blev tom. Försök igen."; return; }
  if (REC.target === "model") {
    CUR.audio = blob; await DB.put("items", CUR); toast("Native sparad"); renderItemSel(); renderItem(); $("#recNote").textContent = "Native-inspelningen är sparad. Spela nu in dig själv."; return;
  }
  try {
    const x = await MA.toMono16k(await blob.arrayBuffer());
    const take = await addTake(blob, x);
    if (!take) { $("#recNote").textContent = "Hörde nästan inget. Prata närmare mikrofonen."; return; }
    $("#recNote").textContent = "Försök " + take.n + ". Lyssna, jämför och spela in igen.";
  } catch (e) { console.error(e); $("#recNote").textContent = "Kunde inte läsa ljudet (" + (e.message || e) + ")."; }
}
/* ---------- pip ---------- */
let BEEPAC = null;
function beep(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; BEEPAC = BEEPAC || new AC(); if (BEEPAC.state === "suspended") BEEPAC.resume();
    const t0 = BEEPAC.currentTime + 0.01; const fr = kind === "start" ? [660, 990] : kind === "ready" ? [880, 880] : [880, 520];
    fr.forEach((f, i) => { const o = BEEPAC.createOscillator(), g = BEEPAC.createGain(); o.type = "sine"; o.frequency.value = f; const ts = t0 + i * 0.09; g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.18, ts + 0.01); g.gain.exponentialRampToValueAtTime(0.001, ts + 0.08); o.connect(g); g.connect(BEEPAC.destination); o.start(ts); o.stop(ts + 0.09); });
  } catch { }
  return new Promise(r => setTimeout(r, 200));
}
async function addTake(blob, x) {
  const pt = MA.pitchTrack(x);
  if (!pt) return null;
  const take = { blob, x, pt, url: URL.createObjectURL(blob), t: Date.now(), n: (TAKES.length ? TAKES[TAKES.length - 1].n : 0) + 1 };
  TAKES.push(take); if (TAKES.length > 6) { const old = TAKES.shift(); URL.revokeObjectURL(old.url); }
  TAKE_SEL = TAKES.length - 1; $("#result").replaceChildren(); renderTakes(); drawMimic();
  if (SYL.on) runSeg(take.pt, x);
  const att = { id: uid(), itemId: CUR.id, zh: CUR.zh, t: take.t, audio: blob };
  take.attId = att.id; DB.put("attempts", att).then(() => { pruneAttempts(CUR.id); renderHistory(); });
  return take;
}
function wavBlob(f32, sr) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); ws(8, "WAVE"); ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}

/* ---------- kontinuerligt läge ---------- */
const CONT = { gen: 0, on: false, stream: null, ac: null, proc: null, state: "off", pre: [], cur: [], floor: -60, loud: 0, quiet: 0, live: [], sr: 48000 };
function contStatus(t) { const e = $("#contNote"); e.textContent = t; e.hidden = !CONT.on; }
function setModeUi() { $("#modeMan").classList.toggle("on", !CONT.on); $("#modeLoop").classList.toggle("on", CONT.on); $("#recBtn").classList.toggle("live", CONT.on || REC.on); }
async function contStart() {
  if (REC.on) stopRec();
  try { CONT.stream = await getStream(); } catch { contStatus("Fick inte tillgång till mikrofonen."); return; }
  const AC = window.AudioContext || window.webkitAudioContext; CONT.ac = new AC(); CONT.sr = CONT.ac.sampleRate;
  const src = CONT.ac.createMediaStreamSource(CONT.stream);
  CONT.proc = CONT.ac.createScriptProcessor(2048, 1, 1); const mute = CONT.ac.createGain(); mute.gain.value = 0;
  src.connect(CONT.proc); CONT.proc.connect(mute); mute.connect(CONT.ac.destination);
  CONT.on = true; CONT.pre = []; CONT.cur = []; CONT.floor = -55; CONT.state = "idle";
  CONT.gen++;
  CONT.proc.onaudioprocess = e => contFrame(e.inputBuffer.getChannelData(0));
  $("#recBtn").disabled = false; $("#recBtn").setAttribute("aria-label", "Stoppa loopen"); setModeUi();
  contCycle();
}
function contStop() {
  CONT.gen++; CONT.on = false; CONT.state = "off";
  audioEl.pause(); meEl.pause(); $("#recBtn").setAttribute("aria-label", "Spela in");
  try { CONT.proc.disconnect(); } catch { } try { CONT.stream.getTracks().forEach(t => t.stop()); } catch { } try { CONT.ac.close(); } catch { }
  $("#recBtn").disabled = !(CUR && CUR.audio); setModeUi(); contStatus("");
}
async function contCycle() {
  if (!CONT.on) return;
  const g = CONT.gen, live = () => CONT.on && CONT.gen === g;
  CONT.state = "busy";
  if ($("#contNative").checked) { contStatus("Lyssna på native…"); await playNativeP(); await new Promise(r => setTimeout(r, 150)); }
  if (!live()) return;
  await beep("ready");
  if (!live()) return;
  CONT.pre = []; CONT.cur = []; CONT.loud = 0; CONT.quiet = 0; CONT.live = []; CONT.state = "idle";
  contStatus("Redo. Prata när du vill.");
}
function contFrame(d) {
  if (!CONT.on) return;
  const buf = Float32Array.from(d); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  const db = 10 * Math.log10(s / buf.length + 1e-12);
  if (CONT.state === "busy") return;
  if (CONT.state === "idle") {
    CONT.floor = Math.min(-25, CONT.floor * 0.97 + Math.min(db, CONT.floor + 3) * 0.03);
    CONT.pre.push(buf); if (CONT.pre.length > 8) CONT.pre.shift();
    if (db > CONT.floor + 14) { if (++CONT.loud >= 2) { CONT.state = "speech"; CONT.cur = CONT.pre.slice(); CONT.quiet = 0; CONT.t0 = performance.now(); contStatus("Spelar in…"); } } else CONT.loud = 0;
  } else if (CONT.state === "speech") {
    CONT.cur.push(buf);
    const [f0, ap] = db > CONT.floor + 8 ? MA.yin(buf, 0, buf.length, CONT.sr, 70, 500) : [0, 1];
    CONT.live.push(f0 && ap < 0.3 ? f0 : 0);
    const vf = CONT.live.filter(Boolean).sort((a, b) => a - b); const med = vf.length ? vf[vf.length >> 1] : 150;
    drawMimic(CONT.live.map(f => f ? 12 * Math.log2(f / med) : null));
    if (db < CONT.floor + 9) CONT.quiet++; else CONT.quiet = 0;
    const quietMs = CONT.quiet * 2048 / CONT.sr * 1000, dur = performance.now() - CONT.t0;
    if ((quietMs > 700 && dur > 500) || dur > 15000) contFinish();
  }
}
async function contFinish() {
  const g = CONT.gen, live = () => CONT.on && CONT.gen === g;
  CONT.state = "busy"; await beep("stop");
  const len = CONT.cur.reduce((a, b) => a + b.length, 0); const all = new Float32Array(len); let o = 0; for (const b of CONT.cur) { all.set(b, o); o += b.length; }
  CONT.cur = [];
  try {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; const ab = CONT.ac.createBuffer(1, all.length, CONT.sr);
    ab.copyToChannel(all, 0); const x = await MA.resample(ab);
    const take = await addTake(wavBlob(all, CONT.sr), x);
    if (!live()) return;
    if (!take) { contStatus("Hörde för lite. Försök igen."); }
    else {
      $("#recNote").textContent = "Försök " + take.n + " (kontinuerligt).";
      const m = $("#contPlay").value;
      if (m === "me") await playMe(); else if (m === "both") await Promise.all([playNativeP(), playMe()]); else if (m === "seq") { await playNativeP(); await new Promise(r => setTimeout(r, 250)); await playMe(); }
      await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) { console.error(e); if (live()) contStatus("Fel: " + (e.message || e)); }
  if (live()) contCycle();
}
$("#contBtn").onclick = () => { audioEl.pause(); meEl.pause(); beep("init"); CONT.on ? contStop() : contStart(); };
$("#modeLoop").onclick = () => { if (CONT.on) contStop(); else if (CUR && CUR.audio) $("#contBtn").click(); };
$("#modeMan").onclick = () => { if (CONT.on) contStop(); };

/* ---------- härmningsläge: kurvor och uppspelning ---------- */
const TAKES = []; let TAKE_SEL = -1; let NATIVE = null;
async function nativeTrack(it) {
  try { const x = await MA.toMono16k(await it.audio.arrayBuffer()); const pt = MA.pitchTrack(x); if (CUR && CUR.id === it.id && pt) { pt.x = x; NATIVE = pt; drawMimic(); if (SYL.on) runSeg(NATIVE); } } catch (e) { console.warn(e); }
}
function renderTakes() {
  renderTestBox();
  const row = $("#takesRow"); row.replaceChildren();
  const has = TAKE_SEL >= 0; ["#playMe", "#playBoth", "#playSeq"].forEach(s => $(s).disabled = !has);
  $("#takeInfo").textContent = TAKES.length ? TAKES.length + " försök" : "";
  if (TAKES.length > 1) { row.append(h("span", { class: "note" }, "Försök:")); TAKES.forEach((t, i) => row.append(h("button", { class: "chip" + (i === TAKE_SEL ? " on" : ""), onclick: () => { TAKE_SEL = i; renderTakes(); drawMimic(); } }, String(t.n)))); }
}
function drawMimic(live) {
  const c = $("#live"); const { g, W, H } = setupCanvas(c); g.clearRect(0, 0, W, H);
  const pad = 10, R = 9; const yOf = v => H / 2 - Math.max(-R, Math.min(R, v)) / R * (H / 2 - pad);
  g.strokeStyle = css("--line"); g.lineWidth = 1; [-6, 0, 6].forEach(v => { g.beginPath(); g.moveTo(0, yOf(v)); g.lineTo(W, yOf(v)); g.stroke(); });
  const same = $("#sameLen").checked; const take = TAKES[TAKE_SEL];
  if (!live && SYL.on && NATIVE && NATIVE.seg && (!take || take.pt.seg)) { drawSylView(g, W, H, yOf, take); return; }
  const durs = [NATIVE ? NATIVE.st.length : 0, take ? take.pt.st.length : 0, live ? live.length : 0]; const maxLen = Math.max(1, ...durs);
  const draw = (arr, color, w, en) => {
    const n = arr.length; if (!n) return; const span = same ? W : W * n / maxLen; const xOf = i => i / Math.max(1, n - 1) * span;
    if (en) { g.fillStyle = color; g.globalAlpha = 0.12; for (let i = 0; i < n; i++) { const hh = en[i] * (H - 2 * pad) * 0.5; g.fillRect(xOf(i), H - pad - hh, Math.max(1, span / n), hh); } g.globalAlpha = 1; }
    g.strokeStyle = color; g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round"; g.beginPath(); let pen = false;
    for (let i = 0; i < n; i++) { const v = arr[i]; if (v == null) { pen = false; continue; } const X = xOf(i), Y = yOf(v); if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); }
    g.stroke();
  };
  if (NATIVE) draw(NATIVE.st, css("--muted"), 5, NATIVE.en);

  if (live) draw(live, css("--accent"), 2.5);
  else if (take) draw(take.pt.st, css("--accent"), 3, take.pt.en);
  g.font = "11px " + css("--mono"); g.fillStyle = css("--muted");
  if (!NATIVE && CUR && CUR.audio) g.fillText("läser native…", 6, 14);
}
/* ---------- stavelse för stavelse (modell i webbläsaren, align.js) ---------- */
const SYL = { on: false, ready: false };
try { SYL.on = localStorage.getItem("studio-syl") === "1"; } catch { }
function sylNote(t) { const e = $("#sylNote"); if (e) { e.textContent = t || ""; e.hidden = !t; } }
async function runSeg(pt, x) {
  const it = CUR; if (!it || !window.MAL) return;
  x = x || pt.x; if (!x) return;
  const syls = itemSyls(it); const tones = MA.sandhi(syls, it.zh).tones;
  try {
    if (!SYL.ready) { const cached = await MAL.isCached(); sylNote(cached ? "Startar stavelsemodellen…" : "Laddar ner stavelsemodellen (116 MB, bara första gången)…"); await MAL.load(f => sylNote("Laddar ner stavelsemodellen: " + Math.round(f * 100) + " %")); SYL.ready = true; sylNote(""); }
    const seg = await MAL.segment(x, syls, tones);
    if (CUR !== it) return;
    if (!seg) { sylNote("Kunde inte dela upp i stavelser. Visar hela kurvan."); return; }
    seg.base = pt.startSec; pt.seg = seg; drawMimic();
  } catch (e) { console.warn(e); sylNote("Stavelsemodellen gick inte att starta (" + (e.message || e) + ")."); }
}
function setSyl(on) {
  SYL.on = on; try { localStorage.setItem("studio-syl", on ? "1" : "0"); } catch { }
  $("#sylMode").checked = on; $("#sameLenLbl").hidden = on;
  if (on) { if (NATIVE && !NATIVE.seg) runSeg(NATIVE); TAKES.forEach(t => { if (!t.pt.seg) runSeg(t.pt, t.x); }); } else sylNote("");
  drawMimic();
}
function drawSylView(g, W, H, yOf, take) {
  const b = NATIVE.seg.bounds, n = b.length - 1; const tot = b[n] - b[0] || 1;
  const top = 26; const slotX = [], slotW = [];
  let acc = 0; for (let k = 0; k < n; k++) { slotX.push(acc / tot * W); slotW.push((b[k + 1] - b[k]) / tot * W); acc += b[k + 1] - b[k]; }
  const syls = CUR ? itemSyls(CUR) : []; const tones = CUR ? MA.sandhi(syls, CUR.zh).tones : []; const chars = CUR ? [...CUR.zh].filter(c => /[㐀-鿿]/.test(c)) : [];
  g.save(); g.setLineDash([3, 4]); g.strokeStyle = css("--line"); g.lineWidth = 1;
  for (let k = 1; k < n; k++) { g.beginPath(); g.moveTo(slotX[k], top - 4); g.lineTo(slotX[k], H); g.stroke(); }
  g.restore();
  g.textAlign = "center"; g.textBaseline = "top";
  for (let k = 0; k < n; k++) {
    const cx = slotX[k] + slotW[k] / 2; g.fillStyle = css("--fg"); g.font = "15px system-ui, sans-serif"; g.fillText(chars[k] || "", cx, 2);
    if (slotW[k] > 26 && syls[k]) { g.fillStyle = css("--t" + tones[k]) || css("--muted"); g.font = "10px " + css("--mono"); g.fillText(MA.marked(syls[k].syl, syls[k].tone), cx, 18); }
  }
  g.textAlign = "start"; g.textBaseline = "alphabetic";
  const yS = v => Math.max(top + 8, yOf(v));
  const drawSeg = (pt, color, w) => {
    const bb = pt.seg.bounds; if (bb.length - 1 !== n) return;
    g.strokeStyle = color; g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round";
    for (let k = 0; k < n; k++) {
      g.beginPath(); let pen = false; const a = bb[k], e = bb[k + 1];
      for (let i = 0; i < pt.st.length; i++) {
        const t = pt.startSec + i * 0.01 + 0.02; if (t < a || t >= e) continue;
        const v = pt.st[i]; if (v == null) { pen = false; continue; }
        const X = slotX[k] + (t - a) / (e - a || 1) * slotW[k], Y = yS(v);
        if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y);
      }
      g.stroke();
    }
  };
  drawSeg(NATIVE, css("--muted"), 5);
  if (take) drawSeg(take.pt, css("--accent"), 3);
}
/* ---------- testinspelningar: spara nu, rätta senare (gärna av en native-talare), ladda upp till GitHub ---------- */
const TEST_INI = ["b","p","m","f","d","t","n","l","g","k","h","j","q","x","zh","ch","sh","r","z","c","s","y","w"];
const testAudio = new Audio(); let TEST_OPEN = null, TEST_DEL = null;
async function getTests() { return (await DB.get("kv", "tests")) || []; }
async function putTests(all) { await DB.put("kv", all, "tests"); }
const testStatus = x => x.uploaded ? "uppladdad" : x.said ? "rättad" : "ej rättad";
function renderTestBox() { const take = TAKES[TAKE_SEL]; const b = $("#testSave"); if (!b) return; b.disabled = !CUR || !take; b.textContent = take ? "Spara försök " + take.n + " för test" : "Spela in ett försök först"; }
$("#testSave").onclick = async () => {
  const take = TAKES[TAKE_SEL]; if (!CUR || !take) return;
  const syls = itemSyls(CUR); const tones = MA.sandhi(syls, CUR.zh).tones;
  const all = await getTests();
  all.push({ id: uid(), t: Date.now(), itemId: CUR.id, zh: CUR.zh, pinyin: CUR.pinyin, syls: syls.map(s => s.syl), lexTones: syls.map(s => s.tone), expectedTones: tones, nativeAudio: CUR.audioPath || null, voice: CUR.voice || null, said: null, audio: take.blob });
  await putTests(all); toast("Sparat. Rätta det när du vill."); renderTestList();
};
function testForm(x, all) {
  if (!x.syls) { const ps = MA.parsePinyin(x.pinyin); x.syls = ps.map(s => s.syl); x.lexTones = ps.map(s => s.tone); }
  const chars = [...x.zh].filter(c => /[㐀-鿿]/.test(c)); const rows = [];
  const tb = h("table", null, h("thead", null, h("tr", null, h("th", null, "Stavelse"), h("th", null, "Ton som sades"), h("th", null, "Initial som sades"))));
  const body = h("tbody");
  x.syls.forEach((syl, i) => {
    const ini = MA.splitIF(syl).ini, et = x.expectedTones[i], prev = x.said ? x.said[i] : null;
    const tv = !prev ? "" : prev.tone == null ? "?" : prev.tone === et ? "" : String(prev.tone);
    const iv = !prev ? "" : prev.ini == null ? "?" : prev.ini === ini ? "" : prev.ini === "" ? "-" : prev.ini;
    const opt = (v, t, cur) => h("option", { value: v, selected: v === cur }, t);
    const tSel = h("select", { "aria-label": "Ton på " + (chars[i] || syl) }, opt("", "rätt (" + et + ")", tv), [1, 2, 3, 4, 5].filter(t => t !== et).map(t => opt(String(t), t === 5 ? "neutral" : String(t), tv)), opt("?", "osäker", tv));
    const iSel = h("select", { "aria-label": "Initial på " + (chars[i] || syl) }, opt("", "rätt (" + (ini || "–") + ")", iv), TEST_INI.filter(v => v !== ini).map(v => opt(v, v, iv)), opt("-", "ingen", iv), opt("?", "osäker", iv));
    rows.push({ tSel, iSel, ini, et });
    body.append(h("tr", null, h("td", null, h("span", { class: "zh" }, chars[i] || ""), " ", h("span", { class: "mono t" + et }, MA.marked(syl, x.lexTones ? x.lexTones[i] : et))), h("td", null, tSel), h("td", null, iSel)));
  });
  tb.append(body);
  const done = h("button", { class: "btn primary", type: "button", onclick: async () => {
    x.said = rows.map(r => ({ tone: r.tSel.value === "" ? r.et : r.tSel.value === "?" ? null : +r.tSel.value, ini: r.iSel.value === "" ? r.ini : r.iSel.value === "?" ? null : r.iSel.value === "-" ? "" : r.iSel.value }));
    x.checkedAt = Date.now(); x.uploaded = false; await putTests(all); TEST_OPEN = null; toast("Rättat"); renderTestList();
  } }, "Klar");
  return h("div", { class: "stack", style: "margin:6px 0 10px" }, tb, h("div", { class: "row" }, done, h("button", { class: "btn", type: "button", onclick: () => { TEST_OPEN = null; renderTestList(); } }, "Avbryt")));
}
function playNativeOf(x) {
  const it = ITEMS.find(i => i.id === x.itemId);
  if (it && it.audio) { testAudio.src = URL.createObjectURL(it.audio); } else if (x.nativeAudio) testAudio.src = x.nativeAudio; else { toast("Native saknas"); return; }
  testAudio.play().catch(() => toast("Kunde inte spela upp"));
}
async function renderTestList() {
  const box = $("#testList"); if (!box) return; const all = await getTests();
  const nOpen = all.filter(x => !x.said).length, nUp = all.filter(x => x.said && !x.uploaded).length;
  $("#testCount").textContent = all.length ? all.length + " sparade · " + nOpen + " ej rättade · " + nUp + " att ladda upp" : "Inga sparade än";
  $("#testUpload").disabled = !nUp; $("#testExport").disabled = !all.length;
  box.replaceChildren(...all.slice().reverse().map(x => {
    const del = h("button", { class: "chip", type: "button", onclick: async () => { if (TEST_DEL !== x.id) { TEST_DEL = x.id; renderTestList(); return; } await putTests(all.filter(y => y.id !== x.id)); TEST_DEL = null; renderTestList(); } }, TEST_DEL === x.id ? "Ta bort?" : "✕");
    const row = h("div", { class: "row small", style: "flex-wrap:wrap;gap:6px" },
      h("span", { class: "zh", style: "flex:1;min-width:8em" }, x.zh),
      h("span", { class: "tag" + (x.said ? "" : " warn") }, testStatus(x)),
      h("button", { class: "chip", type: "button", onclick: () => { testAudio.src = URL.createObjectURL(x.audio); testAudio.play().catch(() => { }); } }, "▶ inspelning"),
      h("button", { class: "chip", type: "button", onclick: () => playNativeOf(x) }, "▶ native"),
      h("button", { class: "chip" + (TEST_OPEN === x.id ? " on" : ""), type: "button", onclick: () => { TEST_OPEN = TEST_OPEN === x.id ? null : x.id; renderTestList(); } }, x.said ? "Ändra" : "Rätta"), del);
    return TEST_OPEN === x.id ? h("div", null, row, testForm(x, all)) : row;
  }));
}
function b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
const testMeta = x => ({ ...x, audio: undefined, audioType: x.audio ? x.audio.type : null });
const extOf = t => /mp4|m4a|aac/.test(t || "") ? "m4a" : /ogg/.test(t || "") ? "ogg" : /wav/.test(t || "") ? "wav" : "webm";
try { $("#ghRepo").value = localStorage.getItem("studio-gh-repo") || ""; $("#ghToken").value = localStorage.getItem("studio-gh-token") || ""; } catch { }
$("#ghRepo").onchange = e => { try { localStorage.setItem("studio-gh-repo", e.target.value.trim()); } catch { } };
$("#ghToken").onchange = e => { try { localStorage.setItem("studio-gh-token", e.target.value.trim()); } catch { } };
async function ghPut(repo, token, path, b64content, msg) {
  const url = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const hd = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
  let sha; const g = await fetch(url, { headers: hd }); if (g.ok) sha = (await g.json()).sha;
  const r = await fetch(url, { method: "PUT", headers: hd, body: JSON.stringify({ message: msg, content: b64content, sha }) });
  if (!r.ok) throw new Error(r.status === 401 ? "nyckeln godtogs inte" : r.status === 404 ? "hittar inte repot (eller nyckeln saknar åtkomst)" : r.status === 403 ? "nyckeln saknar skrivrätt" : "GitHub svarade " + r.status);
}
$("#testUpload").onclick = async () => {
  const repo = ($("#ghRepo").value || "").trim(), token = ($("#ghToken").value || "").trim(), note = $("#testUpNote");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) { $("#testUp").open = true; note.textContent = "Fyll i repo och nyckel först."; return; }
  const all = await getTests(); const todo = all.filter(x => x.said && !x.uploaded); let n = 0;
  try {
    for (const x of todo) {
      note.textContent = "Laddar upp " + (n + 1) + " av " + todo.length + "…";
      const base = "tester/" + new Date(x.t).toISOString().slice(0, 10) + "-" + x.id;
      if (x.audio) await ghPut(repo, token, base + "." + extOf(x.audio.type), await b64(x.audio), "Testinspelning " + x.zh);
      await ghPut(repo, token, base + ".json", btoa(unescape(encodeURIComponent(JSON.stringify(testMeta(x), null, 1)))), "Facit " + x.zh);
      x.uploaded = true; n++; await putTests(all);
    }
    note.textContent = n + " uppladdade."; toast("Uppladdat");
  } catch (e) { note.textContent = "Stoppade efter " + n + ": " + (e.message || e) + "."; }
  renderTestList();
};
$("#testExport").onclick = async () => {
  const all = await getTests(); if (!all.length) return;
  const out = []; for (const x of all) out.push({ ...testMeta(x), audioB64: x.audio ? await b64(x.audio) : null });
  const file = new File([JSON.stringify({ app: "mandapp-testinspelningar", version: 2, exported: new Date().toISOString(), tests: out })], "mandapp-tester-" + new Date().toISOString().slice(0, 10) + ".json", { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Mandapp tester" }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const a = h("a", { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove();
};
$("#testBox").addEventListener("toggle", () => { if ($("#testBox").open) renderTestList(); });
const meEl = new Audio();
function playMe() { const t = TAKES[TAKE_SEL]; if (!t) return Promise.resolve(); return new Promise(res => { meEl.src = t.url; meEl.onloadedmetadata = () => { try { meEl.currentTime = t.pt.startSec; } catch { } }; meEl.onended = res; meEl.onerror = res; meEl.onpause = res; meEl.play().catch(res); }); }
function playNativeP() {
  if (!CUR) return Promise.resolve();
  if (!CUR.audio) return Promise.resolve();
  return new Promise(res => { audioEl.playbackRate = +$("#speed").value; try { audioEl.currentTime = AB.a != null ? AB.a : (NATIVE ? NATIVE.startSec : 0); } catch { } audioEl.onended = () => { audioEl.onended = null; res(); }; audioEl.onpause = () => { audioEl.onpause = null; res(); }; audioEl.play().catch(res); });
}
$("#playNative").onclick = () => { audioEl.pause(); meEl.pause(); playNativeP(); };
$("#playMe").onclick = () => { audioEl.pause(); playMe(); };
$("#playBoth").onclick = () => { audioEl.pause(); meEl.pause(); playNativeP(); playMe(); };
$("#playSeq").onclick = async () => { audioEl.pause(); meEl.pause(); await playNativeP(); await new Promise(r => setTimeout(r, 250)); playMe(); };
$("#sameLen").onchange = () => drawMimic();
$("#sylMode").onchange = e => setSyl(e.target.checked);
if (SYL.on) setSyl(true);
window.addEventListener("resize", () => drawMimic());
async function pruneAttempts(itemId) { const a = (await DB.byItem(itemId)).sort((x, y) => y.t - x.t); for (const old of a.slice(5)) if (old.audio) { old.audio = null; await DB.put("attempts", old); } }

/* ---------- ritning ---------- */
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function setupCanvas(c) { const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; c.width = Math.round(r.width * dpr); c.height = Math.round((r.width * (c.dataset.ratio || 0.32)) * dpr); c.style.height = (r.width * (c.dataset.ratio || 0.32)) + "px"; const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, W: r.width, H: r.width * (c.dataset.ratio || 0.32) }; }
function drawLive() {
  const pts = REC.live; if (!pts.length) return;
  const vf = pts.filter(p => p.f0).map(p => p.f0).sort((a, b) => a - b); const med = vf.length ? vf[vf.length >> 1] : 150;
  drawMimic(pts.map(p => p.f0 ? 12 * Math.log2(p.f0 / med) : null));
}
async function renderHistory() {
  if (!CUR) return;
  const a = (await DB.byItem(CUR.id)).sort((x, y) => y.t - x.t);
  let box = $("#hist"); if (!box) { box = h("div", { id: "hist", class: "stack" }); $("#v-ova").append(box); }
  box.replaceChildren();
  if (!a.length) return;
  box.append(h("h2", null, "Tidigare försök (" + a.length + ")"));
  a.slice(0, 8).forEach(x => box.append(h("div", { class: "item" }, h("span", { class: "small" }, new Date(x.t).toLocaleString("sv", { dateStyle: "short", timeStyle: "short" })), x.audio ? h("button", { class: "chip", onclick: () => new Audio(URL.createObjectURL(x.audio)).play() }, "▶") : null)));
}
$("#itemSel").onchange = e => selectItem(e.target.value);
$("#prevItem").onclick = () => { const P = practiceItems(); const i = P.indexOf(CUR); if (i > 0) selectItem(P[i - 1].id); else if (i < 0 && P[0]) selectItem(P[0].id); };
$("#nextItem").onclick = () => { const P = practiceItems(); const i = P.indexOf(CUR); if (i < P.length - 1) selectItem(P[i + 1].id); };

/* ---------- BIBLIOTEK ---------- */
async function renderLib() {
  const list = $("#libList"); list.replaceChildren(); $("#libCount").textContent = ITEMS.length + " fraser";
  const own = ITEMS.filter(i => !i.audioPath); const shown = own.slice().reverse().slice(0, 200);
  if (ITEMS.length > own.length) list.append(h("div", { class: "note" }, (ITEMS.length - own.length) + " meningar från meningsbanken visas inte här. Hitta dem under Öva."));
  shown.forEach(it => {
    const del = h("button", { class: "chip" }, "Ta bort");
    del.onclick = async () => { if (!del.dataset.arm) { del.dataset.arm = 1; del.textContent = "Säker?"; return; } await DB.del("items", it.id); await loadItems(); if (CUR && CUR.id === it.id) CUR = ITEMS[0] || null; renderItemSel(); renderLib(); };
    list.append(h("div", { class: "item" },
      h("div", { style: "min-width:0;flex:1" }, h("span", { class: "zh" }, it.zh), " ", it.audio ? h("span", { class: "tag" }, "native") : null, h("div", { class: "note mono" }, pyNode(itemSyls(it))), it.sv ? h("div", { class: "note" }, it.sv) : null),
      h("div", { class: "row", style: "flex:none" }, h("button", { class: "chip", onclick: () => { selectItem(it.id); location.hash = "ova"; } }, "Öva"), del)));
  });
}
$("#nAdd").onclick = async () => {
  const zh = $("#nZh").value.trim(), py = $("#nPy").value.trim(); if (!zh || !py) { toast("Fyll i tecken och pinyin"); return; }
  const f = $("#nAudio").files[0];
  const it = { id: uid(), zh, pinyin: py, sv: $("#nSv").value.trim(), audio: f || null, added: Date.now(), source: "manuell" };
  await DB.put("items", it); await loadItems(); ["#nZh", "#nPy", "#nSv"].forEach(s => $(s).value = ""); $("#nAudio").value = "";
  toast("Tillagd"); renderItemSel(); renderLib();
};
async function importText(txt) {
  let o; try { o = JSON.parse(txt); } catch { toast("Kunde inte läsa texten som JSON"); return; }
  const items = o.items || []; let n = 0; const have = new Set(ITEMS.map(i => i.zh));
  for (const x of items) { if (!x || !x.zh || !x.pinyin || have.has(x.zh)) continue; await DB.put("items", { id: uid(), zh: String(x.zh), pinyin: String(x.pinyin), sv: String(x.sv || ""), audio: null, added: Date.now() + n, source: "mandapp" }); have.add(x.zh); n++; }
  await loadItems(); renderItemSel(); renderLib(); toast("Importerade " + n + " fraser");
}
$("#impFile").onchange = async e => { const f = e.target.files[0]; if (f) importText(await f.text()); e.target.value = ""; };
$("#impPasteBtn").onclick = () => { const t = $("#impPaste"); if (t.hidden) { t.hidden = false; t.focus(); $("#impPasteBtn").textContent = "Importera"; } else { importText(t.value); t.value = ""; t.hidden = true; $("#impPasteBtn").textContent = "Klistra in"; } };

/* ---------- HÖRTRÄNING ---------- */
// Native-ljud för hörträningen: ord från audio-cmn (lokalt för tonpar, annars GitHub), stavelser från audio-cmns stavelsesamling. Syntetisk röst bara som reserv.
const hearEl = new Audio();
function playUrls(urls, fallback) { return new Promise(res => { let i = 0; const next = () => { if (i >= urls.length) { speak(fallback, 0.8).then(res); return; } hearEl.src = urls[i++]; hearEl.onended = res; hearEl.onerror = next; hearEl.play().catch(next); }; next(); }); }
function playWord(zh) { return playUrls(["audio/tonpar/" + encodeURIComponent(zh) + ".mp3", ACMN + encodeURIComponent(zh) + ".mp3"], zh); }
function playSyl(py, zh) { return playUrls(["https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k/syllabs/cmn-" + py.toLowerCase().replace("u:", "v") + ".mp3"], zh); }
const TONE_WORDS = [["银行","yin2 hang2"],["中国","zhong1 guo2"],["老师","lao3 shi1"],["电脑","dian4 nao3"],["咖啡","ka1 fei1"],["学生","xue2 sheng1"],["工作","gong1 zuo4"],["朋友","peng2 you5"],["可以","ke3 yi3"],["喜欢","xi3 huan5"],["音乐","yin1 yue4"],["时间","shi2 jian1"],["问题","wen4 ti2"],["医院","yi1 yuan4"],["机场","ji1 chang3"],["火车","huo3 che1"],["面包","mian4 bao1"],["米饭","mi3 fan4"],["方便","fang1 bian4"],["容易","rong2 yi4"],["价格","jia4 ge2"],["历史","li4 shi3"],["经济","jing1 ji4"],["文化","wen2 hua4"],["环境","huan2 jing4"],["比较","bi3 jiao4"],["地铁","di4 tie3"],["手机","shou3 ji1"],["干净","gan1 jing4"],["认真","ren4 zhen1"],["旅游","lv3 you2"],["城市","cheng2 shi4"],["打折","da3 zhe2"],["报纸","bao4 zhi3"],["飞机","fei1 ji1"],["厨房","chu2 fang2"]];
const PAIRS = [
  ["aspiration b/p", [["八", "ba1"], ["趴", "pa1"]]], ["aspiration d/t", [["多", "duo1"], ["拖", "tuo1"]]], ["aspiration g/k", [["哥", "ge1"], ["科", "ke1"]]],
  ["aspiration z/c", [["字", "zi4"], ["次", "ci4"]]], ["aspiration zh/ch", [["知", "zhi1"], ["吃", "chi1"]]], ["aspiration j/q", [["鸡", "ji1"], ["七", "qi1"]]],
  ["s/sh/x", [["四", "si4"], ["是", "shi4"], ["细", "xi4"]]], ["s/sh/x", [["三", "san1"], ["山", "shan1"], ["先", "xian1"]]], ["z/zh/j", [["早", "zao3"], ["找", "zhao3"], ["脚", "jiao3"]]],
  ["-n/-ng", [["心", "xin1"], ["星", "xing1"]]], ["-n/-ng", [["金", "jin1"], ["经", "jing1"]]], ["-n/-ng", [["山", "shan1"], ["伤", "shang1"]]], ["-n/-ng", [["门", "men2"], ["盟", "meng2"]]], ["-n/-ng", [["烟", "yan1"], ["央", "yang1"]]],
  ["u/ü", [["路", "lu4"], ["绿", "lv4"]]], ["u/ü", [["努", "nu3"], ["女", "nv3"]]], ["r/l", [["热", "re4"], ["乐", "le4"]]], ["h/f", [["胡", "hu2"], ["服", "fu2"]]],
  ["toner", [["妈", "ma1"], ["麻", "ma2"], ["马", "ma3"], ["骂", "ma4"]]], ["toner", [["汤", "tang1"], ["糖", "tang2"], ["躺", "tang3"], ["烫", "tang4"]]]
];
let hMode = "tones";
$("#hTones").onclick = () => { hMode = "tones"; $("#hTones").classList.add("on"); $("#hPairs").classList.remove("on"); nextListen(); };
$("#hPairs").onclick = () => { hMode = "pairs"; $("#hPairs").classList.add("on"); $("#hTones").classList.remove("on"); nextListen(); };
async function getListenStats() { return (await DB.get("kv", "listen")) || { tones: {}, conf: {}, pairs: {} }; }
async function bumpListen(fn) { const s = await getListenStats(); fn(s); await DB.put("kv", s, "listen"); }
function nextListen() {
  const area = $("#hArea"); area.replaceChildren();
  $("#hNote").textContent = "Native-inspelningar från audio-cmn (CC BY-SA).";
  if (hMode === "tones") {
    const lib = ITEMS.filter(i => MA.parsePinyin(i.pinyin).length === 2).map(i => [i.zh, i.pinyin]);
    const pool = TONE_WORDS.concat(lib); const [zh, py] = pool[Math.floor(Math.random() * pool.length)];
    const syls = MA.parsePinyin(py); const ans = syls.map(s => s.tone); const pick = syls.map(() => 0);
    const play = h("button", { class: "btn primary block", onclick: () => playWord(zh) }, "▶ Lyssna");
    area.append(play);
    const rows = syls.map((s, i) => { const r = h("div", { class: "toneopts" }); [1, 2, 3, 4, 5].forEach(t => r.append(h("button", { onclick: ev => { pick[i] = t; [...r.children].forEach(b => b.classList.toggle("sel", b === ev.target)); } }, t === 5 ? "0" : t))); return r; });
    rows.forEach((r, i) => area.append(h("label", { class: "lbl" }, "Stavelse " + (i + 1)), r));
    const check = h("button", { class: "btn block" }, "Rätta");
    check.onclick = async () => {
      if (pick.some(p => !p)) { toast("Välj en ton för varje stavelse"); return; }
      rows.forEach((r, i) => [...r.children].forEach((b, k) => { const t = k + 1; b.classList.remove("sel"); if (t === ans[i]) b.classList.add("right"); else if (t === pick[i]) b.classList.add("wrong"); }));
      const ok = pick.every((p, i) => p === ans[i]);
      await bumpListen(s => { ans.forEach((a, i) => { s.tones[a] = s.tones[a] || { n: 0, ok: 0 }; s.tones[a].n++; if (pick[i] === a) s.tones[a].ok++; else { const k = a + "→" + pick[i]; s.conf[k] = (s.conf[k] || 0) + 1; } }); });
      area.append(h("div", { class: "card" }, h("div", { class: ok ? "ok" : "bad" }, ok ? "Rätt!" : "Inte riktigt."), h("div", null, h("span", { class: "zh", style: "font-size:1.4rem" }, zh), " ", pyNode(syls)), MA.sandhi(syls, zh).notes.map(n => h("div", { class: "note" }, n))));
      check.replaceWith(h("button", { class: "btn primary block", onclick: nextListen }, "Nästa"));
    };
    area.append(check);
    setTimeout(() => playWord(zh), 200);
  } else {
    const [cat, opts] = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const target = opts[Math.floor(Math.random() * opts.length)];
    area.append(h("div", { class: "note" }, "Kontrast: " + cat), h("button", { class: "btn primary block", onclick: () => playSyl(target[1], target[0]) }, "▶ Lyssna"));
    const grid = h("div", { class: "pairs" }); let done = false;
    opts.forEach(o => { const s = MA.parsePinyin(o[1])[0]; grid.append(h("button", { onclick: async ev => {
      if (done) return; done = true; const ok = o === target;
      [...grid.children].forEach((b, k) => { if (opts[k] === target) b.classList.add("right"); else if (b === ev.currentTarget) b.classList.add("wrong"); });
      await bumpListen(st => { st.pairs[cat] = st.pairs[cat] || { n: 0, ok: 0 }; st.pairs[cat].n++; if (ok) st.pairs[cat].ok++; });
      area.append(h("div", { class: ok ? "ok" : "bad" }, ok ? "Rätt!" : "Det var " + target[0] + " " + MA.marked(MA.parsePinyin(target[1])[0].syl, MA.parsePinyin(target[1])[0].tone) + "."), h("div", { class: "row" }, opts.map(x => h("button", { class: "chip", onclick: () => playSyl(x[1], x[0]) }, "▶ " + x[0]))), h("button", { class: "btn primary block", onclick: nextListen }, "Nästa"));
    } }, MA.marked(s.syl, s.tone)));
    });
    area.append(grid);
    setTimeout(() => playSyl(target[1], target[0]), 200);
  }
}

/* ---------- STATISTIK ---------- */
async function computeStats() {
  const atts = (await DB.all("attempts")).sort((a, b) => a.t - b.t);
  return { atts, listen: await getListenStats() };
}
const pctS = o => o && o.n ? Math.round(o.ok / o.n * 100) + " %" : "–";
async function renderStats() {
  const area = $("#statArea"); area.replaceChildren(h("div", { class: "note" }, "Räknar…"));
  const S = await computeStats(); const a = S.atts; area.replaceChildren();
  area.append(h("div", { class: "tiles" }, h("div", { class: "tile" }, h("b", null, a.length), "inspelningar")));
  area.append(h("div", { class: "note" }, "Uttalet bedöms inte automatiskt. Jämför din tonkurva med native och betygsätt själv."));
  area.append(h("h2", null, "Hörträning"));
  const L = S.listen;
  area.append(h("table", null, h("tbody", null, [1, 2, 3, 4, 5].map(t => h("tr", null, h("td", { class: "t" + t }, t === 5 ? "neutral ton" : MA.TONE_NAME[t] + " ton"), h("td", { class: "mono" }, pctS(L.tones[t])), h("td", { class: "note" }, L.tones[t] ? L.tones[t].n + " st" : ""))), Object.entries(L.pairs).map(([k, v]) => h("tr", null, h("td", null, k), h("td", { class: "mono" }, pctS(v)), h("td", { class: "note" }, v.n + " st"))))));
  const PS = await pairStats(); const tpk = Object.keys(PS.listen);
  if (tpk.length) {
    area.append(h("h2", null, "Tonpar"));
    const rows = [...new Set(tpk)].sort().map(k => h("tr", null, h("td", { class: "mono" }, pairLabel(k)), h("td", { class: "mono" }, "hör " + pctS(PS.listen[k]))));
    area.append(h("table", null, h("tbody", null, rows)));
    const tc = Object.entries(L.tpConf || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (tc.length) area.append(h("div", { class: "note" }, "Vanligaste förväxlingar av tonpar: " + tc.map(([k, n]) => k + " (" + n + ")").join(", ")));
  }
  area.append(h("h2", null, "Visa under Utveckling"));
  area.append(h("div", { class: "note" }, "Uppdatera uttalsdelen under Ord → Utveckling med de senaste siffrorna."));
  area.append(h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => exportStats(S, "app") }, "Uppdatera Utveckling"), h("button", { class: "btn", onclick: () => exportStats(S, false) }, "Spara fil"), h("button", { class: "btn", onclick: () => exportStats(S, true) }, "Kopiera")));
}
async function exportStats(S, copy) {
  const data = JSON.stringify({ app: "mandapp-studio-stats", version: 1, exported: new Date().toISOString(), listen: S.listen, pairs: await pairStats(),
    attempts: S.atts.slice(-300).map(a => ({ t: a.t, zh: a.zh })) });
  if (copy === "app") { try { await importPron(JSON.parse(data)); location.hash = "statistik"; } catch (e) { console.warn(e); toast("Kunde inte skicka"); } return; }
  if (copy) { try { await navigator.clipboard.writeText(data); toast("Kopierat"); } catch { toast("Kunde inte kopiera"); } return; }
  const file = new File([data], "skuggning-statistik.json", { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Skuggning statistik" }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const a = h("a", { href: URL.createObjectURL(file), download: file.name }); document.body.append(a); a.click(); a.remove();
}

/* ---------- riktiga inspelningar (audio-cmn) ---------- */
const ACMN = "https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k/hsk/cmn-";
let HSKIDX = null, TP = null;
async function hskIndex() { if (HSKIDX) return HSKIDX; try { HSKIDX = new Set(await (await fetch("audio/hsk-index.json")).json()); } catch { HSKIDX = new Set(); } return HSKIDX; }
async function tonparData() { if (TP) return TP; TP = await (await fetch("audio/tonpar.json")).json(); return TP; }
const triedNative = new Set();
async function fetchNative(zh) {
  const clean = zh.replace(/[，。！？、,.!? ]/g, "");
  const local = "audio/tonpar/" + encodeURIComponent(clean) + ".mp3";
  for (const url of [local, ACMN + encodeURIComponent(clean) + ".mp3"]) {
    if (url !== local && !(await hskIndex()).has(clean)) continue;
    try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); if (b.size > 1000) return b; } } catch { }
  }
  return null;
}
async function tryNativeAudio(it) {
  if (!it || it.audio || triedNative.has(it.id)) return; triedNative.add(it.id);
  const b = await fetchNative(it.zh); if (!b) return;
  it.audio = b; it.audioSrc = "audio-cmn"; await DB.put("items", it);
  if (CUR && CUR.id === it.id) { toast("Hämtade riktig inspelning"); renderItemSel(); renderItem(); }
}
async function ensureItem(w, src) {
  let it = ITEMS.find(i => i.zh === w.zh);
  if (!it) { it = { id: uid(), zh: w.zh, pinyin: w.pinyin, sv: w.en || "", audio: null, added: Date.now(), source: src || "tonpar" }; }
  if (!it.audio) { const b = await fetchNative(w.zh); if (b) { it.audio = b; it.audioSrc = "audio-cmn"; } }
  await DB.put("items", it); await loadItems(); return ITEMS.find(i => i.id === it.id);
}
const pairKey = py => { const s = MA.parsePinyin(py); return s.length === 2 ? "" + s[0].tone + s[1].tone : null; };
const pairLabel = k => k[0] + "+" + (k[1] === "5" ? "0" : k[1]);
async function pairStats() {
  // Bara hörträning: talade tonpar bedöms inte automatiskt (analysen var inte pålitlig).
  const L = await getListenStats(); return { listen: L.tp || {} };
}
let tpSel = null;
async function renderTonpar() {
  const tp = await tonparData(); const st = await pairStats(); const g = $("#tpGrid"); g.replaceChildren(h("div"));
  [1, 2, 3, 4, 5].forEach(t => g.append(h("div", { class: "hd t" + t }, t === 5 ? "+0" : "+" + t)));
  for (const a of [1, 2, 3, 4]) {
    g.append(h("div", { class: "hd t" + a }, a + "+"));
    for (const b of [1, 2, 3, 4, 5]) {
      const k = "" + a + b; const li = st.listen[k];
      const n = li ? li.n : 0, ok = li ? li.ok : 0; const pc = n ? ok / n : null;
      const bg = pc == null ? "" : pc >= 0.8 ? "background:var(--good-soft)" : pc >= 0.5 ? "background:var(--warn-soft)" : "background:var(--bad-soft)";
      g.append(h("button", { class: tpSel === k ? "sel" : "", style: bg, "aria-label": "Tonpar " + pairLabel(k), onclick: () => { tpSel = k; renderTonpar(); showPair(k); } }, h("b", null, pairLabel(k)), h("small", null, pc == null ? (tp[k] || []).length + " ord" : Math.round(pc * 100) + " %")));
    }
  }
  if (tpSel && !$("#tpArea").childNodes.length) showPair(tpSel);
}
async function showPair(k) {
  const tp = await tonparData(); const words = tp[k] || []; const area = $("#tpArea"); area.replaceChildren();
  area.append(h("h2", null, "Tonpar " + pairLabel(k) + (k === "33" ? " (uttalas 2+3)" : "")));
  area.append(h("div", { class: "row" },
    h("button", { class: "btn primary", onclick: () => pairQuiz([k]) }, "Hörtest för paret"),
    h("button", { class: "btn", onclick: async ev => { ev.target.disabled = true; let first = null; for (const w of words) { const it = await ensureItem(w, "tonpar " + pairLabel(k)); first = first || it; } toast(words.length + " ord i biblioteket"); ev.target.disabled = false; if (first) { await selectItem(first.id); location.hash = "ova"; } } }, "Skugga alla")));
  for (const w of words) {
    const s = MA.parsePinyin(w.pinyin);
    area.append(h("div", { class: "item" },
      h("div", { style: "min-width:0;flex:1" }, h("span", { class: "zh" }, w.zh), " ", h("span", { class: "mono small" }, pyNode(s)), w.hsk ? h("span", { class: "tag" }, "HSK " + w.hsk) : null, h("div", { class: "note" }, w.en)),
      h("div", { class: "row", style: "flex:none" },
        h("button", { class: "chip", "aria-label": "Lyssna", onclick: () => playTp(w.zh) }, "▶"),
        h("button", { class: "chip", onclick: async () => { const it = await ensureItem(w, "tonpar " + pairLabel(k)); await selectItem(it.id); location.hash = "ova"; } }, "Skugga"))));
  }
}
const tpAudio = new Audio();
function playTp(zh) { return new Promise(res => { tpAudio.src = "audio/tonpar/" + encodeURIComponent(zh) + ".mp3"; tpAudio.onended = res; tpAudio.onerror = () => { speak(zh).then(res); }; tpAudio.play().catch(() => speak(zh).then(res)); }); }
async function pairQuiz(keys) {
  const tp = await tonparData(); const area = $("#tpArea"); area.replaceChildren();
  const pool = keys.flatMap(k => (tp[k] || []).map(w => [k, w])); if (!pool.length) return;
  let done = 0, right = 0;
  const next = () => {
    area.replaceChildren();
    const [k, w] = pool[Math.floor(Math.random() * pool.length)];
    const pick = [0, 0];
    area.append(h("div", { class: "row", style: "justify-content:space-between" }, h("b", null, keys.length > 1 ? "Blandade tonpar" : "Tonpar " + pairLabel(keys[0])), h("span", { class: "note mono" }, done ? right + "/" + done + " rätt" : "")));
    area.append(h("button", { class: "btn primary block", onclick: () => playTp(w.zh) }, "▶ Lyssna igen"));
    const rows = [0, 1].map(i => { const r = h("div", { class: "toneopts" }); [1, 2, 3, 4, 5].forEach(t => { if (i === 0 && t === 5) { r.append(h("span")); return; } r.append(h("button", { onclick: ev => { pick[i] = t; [...r.children].forEach(b => b.classList && b.classList.toggle("sel", b === ev.target)); } }, t === 5 ? "0" : t)); }); return r; });
    area.append(h("label", { class: "lbl" }, "Första stavelsen"), rows[0], h("label", { class: "lbl" }, "Andra stavelsen"), rows[1]);
    const chk = h("button", { class: "btn block" }, "Rätta");
    chk.onclick = async () => {
      if (!pick[0] || !pick[1]) { toast("Välj båda tonerna"); return; }
      const ans = [+k[0], +k[1]]; const ok = pick[0] === ans[0] && pick[1] === ans[1]; done++; if (ok) right++;
      rows.forEach((r, i) => [...r.children].forEach((b, idx) => { if (!b.classList) return; const t = idx + 1; b.classList.remove("sel"); if (t === ans[i]) b.classList.add("right"); else if (t === pick[i]) b.classList.add("wrong"); }));
      await bumpListen(s => { s.tp = s.tp || {}; const o = s.tp[k] = s.tp[k] || { n: 0, ok: 0 }; o.n++; if (ok) o.ok++; if (!ok) { s.tpConf = s.tpConf || {}; const c = pairLabel(k) + "→" + pick[0] + "+" + (pick[1] === 5 ? 0 : pick[1]); s.tpConf[c] = (s.tpConf[c] || 0) + 1; } });
      area.append(h("div", { class: "card" }, h("div", { class: ok ? "ok" : "bad" }, ok ? "Rätt!" : "Det var " + pairLabel(k) + "."), h("div", null, h("span", { class: "zh", style: "font-size:1.4rem" }, w.zh), " ", pyNode(MA.parsePinyin(w.pinyin)), " ", h("span", { class: "note" }, w.en)), k === "33" ? h("div", { class: "note" }, "Två tredje toner: den första uttalas som andra ton.") : null));
      chk.replaceWith(h("div", { class: "row" }, h("button", { class: "btn primary", onclick: next }, "Nästa"), h("button", { class: "btn", onclick: () => { area.replaceChildren(); renderTonpar(); } }, "Avsluta")));
    };
    area.append(chk);
    setTimeout(() => playTp(w.zh), 150);
  };
  next();
}
$("#tpMix").onclick = async () => { const tp = await tonparData(); pairQuiz(Object.keys(tp)); };

/* ---------- Tatoeba ---------- */
let TQ = null;
async function tatoebaPack() { if (TQ) return TQ; try { const r = await fetch("audio/tatoeba.json"); TQ = r.ok ? await r.json() : []; } catch { TQ = []; } return TQ; }
function tqRow(x, local) {
  const play = () => { tpAudio.src = local ? "audio/tatoeba/" + x.audio : x.audioUrl; tpAudio.play().catch(() => toast("Kunde inte spela upp")); };
  return h("div", { class: "item" },
    h("div", { style: "min-width:0;flex:1" }, h("div", { class: "zh" }, x.zh), h("div", { class: "note mono" }, pyNode(MA.parsePinyin(x.pinyin))), x.sv || x.en ? h("div", { class: "note" }, x.sv || x.en) : null,
      h("div", { class: "note", style: "font-size:.7rem" }, "Ljud: ", h("a", { href: x.attribution, target: "_blank", rel: "noopener" }, x.author || "Tatoeba"), " · " + (x.licence || ""))),
    h("div", { class: "row", style: "flex:none" }, h("button", { class: "chip", "aria-label": "Lyssna", onclick: play }, "▶"),
      h("button", { class: "chip", onclick: async () => { const it = await tqItem(x, local); if (it) { await selectItem(it.id); location.hash = "ova"; } } }, "Skugga")));
}
async function tqItem(x, local) {
  let it = ITEMS.find(i => i.zh === x.zh);
  if (!it) it = { id: uid(), zh: x.zh, pinyin: x.pinyin, sv: x.sv || x.en || "", audio: null, added: Date.now(), source: "tatoeba", credit: (x.author || "") + " " + (x.licence || "") + " " + (x.attribution || "") };
  if (!it.audio) { try { const r = await fetch(local ? "audio/tatoeba/" + x.audio : x.audioUrl); if (r.ok) it.audio = await r.blob(); } catch { } if (!it.audio) toast("Ljudet kunde inte hämtas, frasen sparas utan native-ljud"); }
  await DB.put("items", it); await loadItems(); return ITEMS.find(i => i.id === it.id);
}
function parseTatoebaPinyin(s, n) { for (const t of s.transcriptions || []) { let txt = (t.text || "").toLowerCase().replace(/u:/g, "v").replace(/\[[^|\]]*\|([^\]]*)\]/g, "$1"); const m = txt.match(/[a-zü:v]+[1-5]/g) || []; if (m.length === n) return m.join(" "); } return null; }
async function tqSearch() {
  const q = $("#tqQ").value.trim(); const list = $("#tqList"); const note = $("#tqNote"); list.replaceChildren();
  const pack = await tatoebaPack();
  const hits = q ? pack.filter(x => x.zh.includes(q)) : pack.slice().sort(() => Math.random() - 0.5);
  note.textContent = pack.length ? (q ? hits.length + " av " + pack.length + " sparade meningar innehåller «" + q + "»." : pack.length + " sparade meningar. Visar 20 slumpvis.") : "Inga sparade meningar än.";
  hits.slice(0, 20).forEach(x => list.append(tqRow(x, true)));
  if (q && hits.length < 5) {
    const more = h("button", { class: "btn", onclick: async () => { more.disabled = true; more.textContent = "Söker…"; await tqLive(q, list); more.remove(); } }, "Sök fler direkt på Tatoeba");
    list.append(more);
  }
}
async function tqLive(q, list) {
  const url = "https://api.tatoeba.org/v1/sentences?" + new URLSearchParams({ lang: "cmn", q, has_audio: "yes", sort: "relevance", limit: "20", include: "audios,transcriptions", showtrans: "all" });
  try {
    const r = await fetch(url); const j = await r.json(); let n = 0;
    for (const s of j.data || []) {
      const chars = [...(s.text || "")].filter(c => /[\u3400-\u9fff]/.test(c)); const py = parseTatoebaPinyin(s, chars.length);
      const a = (s.audios || []).find(a => (a.license || a.licence || "").trim()); if (!py || !a) continue;
      if (s.script === "Hant") { const alt = (s.transcriptions || []).find(t => t.type === "altscript" && t.script === "Hans"); if (alt && alt.text) s.text = alt.text; }
      const tr = {}; (s.translations || []).forEach(t => { if ((t.lang === "eng" || t.lang === "swe") && !tr[t.lang]) tr[t.lang] = t.text; });
      list.append(tqRow({ zh: s.text, pinyin: py, en: tr.eng || "", sv: tr.swe || "", author: a.author, licence: a.license || a.licence, attribution: a.attribution_url, audioUrl: a.download_url || "https://api.tatoeba.org/v1/audios/" + a.id + "/file" }, false)); n++;
    }
    if (!n) list.append(h("div", { class: "note" }, "Inga fler meningar med fritt ljud hittades."));
  } catch (e) { list.append(h("div", { class: "note" }, "Kunde inte nå Tatoeba direkt från webbläsaren. De sparade meningarna fungerar ändå.")); }
}
$("#tqBtn").onclick = tqSearch; $("#tqQ").addEventListener("keydown", e => { if (e.key === "Enter") tqSearch(); });
const isSentence = it => [...it.zh].filter(c => /[\u3400-\u9fff]/.test(c)).length > 4 || /[，。！？、,.!?]/.test(it.zh);
function sentencesWith(q) { return practiceItems().filter(i => i.zh.includes(q) && i.zh !== q && isSentence(i)); }
function sentRow(it) { return h("button", { class: "item", style: "text-align:left;width:100%", onclick: () => { selectItem(it.id); $("#sentHits").replaceChildren(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, h("div", { style: "min-width:0;flex:1" }, h("div", { class: "zh" }, it.zh), h("div", { class: "note mono" }, pyNode(MA.parsePinyin(it.pinyin))), it.sv ? h("div", { class: "note" }, it.sv) : null), h("span", { class: "chip" }, "Öva")); }
function showSentHits(q) {
  const box = $("#sentHits"); box.replaceChildren(); if (!q) return;
  const hits = sentencesWith(q);
  box.append(h("div", { class: "row", style: "justify-content:space-between" }, h("b", null, hits.length ? hits.length + " meningar med " + q : "Inga meningar med native-ljud innehåller " + q), h("button", { class: "chip", onclick: () => { box.replaceChildren(); $("#sentQ").value = ""; } }, "Stäng")));
  hits.slice(0, 30).forEach(it => box.append(sentRow(it)));
}
$("#sentQ").addEventListener("input", () => { clearTimeout(window._sq); window._sq = setTimeout(() => showSentHits($("#sentQ").value.trim()), 250); });
$("#voiceBtn").onclick = openVoiceSheet;
function setSpeed(r) { if (!["1", "0.75", "0.5"].includes(String(r))) r = "1"; $("#speed").value = String(r); audioEl.playbackRate = +r; try { localStorage.setItem("studio-speed", r); } catch { } document.querySelectorAll("#speedChips .chip").forEach(b => b.classList.toggle("on", b.dataset.r === String(r))); }
document.querySelectorAll("#speedChips .chip").forEach(b => b.onclick = () => setSpeed(b.dataset.r));
{ let r = "1"; try { r = localStorage.getItem("studio-speed") || "1"; } catch { } setSpeed(r); };
$("#randSent").onclick = () => { const S = practiceItems().filter(isSentence); if (S.length) selectItem(S[Math.floor(Math.random() * S.length)].id); };
async function renderRelated() {
  const box = $("#related"); box.replaceChildren(); if (!CUR || isSentence(CUR)) return;
  const hits = sentencesWith(CUR.zh).slice(0, 6); if (!hits.length) return;
  box.append(h("details", { class: "card" }, h("summary", null, hits.length + " meningar med " + CUR.zh + " (native)"), h("div", { class: "stack", style: "margin-top:8px" }, hits.map(sentRow))));
}

/* ---------- dagens pass och meningsrepetition ---------- */
// Betyget Svår/OK/Lätt schemaläggs med samma FSRS som ordkorten (F, R, newCardData m.fl. kommer från huvudappen).
let SRS = {}; let SK_READY = false;
const PASS = { on: false, kind: "day", ids: [], done: [], title: "", requeued: {} };
const curView = () => location.hash.slice(1).split("?")[0] || "skugga";
const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return +d; };
function passSize() { let n = 12; try { n = +localStorage.getItem("pass-size") || 12; } catch { } return [8, 12, 20].includes(n) ? n : 12; }
const sentencePool = () => practiceItems().filter(isSentence);
function learningWords() {
  if (typeof STATE === "undefined") return [];
  return [...STATE.words.values()].filter(w => !w.suspended && w.card && (w.card.state === 1 || w.card.state === 3 || (w.card.state === 2 && (w.card.stability || 0) < 21))).map(w => w.hanzi).filter(Boolean);
}
function latestTopic() { try { return (STATE.profile.todayHistory || [])[0] || null; } catch { return null; } }
function buildDayPass() {
  const size = passSize(); const pool = sentencePool(); const used = new Set(); const pick = (arr, n) => { const out = []; for (const it of arr) { if (out.length >= n) break; if (used.has(it.id)) continue; used.add(it.id); out.push(it.id); } return out; };
  const shuffled = a => a.map(x => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const end = endOfToday();
  const hard = pick(pool.filter(i => SRS[i.id] && SRS[i.id].due <= end).sort((a, b) => SRS[a.id].due - SRS[b.id].due), Math.ceil(size * 0.45));
  const lw = learningWords();
  const words = pick(shuffled(pool.filter(i => lw.some(w => i.zh.includes(w)))), Math.round(size * 0.3));
  const t = latestTopic(); const tw = t && t.words ? t.words : [];
  const topic = pick(shuffled(pool.filter(i => tw.some(w => i.zh.includes(w)))), Math.max(0, Math.min(3, size - hard.length - words.length)));
  const fresh = pick(shuffled(pool.filter(i => !SRS[i.id])), size - hard.length - words.length - topic.length);
  const rest = pick(shuffled(pool), size - hard.length - words.length - topic.length - fresh.length);
  const ids = shuffled([...words, ...topic, ...fresh, ...rest]); ids.unshift(...hard);
  return { date: todayKey(), size, ids, done: [], meta: { hard: hard.length, words: words.length, topic: topic.length, fresh: fresh.length + rest.length } };
}
let DAYPASS = null;
async function getDayPass(rebuild) {
  if (!DAYPASS) DAYPASS = await DB.get("kv", "daypass");
  const vk = VOICE + "|" + GEN + "|" + ACC;
  if (rebuild || !DAYPASS || DAYPASS.date !== todayKey() || DAYPASS.size !== passSize() || !DAYPASS.ids.length || (DAYPASS.vk !== vk && !DAYPASS.done.length)) { DAYPASS = buildDayPass(); DAYPASS.vk = vk; await DB.put("kv", DAYPASS, "daypass"); }
  return DAYPASS;
}
async function startDayPass(again) {
  const P = await getDayPass(again);
  if (!P.ids.length) { toast("Inga meningar med native-ljud passar röstfiltret"); return; }
  Object.assign(PASS, { on: true, kind: "day", ids: P.ids, done: P.done, title: "Dagens pass", requeued: {} });
  const next = P.ids.find(id => !P.done.includes(id)) || P.ids[0];
  location.hash = "ova"; await selectItem(next); renderDots();
}
function countWith(word) { if (!word) return 0; return sentencePool().filter(i => i.zh.includes(word) && i.zh !== word).length; }
async function startTopic(words, title) {
  await READY;
  const pool = sentencePool(); const scored = pool.map(i => [words.filter(w => w && i.zh.includes(w)).length, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
  const ids = scored.slice(0, 15).map(x => x[1].id);
  if (!ids.length) { toast("Inga native-meningar innehåller de här orden än"); return; }
  Object.assign(PASS, { on: true, kind: "topic", ids, done: [], title: title || "Ämne", requeued: {} });
  location.hash = "ova"; await selectItem(ids[0]); renderDots();
}
function renderDots() {
  const box = $("#passDots"); if (!box) return; box.replaceChildren();
  if (!PASS.on) { box.append(h("span", { class: "note" }, "Fri övning")); return; }
  const n = PASS.ids.length;
  if (n > 24) { box.append(h("span", { class: "note" }, PASS.title + " · " + PASS.done.length + " av " + n)); return; }
  PASS.ids.forEach(id => box.append(h("i", { class: PASS.done.includes(id) ? "d" : CUR && CUR.id === id ? "n" : "" })));
  box.setAttribute("aria-label", PASS.title + ": " + PASS.done.length + " av " + n + " klara");
}
async function rate(g) {
  if (!CUR) return;
  if (CONT.on) contStop(); if (REC.on) stopRec();
  const t = new Date(); const prev = SRS[CUR.id] ? dataToCard(SRS[CUR.id]) : dataToCard(newCardData());
  const rating = g === 1 ? R.Again : g === 4 ? R.Easy : R.Good;
  SRS[CUR.id] = cardToData(F.next(prev, t, rating).card); SRS[CUR.id].g = g;
  DB.put("kv", SRS, "srs").catch(() => { });
  try { Store.appendLog({ k: "shadow", h: CUR.zh, r: g, t: +t }); } catch { }
  if (PASS.on) {
    if (!PASS.done.includes(CUR.id)) PASS.done.push(CUR.id);
    if (g === 1 && !PASS.requeued[CUR.id] && PASS.kind !== "day") { PASS.requeued[CUR.id] = 1; PASS.done.splice(PASS.done.indexOf(CUR.id), 1); PASS.ids.push(CUR.id); }
    if (PASS.kind === "day" && DAYPASS) { DAYPASS.done = PASS.done; DB.put("kv", DAYPASS, "daypass").catch(() => { }); }
    const i = PASS.ids.indexOf(CUR.id); const next = PASS.ids.slice(i + 1).concat(PASS.ids.slice(0, i)).find(id => !PASS.done.includes(id));
    if (next) { await selectItem(next); renderDots(); return; }
    PASS.on = false; toast(PASS.kind === "day" ? "Dagens pass är klart" : "Klart: " + PASS.title); location.hash = "skugga"; return;
  }
  $("#nextItem").click();
}
document.querySelectorAll("#rateRow button").forEach(b => b.onclick = () => rate(+b.dataset.g));
async function renderHome() {
  const card = $("#passCard"), lists = $("#homeLists"); if (!card) return;
  if (!SK_READY || !ITEMS.length) { card.replaceChildren(h("div", { class: "pass" }, h("span", { class: "lbl" }, "Dagens pass"), h("h3", null, "Laddar meningar…"))); return; }
  const P = await getDayPass(); const n = P.ids.length, d = P.done.filter(id => P.ids.includes(id)).length; const m = P.meta || {};
  const sizeSel = h("select", { "aria-label": "Antal meningar i passet", onchange: async e => { try { localStorage.setItem("pass-size", e.target.value); } catch { } await getDayPass(true); renderHome(); } }, [8, 12, 20].map(v => h("option", { value: v }, v + " meningar")));
  sizeSel.value = String(passSize());
  const goTxt = !d ? "Börja" : d >= n ? "Kör ett nytt pass" : "Fortsätt (" + d + " av " + n + ")";
  card.replaceChildren(h("div", { class: "pass" },
    h("span", { class: "lbl" }, "Dagens pass"),
    h("h3", null, n + " meningar · ca " + Math.max(1, Math.round(n * 0.67)) + " min"),
    h("div", { class: "meta" }, m.hard ? h("span", null, m.hard + " att repetera") : null, m.words ? h("span", null, m.words + " med dina ord") : null, m.topic ? h("span", null, m.topic + " från ditt senaste ämne") : null, m.fresh ? h("span", null, m.fresh + " nya") : null),
    h("div", { class: "pbar" }, h("i", { style: "width:" + (n ? Math.round(d / n * 100) : 0) + "%" })),
    h("button", { class: "go", type: "button", onclick: () => startDayPass(d >= n) }, goTxt),
    h("div", { class: "alt" }, h("button", { class: "vpill", type: "button", onclick: openVoiceSheet, style: "background:transparent;color:inherit;border-color:rgba(255,255,255,.4)" }, h("span", { class: "dot" }), h("span", { class: "voiceLbl" }, voiceLabel()), " ▾"), sizeSel)));
  lists.replaceChildren();
  let hist = []; try { hist = (STATE.profile.todayHistory || []).slice(0, 3); } catch { }
  const topics = hist.map(x => [x, (x.words || []).reduce((a, w) => a + countWith(w), 0)]).filter(x => x[1] > 0);
  if (topics.length) lists.append(h("div", { class: "hlist" }, h("span", { class: "lbl" }, "Från dina ämnen"),
    topics.map(([x]) => { const ids = new Set(sentencePool().filter(i => (x.words || []).some(w => i.zh.includes(w))).map(i => i.id)); return h("button", { class: "hrow", type: "button", onclick: () => startTopic(x.words || [], x.text) }, h("span", { style: "min-width:0" }, h("span", { style: "display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, x.text), h("small", null, x.date)), h("span", { class: "cnt" }, ids.size + " meningar")); })));
  const lw = [...new Set(learningWords())].map(w => [w, countWith(w)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (lw.length) lists.append(h("div", { class: "hlist" }, h("span", { class: "lbl" }, "Ord du lär dig"),
    lw.map(([w, c]) => { const e = typeof bestEntry === "function" ? bestEntry(w) : null; return h("a", { class: "hrow", href: "#ova?q=" + encodeURIComponent(w) }, h("span", null, h("span", { class: "zh" }, w), " ", h("small", null, e ? pinyinText(e.p) : "")), h("span", { class: "cnt" }, c + (c === 1 ? " mening" : " meningar"))); })));
}
window.SK_onVoice = () => { if (curView() === "skugga") renderHome(); };
function topicCount(words) { const ws = (words || []).filter(Boolean); return sentencePool().filter(i => ws.some(w => i.zh.includes(w) && i.zh !== w)).length; }
async function syncPron() {
  const S = await computeStats(); if (!S.atts.length) return;
  const o = { listen: S.listen, attempts: S.atts.slice(-300).map(a => ({ t: a.t, zh: a.zh })) };
  await importPron(o, true);
}
window.SK = { show, countWith, topicCount, startTopic, syncPron, importText: t => importText(t), ready: () => SK_READY };
$("#fromBank").onclick = () => exportToStudio();

/* ---------- LYSSNA FÖRST, LÄS SEN ---------- */
// Hörförståelse på längre native-meningar. Texten är dold medan man lyssnar. Man väljer hur mycket man uppfattade,
// sedan visas tecken, pinyin och översättning. Betyget schemaläggs med FSRS i ett eget schema (kv "lsrs"), skilt från skuggningen.
const lsEl = new Audio(); lsEl.preload = "auto"; let lsUrl = null;
const LS_GRADES = [[1, "Inget", "nästan inget"], [2, "Delar", "några ord"], [3, "Det mesta", "huvudpoängen"], [4, "Allt", "varje ord"]];
const LS_LEN = { mid: [8, 11, "8–11 tecken"], long: [12, 99, "12+ tecken"], mix: [8, 99, "Blandat"] };
const LS = { srs: null, ids: [], i: 0, grades: {}, revealed: false, pick: 0, plays: 0, len: "long", speed: "1", started: false };
try { LS.len = localStorage.getItem("ls-len") || "long"; if (!LS_LEN[LS.len]) LS.len = "long"; LS.speed = localStorage.getItem("ls-speed") || "1"; } catch { }
const hanCount = s => [...s].filter(c => /[㐀-鿿]/.test(c)).length;
const LS_SIZE = 10;
async function lsSrs() { if (!LS.srs) LS.srs = (await DB.get("kv", "lsrs")) || {}; return LS.srs; }
function lsPool() { const [a, b] = LS_LEN[LS.len]; return practiceItems().filter(i => { const n = hanCount(i.zh); return n >= a && n <= b; }); }
async function lsBuild() {
  const S = await lsSrs(); const end = endOfToday(); const all = practiceItems(); const pool = lsPool();
  const shuffled = a => a.map(x => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const due = all.filter(i => S[i.id] && S[i.id].due <= end).sort((a, b) => S[a.id].due - S[b.id].due).slice(0, Math.ceil(LS_SIZE / 2)).map(i => i.id);
  const fresh = shuffled(pool.filter(i => !S[i.id] && !due.includes(i.id))).slice(0, LS_SIZE - due.length).map(i => i.id);
  const rest = shuffled(pool.filter(i => !due.includes(i.id) && !fresh.includes(i.id))).slice(0, LS_SIZE - due.length - fresh.length).map(i => i.id);
  return due.concat(shuffled(fresh.concat(rest)));
}
function lsSetSpeed(r) { if (!["1", "0.75", "0.5"].includes(String(r))) r = "1"; LS.speed = String(r); lsEl.playbackRate = +r; try { localStorage.setItem("ls-speed", r); } catch { } document.querySelectorAll("#lsSpeed .chip").forEach(b => b.classList.toggle("on", b.dataset.r === LS.speed)); }
const lsCur = () => ITEMS.find(i => i.id === LS.ids[LS.i]) || null;
async function lsPlay() {
  const it = lsCur(); if (!it) return;
  if (!lsEl.paused) { lsEl.pause(); lsEl.currentTime = 0; lsPlayUi(false); return; }
  if (!it.audio && it.audioPath) await ensureAudio(it);
  if (!it.audio) { toast("Ljudet kunde inte hämtas"); return; }
  if (lsEl.dataset.id !== it.id) { if (lsUrl) URL.revokeObjectURL(lsUrl); lsUrl = URL.createObjectURL(it.audio); lsEl.src = lsUrl; lsEl.dataset.id = it.id; }
  lsEl.playbackRate = +LS.speed; lsEl.currentTime = 0;
  try { await lsEl.play(); LS.plays++; lsPlayUi(true); const c = $("#lsPlays"); if (c) c.textContent = "Spelad " + LS.plays + (LS.plays === 1 ? " gång" : " gånger"); } catch { }
}
function lsPlayUi(on) { const b = $("#lsPlayBtn"); if (b) { b.classList.toggle("on", on); b.textContent = on ? "■" : "▶"; b.setAttribute("aria-label", on ? "Stoppa" : "Spela"); } }
lsEl.onended = () => lsPlayUi(false); lsEl.onpause = () => lsPlayUi(false);
// Översätt passets meningar till svenska i ett anrop (bara de som saknar svenska). Sparas på meningen, så den syns även i skuggspelaren.
let lsTrPromise = null;
function lsTranslate(ids) {
  if (typeof claudeJson !== "function" || typeof apiKey !== "function" || !apiKey()) return Promise.resolve(false);
  const need = ids.map(id => ITEMS.find(i => i.id === id)).filter(it => it && !/[åäöÅÄÖ]|\b(jag|du|det|är|och|inte|en|ett|har|vi|han|hon)\b/i.test(it.sv || ""));
  if (!need.length) return Promise.resolve(true);
  lsTrPromise = claudeJson("Översätt varje kinesisk mening till naturlig, kort svenska. Svara som JSON: {\"sv\": [\"...\", ...]} i samma ordning, en översättning per mening.\n\n" + need.map((it, k) => (k + 1) + ". " + it.zh).join("\n"), { modelTier: "quick" })
    .then(async j => { const a = j && Array.isArray(j.sv) ? j.sv : []; for (let k = 0; k < need.length; k++) if (a[k]) { need[k].sv = String(a[k]); await DB.put("items", need[k]); } return true; })
    .catch(e => { console.warn("översättning", e); LS.trErr = e; return false; });
  return lsTrPromise;
}
function lsDots() { return h("div", { class: "lsdots", "aria-label": (LS.i + 1) + " av " + LS.ids.length }, LS.ids.map((id, k) => h("i", { class: LS.grades[id] ? "d" : k === LS.i ? "n" : "" }))); }
function lsIntro() {
  const area = $("#lsArea"); area.replaceChildren();
  const S = LS.srs || {}; const end = endOfToday(); const due = practiceItems().filter(i => S[i.id] && S[i.id].due <= end).length;
  const heard = Object.keys(S).length;
  area.append(h("div", { class: "card stack" },
    h("h2", { style: "margin:0" }, "Lyssna först, läs sen"),
    h("div", { class: "note" }, "Du hör en längre mening med native-röst utan att se texten. Lyssna så många gånger du vill, välj hur mycket du uppfattade och se sedan tecken, pinyin och översättning. Meningar du missar kommer tillbaka enligt samma repetitionsschema som ordkorten."),
    h("div", { class: "lbl" }, "Meningslängd"),
    h("div", { class: "lslen", role: "group", "aria-label": "Meningslängd" }, Object.entries(LS_LEN).map(([k, v]) => h("button", { type: "button", class: "chip" + (LS.len === k ? " on" : ""), onclick: () => { LS.len = k; try { localStorage.setItem("ls-len", k); } catch { } lsIntro(); } }, v[2]))),
    h("div", { class: "note" }, lsPool().length + " meningar med native-ljud passar längd och röstfilter" + (heard ? " · " + heard + " hörda hittills" : "") + (due ? " · " + due + " att repetera idag" : "")),
    h("button", { class: "btn primary block", type: "button", onclick: lsStart }, "Börja (" + LS_SIZE + " meningar)"),
    typeof apiKey === "function" && apiKey() ? null : h("div", { class: "note" }, "Utan API-nyckel visas ordförklaringar från ordboken men ingen svensk översättning av hela meningen.")));
}
async function lsStart() {
  await READY; await lsSrs(); const ids = await lsBuild();
  if (!ids.length) { toast("Inga meningar passar röstfiltret och längden"); return; }
  Object.assign(LS, { ids, i: 0, grades: {}, started: true, trErr: null });
  lsTranslate(ids); lsShowItem();
}
function lsShowItem() {
  const it = lsCur(); if (!it) return lsSummary();
  LS.revealed = false; LS.pick = 0; LS.plays = 0; lsEl.pause();
  const area = $("#lsArea"); area.replaceChildren();
  area.append(lsDots(),
    h("div", { class: "lshid", id: "lsCard" }, h("div", { class: "stack", style: "gap:10px" },
      h("button", { class: "lsplay", id: "lsPlayBtn", type: "button", "aria-label": "Spela", onclick: lsPlay }, "▶"),
      h("div", { class: "note", id: "lsPlays" }, "Texten är dold. Lyssna så många gånger du vill."))),
    h("div", { class: "segctl", id: "lsSpeed", role: "group", "aria-label": "Hastighet" }, [["1", "1×"], ["0.75", "0,75×"], ["0.5", "0,5×"]].map(([r, t]) => h("button", { type: "button", class: "chip", "data-r": r, onclick: () => lsSetSpeed(r) }, t))),
    h("div", { class: "lbl", id: "lsQ" }, "Hur mycket uppfattade du?"),
    h("div", { class: "rate4", id: "lsRate", role: "group", "aria-label": "Hur mycket uppfattade du?" }, LS_GRADES.map(([g, t, s]) => h("button", { type: "button", class: "g" + g, "data-g": g, onclick: () => lsGrade(g) }, t, h("small", null, s)))),
    h("div", { id: "lsReveal", class: "stack" }));
  lsSetSpeed(LS.speed);
  setTimeout(() => { if (curView() === "lyssna" && lsCur() === it && !LS.plays) lsPlay(); }, 250);
}
function lsGrade(g) {
  LS.pick = g; document.querySelectorAll("#lsRate button").forEach(b => b.classList.toggle("sel", +b.dataset.g === g));
  if (!LS.revealed) lsReveal();
}
async function lsReveal() {
  const it = lsCur(); if (!it) return; LS.revealed = true;
  $("#lsQ").textContent = "Stämde det? Du kan ändra innan du går vidare.";
  const card = $("#lsCard"); card.classList.remove("lshid"); card.classList.add("card");
  const gloss = h("div", { class: "lsgloss note" }, "Tryck på ett ord för att se vad det betyder.");
  const zh = h("div", { class: "lszh", lang: "zh-CN" });
  const fillZh = () => {
    zh.replaceChildren();
    if (typeof segment !== "function" || typeof DICT === "undefined" || !DICT.ready) { zh.append(it.zh); return; }
    for (const p of segment(it.zh)) {
      if (!p.w) { zh.append(p.t); continue; }
      const e = bestEntry(p.t);
      const sp = h("span", { class: "w", onclick: () => { zh.querySelectorAll(".w.sel").forEach(x => x.classList.remove("sel")); sp.classList.add("sel"); gloss.replaceChildren(h("b", { lang: "zh-CN" }, p.t), " ", e ? pinyinText(e.p) : "", e ? " · " + cleanDefs(e.e) : " · finns inte i ordboken"); } }, p.t);
      zh.append(sp);
    }
  };
  fillZh(); if (typeof loadDict === "function" && !(typeof DICT !== "undefined" && DICT.ready)) loadDict().then(fillZh).catch(() => { });
  const sv = h("div", { class: "svl" });
  const setSv = () => { sv.textContent = it.sv || (typeof apiKey === "function" && apiKey() ? (LS.trErr ? "Översättningen misslyckades." : "Översätter…") : ""); };
  setSv(); if (lsTrPromise) lsTrPromise.then(setSv);
  card.replaceChildren(h("div", { class: "stack", style: "gap:6px;text-align:center;width:100%" },
    zh, h("div", { class: "pyl" }, pyNode(MA.parsePinyin(it.pinyin))), sv,
    h("div", { class: "row", style: "justify-content:center" },
      h("button", { class: "chip", type: "button", id: "lsPlayBtn2", onclick: lsPlay }, "▶ Lyssna igen"),
      h("button", { class: "chip", type: "button", onclick: () => lsToShadow([it.id], "Från Lyssna") }, "说 Skugga den")),
    h("div", { class: "note" }, it.voice ? it.voice : "", it.credit && !it.voice ? it.credit : "")), gloss);
  $("#lsReveal").replaceChildren(h("button", { class: "btn primary block", type: "button", onclick: lsNext }, LS.i + 1 < LS.ids.length ? "Nästa ›" : "Klar"));
}
async function lsNext() {
  const it = lsCur(); if (!it || !LS.pick) return;
  const g = LS.pick; const S = await lsSrs(); const t = new Date();
  const prev = S[it.id] ? dataToCard(S[it.id]) : dataToCard(newCardData());
  const rating = g === 1 ? R.Again : g === 2 ? R.Hard : g === 4 ? R.Easy : R.Good;
  S[it.id] = cardToData(F.next(prev, t, rating).card); S[it.id].g = g; S[it.id].plays = LS.plays;
  DB.put("kv", S, "lsrs").catch(() => { });
  try { Store.appendLog({ k: "listen", h: it.zh, r: g, t: +t }); } catch { }
  LS.grades[it.id] = g; LS.i++; lsShowItem(); window.scrollTo(0, 0);
}
function lsToShadow(ids, title) {
  if (!ids.length) return; lsEl.pause();
  Object.assign(PASS, { on: true, kind: "topic", ids: ids.slice(), done: [], title, requeued: {} });
  location.hash = "ova"; selectItem(ids[0]).then(renderDots);
}
function lsSummary() {
  LS.started = false; lsEl.pause();
  const area = $("#lsArea"); area.replaceChildren();
  const cnt = g => Object.values(LS.grades).filter(x => x === g).length;
  const hard = LS.ids.filter(id => LS.grades[id] && LS.grades[id] <= 2);
  area.append(h("div", { class: "done card" }, h("b", null, "Omgången är klar"),
    h("div", { class: "tiles", style: "grid-template-columns:repeat(4,1fr)" }, LS_GRADES.map(([g, t]) => h("div", { class: "tile" }, h("b", null, cnt(g)), t))),
    h("div", { class: "stack" },
      hard.length ? h("button", { class: "btn primary block", type: "button", onclick: () => lsToShadow(hard, "Svåra från Lyssna") }, "Skugga de " + hard.length + " svåra") : null,
      h("button", { class: hard.length ? "btn block" : "btn primary block", type: "button", onclick: lsStart }, "Ny omgång"),
      h("button", { class: "btn block", type: "button", onclick: lsIntro }, "Byt längd"))));
  area.append(h("div", { class: "stack" }, LS.ids.map(id => { const it = ITEMS.find(i => i.id === id); if (!it) return null; const g = LS.grades[id]; return h("div", { class: "card", style: "padding:10px 12px" }, h("div", { class: "zh", lang: "zh-CN" }, it.zh), h("div", { class: "note mono" }, pyNode(MA.parsePinyin(it.pinyin))), it.sv ? h("div", { class: "note" }, it.sv) : null, g ? h("div", { class: "note" }, "Du uppfattade: " + LS_GRADES[g - 1][1].toLowerCase()) : null); })));
}
async function lsShow() {
  await lsSrs();
  if (LS.started && lsCur()) { if (!$("#lsArea").childNodes.length) lsShowItem(); return; }
  lsIntro(); READY.then(() => { if (curView() === "lyssna" && !LS.started) lsIntro(); });
}

/* ---------- routing (styrs av huvudappen) ---------- */
function show(v, qs) {
  const q = qs ? new URLSearchParams(qs).get("q") : null; if (q && v === "ova") setTimeout(() => deepLink(q), 0);
  if (v === "ova" && qs && new URLSearchParams(qs).get("fri")) { PASS.on = false; renderDots(); history.replaceState(null, "", "#ova"); $("#pickBox").open = true; }
  if (v === "bibliotek") { renderLib(); if (!$("#tqList").childNodes.length) tqSearch(); }
  if (v === "tonpar") renderTonpar(); if (v === "lyssna") lsShow(); else lsEl.pause(); if (v === "stat") renderStats(); if (v === "hor") nextListen();
  if (v === "skugga") renderHome();
  if (v === "ova") { renderDots(); requestAnimationFrame(() => drawMimic()); }
  if (v !== "ova") stopPlayer();
}
// Stoppa allt ljud i spelaren: inspelning, loopläget och A–B-loopen. Körs när du lämnar Öva eller appen hamnar i bakgrunden.
function stopPlayer() {
  if (REC.on) stopRec(); if (CONT.on) contStop();
  if (AB.loop) { AB.loop = false; $("#loopBtn").classList.remove("on"); }
  audioEl.pause(); meEl.pause();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) stopPlayer(); });
window.addEventListener("pagehide", stopPlayer);
async function deepLink(q) {
  await READY; $("#sentQ").value = q;
  const w = ITEMS.find(i => i.zh === q && (i.audio || i.audioPath)); if (w && (!CUR || CUR.id !== w.id)) await selectItem(w.id);
  PASS.on = false; renderDots(); $("#pickBox").open = true;
  showSentHits(q); history.replaceState(null, "", "#ova");
}

let READY_RES; const READY = new Promise(r => READY_RES = r);
(async () => {
  await loadItems();
  let last = null; try { last = localStorage.getItem("studio-cur"); } catch { }
  const lastIt = last && ITEMS.find(i => i.id === last && (i.audio || i.audioPath));
  await selectItem(lastIt ? lastIt.id : (practiceItems()[0] || ITEMS[0] || {}).id);
  seedSentences().then(n => { READY_RES(); if (curView() === "skugga") renderHome(); if (n) { toast(n + " meningar med native-ljud tillagda"); if (!CUR || !(CUR.audio || CUR.audioPath)) { const P = practiceItems(); if (P[0]) selectItem(P[0].id); } else renderItemSel(); } fillNative(); });
  try { const t = localStorage.getItem("mandapp-to-studio"); if (t) { localStorage.removeItem("mandapp-to-studio"); importText(t); } } catch { }
  SRS = (await DB.get("kv", "srs")) || {};
  if (!window.isSecureContext) $("#recNote").textContent = "Mikrofonen kräver https.";
  renderVoiceSel(); SK_READY = true; if (curView() === "skugga") renderHome(); if (curView() === "ova") renderDots();
})();

})();
