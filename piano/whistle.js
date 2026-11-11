// Whistle to Notes page: microphone or uploaded recording -> pitch line -> clean notes -> play / save / practise.
(function () {
  "use strict";
  const W = window.Whistle;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { return localStorage.getItem("pn." + k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("pn." + k, v); } catch (e) { /* private mode */ } },
  };

  const state = {
    listening: false,
    frames: [],          // [{t, midi|null, level}] whistled pitch, not shifted
    result: null,        // transcribe() output
    octave: null,        // null = automatic, else semitone shift chosen with - / +
    names: store.get("names", "letter"),
    live: null,          // {midi (fractional, tuned + shifted)} while sound is coming in
    playing: -1,         // index of the note being played back
    t0: 0,
  };
  const solf = () => state.names === "solfege";
  const shift = () => (state.octave != null ? state.octave : state.result ? state.result.shift : liveShift());
  const name = (m) => W.noteName(m, solf()).replace("#", "♯");
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // While whistling, before there's a result: guess the shift from what came in so far.
  function liveShift() {
    const v = state.frames.filter((f) => f.midi != null).map((f) => Math.round(f.midi));
    return v.length ? W.autoShift(v) : -24;
  }

  // ---------------------------------------------------------------- sound
  let ac = null, master = null;
  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createWaveShaper();
      const n = 2048, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5); }
      master.curve = curve;
      master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  // same piano-ish tone as the Piano page
  function pluck(m, when = 0, hold = 1.2) {
    const a = audio();
    const t = Math.max(a.currentTime, when || a.currentTime);
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const len = Math.max(0.5, Math.min(hold + 0.6, 2.2 - (m - 21) / 50));
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(master);
    [1, 0.5, 0.28, 0.14, 0.08, 0.04].forEach((amp, i) => {
      const h = i + 1, fh = f * h * Math.sqrt(1 + 0.0004 * h * h);
      if (fh > 12000) return;
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = fh;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len / h);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }

  // ---------------------------------------------------------------- microphone
  let stream = null, src = null, analyser = null, buf = null, raf = 0, wake = null;
  let starting = false; // waiting for the microphone permission: a second tap must not start a second mic
  const det = { floor: 0.002, warm: 0, lastRun: 0 };
  async function start() {
    if (starting || state.listening) return;
    showMsg("");
    audio(); // iPhone: create/resume the audio context inside the tap, before any await
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMsg("This browser can't use the microphone here. Open the app from its https link in Safari, or upload a recording instead.");
      return;
    }
    starting = true;
    $("micText").textContent = "Starting…";
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      starting = false;
      showMsg(err && err.name === "NotAllowedError"
        ? "Microphone access is blocked. On iPhone: Settings > Safari > Microphone > Allow, then reload. Or upload a recording instead."
        : "Couldn't start the microphone (" + (err && err.message ? err.message : err) + ").");
      render();
      return;
    }
    if (!starting) { s.getTracks().forEach((t) => t.stop()); render(); return; } // Stop was tapped while waiting
    starting = false;
    stream = s;
    const a = audio();
    src = a.createMediaStreamSource(stream);
    analyser = a.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    src.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    clearTune();
    state.listening = true;
    state.t0 = a.currentTime;
    Object.assign(det, { floor: 0.002, warm: 0, lastRun: 0 });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    render();
    if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { if (state.listening) wake = w; else w.release(); }, () => {});
  }
  function stop() {
    starting = false;
    const was = state.listening;
    state.listening = false;
    cancelAnimationFrame(raf);
    raf = 0;
    if (src) { try { src.disconnect(); } catch (e) { /* already gone */ } src = null; }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (wake) { wake.release().catch(() => {}); wake = null; }
    state.live = null;
    $("mic").style.removeProperty("--lvl");
    if (was) finish(); else render();
  }
  function toggle() { if (state.listening || starting) stop(); else start(); }
  function tick() {
    if (!state.listening) return;
    raf = requestAnimationFrame(tick);
    analyser.getFloatTimeDomainData(buf);
    const sr = ac.sampleRate, t = ac.currentTime - state.t0;
    // room noise: follow quiet moments quickly, loud ones very slowly
    const lvl = W.frame(buf, sr, Infinity).level;
    if (det.warm < 20) { det.floor = det.warm ? Math.min(det.floor, lvl) : lvl; det.warm++; }
    else det.floor += (lvl < det.floor ? 0.2 : 0.002) * (lvl - det.floor);
    const f = W.frame(buf, sr, Math.max(0.004, det.floor * 3));
    state.frames.push({ t, midi: f.midi, level: f.level });
    $("mic").style.setProperty("--lvl", (1 + Math.min(0.25, f.level * 2)).toFixed(3));
    if (f.midi != null) {
      const off = state.result ? state.result.offset : 0;
      state.live = { midi: f.midi - off + shift() };
    } else state.live = null;
    if (t - det.lastRun > 0.25) { det.lastRun = t; state.result = W.transcribe(state.frames); renderNotes(); }
    if (t > 600) stop(); // 10 minutes is plenty
    renderNow();
    drawTrace();
    drawKeys();
  }

  // ---------------------------------------------------------------- upload a recording
  async function upload(file) {
    if (!file) return;
    if (state.listening) stop();
    showMsg("");
    $("sub").textContent = "Reading " + file.name + "…";
    try {
      const data = await file.arrayBuffer();
      const a = audio();
      const audioBuf = await new Promise((res, rej) => {
        const p = a.decodeAudioData(data, res, rej); // Safari: callback form
        if (p && p.then) p.then(res, rej);
      });
      const ch = audioBuf.getChannelData(0);
      if (audioBuf.duration > 600) throw new Error("that recording is longer than 10 minutes");
      clearTune();
      state.frames = W.analyze(ch, audioBuf.sampleRate);
      finish();
      if (!state.result.notes.length) showMsg("No clear notes found in that recording. Whistle a bit louder or closer to the phone.");
    } catch (err) {
      showMsg("Couldn't read that file (" + (err && err.message ? err.message : "unknown format") + "). Voice memos and most audio files work.");
      $("sub").textContent = "Tap the mic and whistle (or hum) a tune.";
    }
    $("file").value = "";
  }

  // ---------------------------------------------------------------- tune
  function finish() {
    state.result = W.transcribe(state.frames);
    render();
  }
  function clearTune() {
    state.frames = [];
    state.result = null;
    state.playing = -1;
    $("saved").hidden = true;
    render();
  }
  const tuneNotes = () => (state.result ? state.result.notes.map((n) => ({ ...n, midi: n.midi + shift() })) : []);

  let playTimers = [];
  function play() {
    if (state.playing >= 0) { stopPlay(); return; }
    const notes = tuneNotes();
    if (!notes.length) return;
    const a = audio();
    const t0 = a.currentTime + 0.08, first = notes[0].start;
    notes.forEach((n, i) => {
      const at = n.start - first;
      pluck(n.midi, t0 + at, n.dur);
      playTimers.push(setTimeout(() => { state.playing = i; renderNotes(); drawKeys(); drawTrace(); }, at * 1000 + 80));
    });
    const last = notes[notes.length - 1];
    playTimers.push(setTimeout(stopPlay, (last.start - first + last.dur) * 1000 + 400));
    state.playing = 0;
    $("play").innerHTML = "&#9632; Stop";
  }
  function stopPlay() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    state.playing = -1;
    $("play").innerHTML = "&#9654; Play";
    renderNotes(); drawKeys(); drawTrace();
  }

  function copy() {
    const notes = tuneNotes();
    const text = notes.map((n) => W.noteName(n.midi, false)).join(" ") + "\n" + notes.map((n) => W.noteName(n.midi, true)).join(" ");
    const done = () => { $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy notes"), 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("Copy the notes:", text));
    else prompt("Copy the notes:", text);
  }

  function save() {
    const notes = tuneNotes().map((n) => n.midi);
    if (notes.length < 2) return;
    let mine = [];
    try { mine = JSON.parse(store.get("mysongs", "[]")) || []; } catch (e) { mine = []; }
    const title = $("name").value.trim() || "My whistle " + (mine.length + 1);
    mine = mine.filter((x) => x.title !== title).concat([{ title, notes }]);
    store.set("mysongs", JSON.stringify(mine));
    const link = "piano.html#practise=" + encodeURIComponent("mine:" + title);
    $("saved").innerHTML = "";
    const a = document.createElement("a");
    a.href = link;
    a.textContent = "Practise it on the Piano page →";
    $("saved").append(`Saved "${title}" to your songs. `, a);
    $("saved").hidden = false;
  }

  // ---------------------------------------------------------------- drawing
  function showMsg(t) { $("msg").textContent = t; $("msg").hidden = !t; }

  function render() {
    const mic = $("mic");
    mic.classList.toggle("on", state.listening);
    mic.setAttribute("aria-label", state.listening ? "Stop listening" : "Start listening");
    $("micText").textContent = state.listening ? "Stop" : starting ? "Starting…" : "Whistle";
    const s = shift();
    const oct = s / 12;
    $("octOut").textContent = (state.octave == null ? "Octave: auto" : "Octave") + (oct ? ` (${oct > 0 ? "+" : "−"}${Math.abs(oct)})` : "");
    renderNow();
    renderNotes();
    drawTrace();
    drawKeys();
  }

  function renderNow() {
    const big = $("big"), sub = $("sub"), needle = $("needle");
    if (state.live) {
      const m = Math.round(state.live.midi), c = Math.round((state.live.midi - m) * 100);
      big.textContent = name(m);
      big.classList.remove("idle");
      sub.textContent = `${W.noteName(m, !solf()).replace("#", "♯")} · ${c >= 0 ? "+" : "−"}${Math.abs(c)} cents`;
      needle.style.left = `calc(${50 + c}% - 2px)`;
    } else if (state.listening) {
      big.textContent = "…";
      big.classList.add("idle");
      sub.textContent = "Listening. Whistle a tune, then tap Stop.";
      needle.style.left = "calc(50% - 2px)";
    } else if (state.result && state.result.notes.length) {
      needle.style.left = "calc(50% - 2px)";
      const n = tuneNotes();
      big.textContent = `${n.length} notes`;
      big.classList.remove("idle");
      const off = Math.round(state.result.offset * 100);
      sub.textContent = `Your whistle was tuned ${off >= 0 ? "+" : "−"}${Math.abs(off)} cents from standard pitch; notes snapped to the nearest key.`;
    } else if (!$("sub").textContent.startsWith("Reading")) {
      big.textContent = "–";
      big.classList.add("idle");
      sub.textContent = "Tap the mic and whistle (or hum) a tune.";
    }
  }

  function renderNotes() {
    const notes = tuneNotes();
    const box = $("notes");
    box.innerHTML = "";
    if (!notes.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = state.listening ? "Notes appear as you whistle…" : "The notes you whistle show up here.";
      box.append(p);
    }
    notes.forEach((n, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (i === state.playing ? " now" : "");
      b.textContent = name(n.midi);
      b.title = W.noteName(n.midi, !solf()) + ", " + n.dur.toFixed(2) + " s";
      b.addEventListener("click", () => { pluck(n.midi); state.playing = i; renderNotes(); drawKeys(); drawTrace(); state.playing = -1; });
      box.append(b);
    });
    $("count").textContent = notes.length ? `${notes.length} notes` : "";
    const has = notes.length > 0 && !state.listening;
    $("actions").hidden = !has;
    $("saveRow").hidden = !has || notes.length < 2;
  }

  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [g, r.width, r.height];
  }
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

  // Pitch over time: semitone lanes, the raw whistle as a thin line, the notes found as bars.
  function drawTrace() {
    const [g, W_, H] = fit($("trace"));
    g.clearRect(0, 0, W_, H);
    const s = shift(), off = state.result ? state.result.offset : 0;
    const notes = tuneNotes();
    const pts = state.frames.filter((f) => f.midi != null).map((f) => ({ t: f.t, m: f.midi - off + s }));
    const span = state.listening ? 8 : null;
    const tEnd = state.frames.length ? state.frames[state.frames.length - 1].t : 1;
    const tStart = span ? Math.max(0, tEnd - span) : state.frames.length ? state.frames[0].t : 0;
    const tLen = Math.max(span || 0, tEnd - tStart, 1);
    const ms = notes.map((n) => n.midi).concat(pts.filter((p) => p.t >= tStart).map((p) => p.m));
    let lo = ms.length ? Math.floor(Math.min(...ms)) - 2 : 57, hi = ms.length ? Math.ceil(Math.max(...ms)) + 2 : 74;
    if (hi - lo < 14) { const c = (hi + lo) / 2; lo = Math.floor(c - 7); hi = lo + 14; }
    const left = 34;
    const x = (t) => left + ((t - tStart) / tLen) * (W_ - left - 6);
    const y = (m) => H - 4 - ((m - lo + 0.5) / (hi - lo + 1)) * (H - 8);
    const lane = (H - 8) / (hi - lo + 1);
    g.font = `11px ${css("--font-ui") || "sans-serif"}`;
    g.textBaseline = "middle";
    for (let m = lo; m <= hi; m++) {
      if (isBlack(m)) { g.fillStyle = css("--lane"); g.fillRect(left, y(m) - lane / 2, W_ - left, lane); }
      if (m % 12 === 0 || m === lo || m === hi) {
        g.fillStyle = css("--muted");
        g.fillText(W.noteName(m, solf()), 2, y(m));
      }
    }
    // notes found
    notes.forEach((n, i) => {
      if (n.start + n.dur < tStart) return;
      g.fillStyle = i === state.playing ? css("--teal") : css("--brass");
      const x0 = Math.max(left, x(n.start)), x1 = x(n.start + n.dur);
      g.beginPath();
      g.roundRect ? g.roundRect(x0, y(n.midi) - lane * 0.35, Math.max(3, x1 - x0), lane * 0.7, 3) : g.rect(x0, y(n.midi) - lane * 0.35, Math.max(3, x1 - x0), lane * 0.7);
      g.fill();
    });
    // the raw whistle
    g.strokeStyle = css("--ink");
    g.globalAlpha = 0.55;
    g.lineWidth = 1.5;
    g.beginPath();
    let prev = null;
    for (const p of pts) {
      if (p.t < tStart) continue;
      if (prev && p.t - prev.t < 0.06 && Math.abs(p.m - prev.m) < 3) g.lineTo(x(p.t), y(p.m));
      else g.moveTo(x(p.t), y(p.m));
      prev = p;
    }
    g.stroke();
    g.globalAlpha = 1;
    if (!pts.length) {
      g.fillStyle = css("--muted");
      g.textAlign = "center";
      g.font = `14px ${css("--font-ui") || "sans-serif"}`;
      g.fillText(state.listening ? "Whistle…" : "Your whistle will be drawn here", (W_ + left) / 2, H / 2);
      g.textAlign = "left";
    }
  }

  // A keyboard just wide enough for the tune (at least two octaves); lights the note now.
  function drawKeys() {
    const [g, W_, H] = fit($("kbd"));
    g.clearRect(0, 0, W_, H);
    const notes = tuneNotes();
    const live = state.live ? Math.round(state.live.midi) : null;
    const lit = new Set();
    if (live != null) lit.add(live);
    if (state.playing >= 0 && notes[state.playing]) lit.add(notes[state.playing].midi);
    const used = new Set(notes.map((n) => n.midi));
    const all = notes.map((n) => n.midi).concat(live != null ? [live] : []);
    let lo = all.length ? Math.min(...all) : 60, hi = all.length ? Math.max(...all) : 71;
    lo = 12 * Math.floor(lo / 12); hi = 12 * Math.floor(hi / 12) + 11;
    if (hi - lo < 23) hi = lo + 23;
    lo = Math.max(21, lo); hi = Math.min(108, hi);
    const whites = [];
    for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const kw = W_ / whites.length;
    const fillFor = (m, base) => (lit.has(m) ? css("--teal") : used.has(m) ? css("--brass") : base);
    whites.forEach((m, i) => {
      g.fillStyle = fillFor(m, css("--ivory"));
      g.fillRect(i * kw + 0.5, 0, kw - 1, H);
      g.strokeStyle = css("--ivory-edge");
      g.strokeRect(i * kw + 0.5, 0, kw - 1, H);
      if (m % 12 === 0 || lit.has(m)) {
        g.fillStyle = lit.has(m) || used.has(m) ? "#111" : "#6a6457";
        g.font = `${Math.min(12, kw * 0.45)}px ${css("--font-ui") || "sans-serif"}`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillText(W.noteName(m, solf()), i * kw + kw / 2, H - 4);
      }
    });
    for (let m = lo; m <= hi; m++) {
      if (!isBlack(m)) continue;
      const i = whites.indexOf(m - 1);
      if (i < 0) continue;
      g.fillStyle = fillFor(m, css("--ebony"));
      g.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, H * 0.6);
    }
    g.textAlign = "left";
  }

  // ---------------------------------------------------------------- wiring
  $("mic").addEventListener("click", toggle);
  $("file").addEventListener("change", (e) => upload(e.target.files && e.target.files[0]));
  $("play").addEventListener("click", play);
  $("copy").addEventListener("click", copy);
  $("clear").addEventListener("click", () => { stopPlay(); clearTune(); });
  $("save").addEventListener("click", save);
  $("name").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  const nudge = (d) => { state.octave = shift() + d; if (state.playing >= 0) stopPlay(); render(); };
  $("octDown").addEventListener("click", () => nudge(-12));
  $("octUp").addEventListener("click", () => nudge(12));
  $("octOut").addEventListener("click", () => { state.octave = null; render(); });
  document.querySelectorAll("input[name=names]").forEach((r) => {
    r.checked = r.value === state.names;
    r.addEventListener("change", () => { state.names = r.value; store.set("names", r.value); render(); });
  });
  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(render, 120); });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && state.listening) stop(); });
  render();
})();
