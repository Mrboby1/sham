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

  // ---------------------------------------------------------------- this piano's tuning profile
  // {gate, points: [[midi, cents], ...]} measured by "Tune to my piano". Pianos drift from standard
  // pitch, and differently in bass and treble, so each measured C gets its own offset and the keys in
  // between are interpolated.
  let profile = null;
  try { profile = JSON.parse(store.get("profile", "null")); } catch (e) { profile = null; }
  function offsetAt(m) {
    if (!profile || !profile.points.length) return 0;
    const pts = profile.points;
    if (m <= pts[0][0]) return pts[0][1];
    if (m >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (m <= pts[i][0]) {
        const [m0, c0] = pts[i - 1], [m1, c1] = pts[i];
        return c0 + ((c1 - c0) * (m - m0)) / (m1 - m0);
      }
    }
    return 0;
  }
  const avgOffset = () => (profile && profile.points.length ? profile.points.reduce((s, p) => s + p[1], 0) / profile.points.length : 0);

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
    if (cal) endCalibration(false);
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
    const gate = Math.max(profile ? profile.gate : 0.004, det.noise * 3);
    if (cal) { calibrate(r, now, sr); return; }
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
      if (!p || p.clarity < (profile ? 0.85 : 0.8)) return;
      const raw = freqToMidi(p.freq);
      const fm = raw - offsetAt(raw) / 100; // in this piano's own tuning
      const m = Math.round(fm);
      if (m < A0 || m > C8) return;
      if (profile && Math.abs(fm - m) > 0.35) return; // between two of this piano's keys: not a key press
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
      // a piano tuned sharp or flat shifts every harmonic: tell the detector by scaling the bin width
      const notes = chordNotes(mag, sr * Math.pow(2, -avgOffset() / 1200), analyser.fftSize).filter((n) => n.strength >= 0.3).map((n) => n.midi).sort((a, b) => a - b);
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

  // ---------------------------------------------------------------- "Tune to my piano"
  const CAL_KEYS = [36, 48, 60, 72, 84, 96]; // C2 .. C7, one per octave
  let cal = null; // {step: "quiet"|"keys"|"done", t0, noiseMax, idx, samples, points}

  async function startCalibration() {
    if (!state.listening) await startListening();
    if (!state.listening) return; // mic refused; startListening showed why
    cal = { step: "quiet", t0: performance.now(), noiseMax: 0, idx: 0, samples: [], points: [] };
    $("cal").hidden = false;
    renderCal();
  }
  function endCalibration(save) {
    if (save && cal) {
      const gate = Math.max(0.003, cal.noiseMax * 2.5);
      profile = { gate, points: cal.points.slice().sort((a, b) => a[0] - b[0]), when: new Date().toISOString().slice(0, 10) };
      store.set("profile", JSON.stringify(profile));
    }
    cal = null;
    $("cal").hidden = true;
    render();
  }
  function calibrate(r, now, sr) {
    if (cal.step === "quiet") {
      cal.noiseMax = Math.max(cal.noiseMax, r);
      if (now - cal.t0 > 2000) { cal.step = "keys"; renderCal(); }
      return;
    }
    if (cal.step !== "keys") return;
    const target = CAL_KEYS[cal.idx];
    const gate = Math.max(0.003, cal.noiseMax * 2.5);
    if (r < gate) return;
    const p = yinPitch(timeBuf.subarray(timeBuf.length - 4096), sr);
    if (!p || p.clarity < 0.85) return;
    const cents = (freqToMidi(p.freq) - target) * 100;
    if (Math.abs(cents) > 150) return; // not the key we asked for (or a harmonic)
    cal.samples.push(cents);
    if (cal.samples.length >= 12) {
      const s = cal.samples.slice().sort((a, b) => a - b);
      cal.points.push([target, s[Math.floor(s.length / 2)]]);
      nextCalKey();
    } else renderCal();
  }
  function nextCalKey() {
    cal.samples = [];
    cal.idx++;
    if (cal.idx >= CAL_KEYS.length) cal.step = "done";
    renderCal();
  }
  function renderCal() {
    if (!cal) return;
    const t = $("calText"), prog = $("calProg");
    $("calSkip").hidden = cal.step !== "keys";
    $("calSave").hidden = cal.step !== "done";
    if (cal.step === "quiet") {
      t.textContent = "Step 1 of 2: stay quiet for 2 seconds while it listens to the room.";
      prog.textContent = "";
    } else if (cal.step === "keys") {
      const m = CAL_KEYS[cal.idx];
      t.textContent = `Step 2 of 2: play ${fullName(m)} (the teal key) and hold it for a second.`;
      prog.textContent = `Key ${cal.idx + 1} of ${CAL_KEYS.length}` + (cal.samples.length ? ` · hearing it ${Math.round((cal.samples.length / 12) * 100)}%` : "");
      scrollToKey(m);
    } else {
      const pts = cal.points;
      if (!pts.length) {
        t.textContent = "No keys were measured. Make sure the mic can hear the piano, then try again.";
      } else {
        const avg = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const word = Math.abs(avg) < 5 ? "in tune with standard pitch" : `${Math.abs(Math.round(avg))} cents ${avg > 0 ? "sharp (high)" : "flat (low)"}`;
        t.textContent = `Done. Your piano is ${word} on average. ` + pts.map((p) => `${fullName(p[0])} ${p[1] >= 0 ? "+" : ""}${Math.round(p[1])}`).join(", ") + ".";
      }
      prog.textContent = "";
      $("calSave").hidden = !pts.length;
    }
    renderKeys();
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
    const calKey = cal && cal.step === "keys" ? CAL_KEYS[cal.idx] : null;
    const next = calKey !== null ? [calKey] : state.follow ? state.follow.next.slice(0, 3) : [];
    for (const [m, el] of keys) {
      const on = state.sounding.includes(m);
      const ni = next.indexOf(m);
      el.classList.toggle("on", on);
      el.classList.toggle("next", ni >= 0 && !on);
      el.querySelector(".ord").textContent = ni < 0 ? "" : calKey !== null ? "♪" : ni + 1;
    }
    const tuned = $("tuned");
    tuned.hidden = !profile;
    if (profile) {
      const a = Math.round(avgOffset());
      tuned.textContent = "Tuned to your piano" + (a ? ` (${a > 0 ? "+" : ""}${a}¢)` : "");
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
    lock.textContent = !f.sure
      ? "Sounds like this. Keep playing to make sure."
      : f.lost
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
    // the staff is drawn for a 206px-tall box and scaled to fit (smaller in widescreen)
    const k = H / 206;
    g.scale(k, k);
    W = W / k; H = 206;
    const showNames = k >= 0.8; // when the staff is small the names would be unreadable (the big name shows them)
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim(), muted = css.getPropertyValue("--muted").trim();
    const brass = css.getPropertyValue("--brass").trim(), teal = css.getPropertyValue("--teal").trim();
    const line = css.getPropertyValue("--line").trim();

    const hs = 4.5;                 // half a staff space
    const trebleTop = 42;            // F5 line (room above for 8va notes)
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
      if (showNames) g.fillText(pcName(ev.notes[ev.notes.length - 1]), x, H - 6);
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
        if (showNames) g.fillText(pcName(m), x, H - 6);
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
  $("tune").addEventListener("click", startCalibration);
  $("calCancel").addEventListener("click", () => endCalibration(false));
  $("calSkip").addEventListener("click", () => cal && nextCalKey());
  $("calSave").addEventListener("click", () => endCalibration(true));
  $("calReset").addEventListener("click", () => {
    profile = null;
    store.set("profile", "null");
    endCalibration(false);
  });
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
