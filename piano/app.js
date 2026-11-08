// Piano Notes - screen, microphone loop, keyboard and staff.
(function () {
  "use strict";
  const { yinPitch, chordNotes, rms, midiToFreq, freqToMidi, A0, C8 } = window.Detect;
  const { follow, CLEAR_KEYS } = window.Melody;

  const LETTER = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const SOLFEGE = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const LETTER_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // staff position within the octave

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { return localStorage.getItem("pn." + k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("pn." + k, v); } catch (e) { /* private mode */ } },
  };

  const state = {
    mode: store.get("mode", "single"),
    names: store.get("names", "letter"),
    listening: false,
    sounding: [],     // notes heard right now
    history: [],      // [{notes:[midi], t}]
    melody: [],       // top note of each event, for tune following
    follow: null,
    tapUntil: 0,      // ignore the mic briefly after a key tap (it hears the phone's own sound)
  };

  const octave = (m) => Math.floor(m / 12) - 1;
  const pcName = (m) => (state.names === "solfege" ? SOLFEGE : LETTER)[m % 12];
  const fullName = (m) => pcName(m) + octave(m);
  const otherName = (m) => (state.names === "solfege" ? LETTER : SOLFEGE)[m % 12] + octave(m);

  // ---------------------------------------------------------------- keyboard
  const kbd = $("kbd"), scroller = $("kbdScroll");
  const keys = new Map();
  function buildKeyboard() {
    kbd.textContent = "";
    keys.clear();
    // all 52 white keys always fit the screen width
    const cs = getComputedStyle(scroller);
    const avail = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const w = Math.max(5, Math.floor((avail / 52) * 100) / 100);
    kbd.style.setProperty("--wkey", w + "px");
    kbd.classList.toggle("slim", w < 24);
    kbd.classList.toggle("tiny", w < 12);
    let white = 0;
    for (let m = A0; m <= C8; m++) {
      const el = document.createElement("div");
      const black = IS_BLACK[m % 12] === 1;
      el.className = "key " + (black ? "black" : "white") + (m % 12 === 0 ? " c" : "") + (m === A0 ? " clearkey" : "");
      el.dataset.midi = m;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", fullName(m));
      if (black) el.style.left = white * w - w * 0.31 + "px";
      else el.style.left = white++ * w + "px";
      const ord = document.createElement("span");
      ord.className = "ord";
      const nm = document.createElement("span");
      nm.className = "nm";
      el.append(ord, nm);
      kbd.append(el);
      keys.set(m, el);
    }
    kbd.style.width = white * w + "px";
    labelKeys();
  }
  function labelKeys() {
    for (const [m, el] of keys) {
      const nm = el.querySelector(".nm");
      nm.textContent = m % 12 === 0 ? fullName(m) : IS_BLACK[m % 12] ? pcName(m).replace("♯", "♯") : pcName(m);
      el.setAttribute("aria-label", fullName(m));
    }
  }
  function scrollToKey(m, smooth = true) {
    const el = keys.get(m);
    if (!el) return;
    const left = el.offsetLeft + el.offsetWidth / 2 - scroller.clientWidth / 2;
    const visible = el.offsetLeft > scroller.scrollLeft + 20 && el.offsetLeft + el.offsetWidth < scroller.scrollLeft + scroller.clientWidth - 20;
    if (!visible || !smooth) scroller.scrollTo({ left, behavior: smooth && !reduceMotion() ? "smooth" : "auto" });
  }
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- sound for tapped keys
  let ctx = null;
  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function pluck(m) {
    const ac = audio();
    const t = ac.currentTime;
    const f = midiToFreq(m);
    const len = Math.max(0.6, 2.2 - (m - 21) / 50);
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(ac.destination);
    [1, 0.5, 0.28, 0.14, 0.08, 0.04].forEach((a, i) => {
      const h = i + 1;
      const fh = f * h * Math.sqrt(1 + 0.0004 * h * h);
      if (fh > 12000) return;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = fh;
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len / h);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }

  kbd.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".key");
    if (!el) return;
    const m = Number(el.dataset.midi);
    pluck(m);
    state.tapUntil = performance.now() + 600;
    noteEvent([m]);
    flash([m]);
  });
  let flashTimer = 0;
  function flash(notes) {
    state.sounding = notes;
    render();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (!state.listening) { state.sounding = []; renderKeys(); } }, 350);
  }

  // ---------------------------------------------------------------- note events
  function noteEvent(notes) {
    notes = [...new Set(notes)].sort((a, b) => a - b);
    if (notes.some((n) => CLEAR_KEYS.includes(n))) { clearAll("Cleared. Play a new piece."); return; }
    state.history.push({ notes, t: performance.now() });
    if (state.history.length > 64) state.history.shift();
    state.melody.push(notes[notes.length - 1]); // the top note carries the tune
    if (state.melody.length > 64) state.melody.shift();
    state.follow = follow(state.melody, state.follow);
    scrollToKey(state.follow && state.follow.next.length ? state.follow.next[0] : notes[0]);
    if (state.follow && state.follow.next.length) {
      // keep the note just played in view too
      scrollToKey(notes[0]);
    }
  }

  // ---------------------------------------------------------------- microphone loop
  let stream = null, analyser = null, timeBuf = null, freqBuf = null, raf = 0, wake = null;
  const det = { noise: 0.002, env: 0, held: null, cand: null, candN: 0, quiet: 0, lastT: 0, chordKey: "", freq: 0 };

  async function startListening() {
    showMsg("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMsg("This browser can't use the microphone here. Open the app from its https link in Safari.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      showMsg(err && err.name === "NotAllowedError"
        ? "Microphone access is blocked. On iPhone: Settings > Safari > Microphone > Allow, then reload this page."
        : "Couldn't start the microphone (" + (err && err.message ? err.message : err) + ").");
      return;
    }
    const ac = audio();
    const src = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 16384;
    analyser.smoothingTimeConstant = 0;
    src.connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Float32Array(analyser.frequencyBinCount);
    state.listening = true;
    Object.assign(det, { noise: 0.002, env: 0, held: null, cand: null, candN: 0, quiet: 0, chordKey: "" });
    try { wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
    loop();
    render();
  }
  function stopListening() {
    state.listening = false;
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    if (wake) { wake.release().catch(() => {}); wake = null; }
    state.sounding = [];
    det.freq = 0;
    render();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - det.lastT < 33) return; // ~30 checks a second is plenty
    det.lastT = now;
    analyser.getFloatTimeDomainData(timeBuf);
    const sr = ctx.sampleRate;
    const r = rms(timeBuf.subarray(timeBuf.length - 1024));
    // background level: drops fast, rises slowly
    det.noise = r < det.noise ? r : det.noise + (r - det.noise) * 0.003;
    const gate = Math.max(0.004, det.noise * 3);
    const strike = r > gate * 2 && r > det.env * 1.6; // a fresh hammer strike, even on the same key
    det.env = Math.max(r, det.env * 0.9);

    if (r < gate) {
      if (++det.quiet > 4 && (det.held !== null || state.sounding.length)) {
        det.held = null; det.chordKey = ""; det.freq = 0;
        state.sounding = [];
        render();
      }
      return;
    }
    det.quiet = 0;
    const tapEcho = now < state.tapUntil;

    if (state.mode === "single") {
      const p = yinPitch(timeBuf.subarray(timeBuf.length - 4096), sr);
      if (!p || p.clarity < 0.8) return;
      const fm = freqToMidi(p.freq);
      const m = Math.round(fm);
      if (m < A0 || m > C8) return;
      det.freq = p.freq;
      det.cents = (fm - m) * 100;
      if (m === det.cand) det.candN++;
      else { det.cand = m; det.candN = 1; }
      const isNew = det.candN === 2 && m !== det.held;
      const again = m === det.held && strike;
      if (det.candN >= 2) {
        det.held = m;
        state.sounding = [m];
        if ((isNew || again) && !tapEcho) noteEvent([m]);
        render();
      }
    } else {
      analyser.getFloatFrequencyData(freqBuf);
      const mag = new Float32Array(freqBuf.length);
      for (let i = 0; i < mag.length; i++) mag[i] = Math.pow(10, freqBuf[i] / 20);
      const notes = chordNotes(mag, sr, analyser.fftSize).filter((n) => n.strength >= 0.3).map((n) => n.midi).sort((a, b) => a - b);
      if (!notes.length) return;
      det.freq = 0;
      const key = notes.join(",");
      if (key === det.cand) det.candN++;
      else { det.cand = key; det.candN = 1; }
      if (det.candN >= 2) {
        const prev = det.chordKey ? det.chordKey.split(",").map(Number) : [];
        const added = notes.some((n) => !prev.includes(n));
        state.sounding = notes;
        if ((added || strike) && key !== det.chordKey && !tapEcho) noteEvent(notes);
        else if (strike && !tapEcho && key === det.chordKey) noteEvent(notes);
        det.chordKey = key;
        render();
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    renderNow();
    renderKeys();
    renderSong();
    drawStaff();
    const st = $("status");
    st.classList.toggle("on", state.listening);
    st.querySelector("span").textContent = state.listening ? "Listening" : "Mic off";
    const btn = $("listen");
    btn.textContent = state.listening ? "Stop" : "Listen";
    btn.classList.toggle("on", state.listening);
  }

  function renderNow() {
    const big = $("big");
    const notes = state.sounding.length ? state.sounding : (state.history.length ? state.history[state.history.length - 1].notes : []);
    const live = state.sounding.length > 0;
    big.classList.toggle("idle", !live);
    if (!notes.length) {
      big.textContent = "–";
      return;
    }
    big.textContent = "";
    const shown = notes.slice(-3);
    shown.forEach((m, i) => {
      if (i) big.append(" ");
      big.append(pcName(m));
      const s = document.createElement("sub");
      s.textContent = octave(m);
      big.append(s);
    });
    big.style.fontSize = shown.length > 1 ? "36px" : "";
    $("alt").textContent = notes.map(otherName).join("  ·  ");
    const meter = $("meter");
    if (live && state.mode === "single" && det.freq) {
      $("freq").textContent = det.freq.toFixed(1) + " Hz  ·  " + (det.cents >= 0 ? "+" : "") + Math.round(det.cents) + " cents";
      meter.classList.remove("off");
      $("needle").style.left = 50 + Math.max(-50, Math.min(50, det.cents)) + "%";
    } else {
      $("freq").textContent = notes.length === 1 ? midiToFreq(notes[0]).toFixed(1) + " Hz" : notes.length + " notes";
      meter.classList.add("off");
    }
  }

  function renderKeys() {
    const next = state.follow ? state.follow.next.slice(0, 3) : [];
    for (const [m, el] of keys) {
      const on = state.sounding.includes(m);
      const ni = next.indexOf(m);
      el.classList.toggle("on", on);
      el.classList.toggle("next", ni >= 0 && !on);
      el.querySelector(".ord").textContent = ni >= 0 ? ni + 1 : "";
    }
  }

  function renderSong() {
    const box = $("song");
    const f = state.follow;
    box.querySelectorAll(".title,.chips").forEach((n) => n.remove());
    $("songHint").hidden = !!f;
    if (!f) return;
    const title = document.createElement("div");
    title.className = "title";
    const [name, composer] = f.title.split(" - ");
    title.textContent = name;
    const small = document.createElement("small");
    small.textContent = (composer ? composer + " · " : "") + (f.done ? "end of the theme" : "note " + f.at + " of " + f.of);
    title.append(small);
    box.append(title);
    const lock = document.createElement("div");
    lock.className = "chips lockline";
    lock.textContent = f.lost
      ? "Off the melody. Pick it up from the teal keys, or play the lowest key to clear."
      : "Locked on this piece. Play the lowest key (A0) to clear.";
    box.append(lock);
    if (f.next.length) {
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.setAttribute("aria-label", "Play next");
      f.next.forEach((m) => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = fullName(m);
        chips.append(c);
      });
      box.append(chips);
    }
  }

  // grand staff: treble from E4 (bottom line) up, bass from A3 (top line) down; C4 and up on treble
  const canvas = $("staff");
  function drawStaff() {
    const dpr = window.devicePixelRatio || 1;
    let W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // the staff is drawn for a 190px-tall box and scaled to fit (smaller in widescreen)
    const k = H / 190;
    g.scale(k, k);
    W = W / k; H = 190;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim(), muted = css.getPropertyValue("--muted").trim();
    const brass = css.getPropertyValue("--brass").trim(), teal = css.getPropertyValue("--teal").trim();
    const line = css.getPropertyValue("--line").trim();

    const hs = 4.5;                 // half a staff space
    const trebleTop = 34;            // F5 line
    const tb = trebleTop + 8 * hs;   // E4 line
    const bt = tb + 10 * hs;         // A3 line
    const left = 52, right = W - 10;

    g.strokeStyle = muted; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      [trebleTop + i * 2 * hs, bt + i * 2 * hs].forEach((y) => {
        g.beginPath(); g.moveTo(8, y + 0.5); g.lineTo(right, y + 0.5); g.stroke();
      });
    }
    g.beginPath(); g.moveTo(8.5, trebleTop); g.lineTo(8.5, bt + 8 * hs); g.stroke();
    g.fillStyle = ink;
    g.textBaseline = "alphabetic";
    g.font = "48px 'Bravura', 'Apple Symbols', 'Segoe UI Symbol', serif";
    g.fillText("\u{1D11E}", 12, tb + 2 * hs + 2);
    g.font = "30px 'Bravura', 'Apple Symbols', 'Segoe UI Symbol', serif";
    g.fillText("\u{1D122}", 14, bt + 4 * hs + 2);

    const colW = 30;
    const next = state.follow ? state.follow.next.slice(0, 3) : [];
    const room = Math.max(1, Math.floor((right - left - (next.length ? next.length * colW + 14 : 0)) / colW));
    const events = state.history.slice(-room);

    const place = (m) => {
      let dia = octave(m) * 7 + LETTER_STEP[m % 12];
      const sharp = IS_BLACK[m % 12] === 1;
      let shift = 0;
      if (m >= 60) {
        while (dia > 43) { dia -= 7; shift++; }
        return { y: tb - (dia - 30) * hs, dia, clef: "t", sharp, shift };
      }
      while (dia < 11) { dia += 7; shift--; }
      return { y: bt - (dia - 26) * hs, dia, clef: "b", sharp, shift };
    };
    const ledgers = (x, p, color) => {
      g.strokeStyle = color; g.lineWidth = 1.2;
      const lines = [];
      if (p.clef === "t") {
        for (let d = 28; d >= p.dia; d -= 2) lines.push(tb - (d - 30) * hs);
        for (let d = 40; d <= p.dia; d += 2) lines.push(tb - (d - 30) * hs);
      } else {
        for (let d = 16; d >= p.dia; d -= 2) lines.push(bt - (d - 26) * hs);
        for (let d = 28; d <= p.dia; d += 2) lines.push(bt - (d - 26) * hs);
      }
      lines.forEach((y) => { g.beginPath(); g.moveTo(x - 9, y + 0.5); g.lineTo(x + 9, y + 0.5); g.stroke(); });
    };
    const head = (x, m, color, hollow, alpha) => {
      const p = place(m);
      g.globalAlpha = alpha;
      ledgers(x, p, color);
      g.save();
      g.translate(x, p.y);
      g.rotate(-0.35);
      g.beginPath();
      g.ellipse(0, 0, 5.6, 4, 0, 0, Math.PI * 2);
      if (hollow) { g.strokeStyle = color; g.lineWidth = 1.8; g.stroke(); }
      else { g.fillStyle = color; g.fill(); }
      g.restore();
      g.fillStyle = color;
      if (p.sharp) { g.font = "15px 'Apple Symbols', 'Segoe UI Symbol', serif"; g.fillText("♯", x - 15, p.y + 5); }
      if (p.shift) {
        g.font = "italic 10px Georgia, serif";
        const lbl = p.shift > 0 ? (p.shift > 1 ? "15ma" : "8va") : "8vb";
        g.fillText(lbl, x - 9, p.shift > 0 ? Math.min(p.y - 10, trebleTop - 6) : Math.max(p.y + 16, bt + 8 * hs + 14));
      }
      g.globalAlpha = 1;
    };

    events.forEach((ev, i) => {
      const x = left + 12 + i * colW;
      const newest = i === events.length - 1;
      const alpha = 0.45 + 0.55 * ((i + 1) / events.length);
      ev.notes.forEach((m) => head(x, m, newest ? brass : ink, false, alpha));
      g.globalAlpha = alpha;
      g.fillStyle = newest ? brass : muted;
      g.font = "700 10px " + getComputedStyle(document.body).fontFamily;
      g.textAlign = "center";
      g.fillText(pcName(ev.notes[ev.notes.length - 1]), x, H - 6);
      g.textAlign = "start";
      g.globalAlpha = 1;
    });
    if (next.length) {
      const x0 = left + 12 + events.length * colW;
      g.strokeStyle = line; g.setLineDash([3, 4]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 - 8, trebleTop - 8); g.lineTo(x0 - 8, bt + 8 * hs + 8); g.stroke();
      g.setLineDash([]);
      next.forEach((m, i) => {
        const x = x0 + 8 + i * colW;
        head(x, m, teal, true, 1 - i * 0.22);
        g.fillStyle = teal;
        g.font = "700 10px " + getComputedStyle(document.body).fontFamily;
        g.textAlign = "center";
        g.fillText(pcName(m), x, H - 6);
        g.textAlign = "start";
      });
    }
    if (!events.length) {
      g.fillStyle = muted;
      g.font = "14px " + getComputedStyle(document.body).fontFamily;
      g.fillText("Notes you play appear here.", left + 12, tb + 5 * hs + 4);
    }
  }

  // ---------------------------------------------------------------- demo: Ode to Joy, first two bars
  let demoTimer = 0;
  function demo() {
    const btn = $("demo");
    if (demoTimer) { clearTimeout(demoTimer); demoTimer = 0; btn.textContent = "Demo"; return; }
    const tune = [64, 64, 65, 67, 67, 65, 64, 62];
    let i = 0;
    btn.textContent = "Stop demo";
    const step = () => {
      if (i >= tune.length) { demoTimer = 0; btn.textContent = "Demo"; return; }
      const m = tune[i++];
      pluck(m);
      state.tapUntil = performance.now() + 600;
      noteEvent([m]);
      flash([m]);
      demoTimer = setTimeout(step, 480);
    };
    step();
  }

  // ---------------------------------------------------------------- wiring
  function showMsg(text) { const m = $("msg"); m.textContent = text; m.hidden = !text; }
  $("listen").addEventListener("click", () => (state.listening ? stopListening() : startListening()));
  $("demo").addEventListener("click", demo);
  let noteTimer = 0;
  function clearAll(note) {
    state.history = []; state.melody = []; state.follow = null; state.sounding = [];
    det.held = null; det.chordKey = "";
    render();
    if (note) {
      const hint = $("songHint");
      hint.textContent = note;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { hint.textContent = HINT; }, 2500);
    }
  }
  const HINT = $("songHint").textContent;
  $("clear").addEventListener("click", () => clearAll(""));
  document.querySelectorAll("input[name=mode]").forEach((r) => {
    r.checked = r.value === state.mode;
    r.addEventListener("change", () => { state.mode = r.value; store.set("mode", r.value); det.held = null; det.chordKey = ""; render(); });
  });
  document.querySelectorAll("input[name=names]").forEach((r) => {
    r.checked = r.value === state.names;
    r.addEventListener("change", () => { state.names = r.value; store.set("names", r.value); labelKeys(); render(); });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") ctx.resume();
  });
  let resizeT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { buildKeyboard(); render(); }, 150);
  });
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawStaff);
  }

  buildKeyboard();
  render();
  requestAnimationFrame(() => scrollToKey(60, false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawStaff);
})();
