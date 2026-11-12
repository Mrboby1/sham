// Piano Notes - screen, microphone loop, keyboard and staff.
(function () {
  "use strict";
  // Falling tiles: a Tiles on/off button while practising (Sham turned them off 2026-11-11, wanted them back
  // 2026-11-12). Either way the keyboard lights only the next key to play.
  let SHOW_ROLL = true;
  const { yinPitch, chordNotes, rms, midiToFreq, freqToMidi, A0, C8 } = window.Detect;
  const { LIBRARY, CLEAR_KEYS } = window.Melody;

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
    practice: null,   // {song, pos}: the piece chosen in Songs and the index of the next note to play
    recording: null,  // notes being recorded for "Record my own", or null
  };

  // ---------------------------------------------------------------- the song library
  // Whole pieces from songs.json (Mutopia Project scores, right-hand melody note by note), the
  // traditional tunes in melody.js, and the player's own recordings (kept on this phone).
  let fullPieces = [];
  let mySongs = [];
  try { mySongs = JSON.parse(store.get("mysongs", "[]")) || []; } catch (e) { mySongs = []; }
  // whistled songs also carry their rhythm: beats (onsets), durs (how long each note was held) and bpm
  mySongs = mySongs.map((x) => ({ title: x.title.replace(/ - My songs$/, ""), notes: x.notes, beats: x.beats, durs: x.durs, bpm: x.bpm }));
  const saveMySongs = () => store.set("mysongs", JSON.stringify(mySongs));
  let SONGS = [];
  // Other names a piece goes by: shown next to the title and found by search
  // (Sham, 2026-11-12: "Add Turkish march" - it was already in as Rondo alla Turca).
  const AKA = {
    "Rondo alla Turca": "Turkish March",
    "Fur Elise": "Für Elise",
    "Eine kleine Nachtmusik, 1st movement": "A Little Night Music",
    "Piano Sonata No. 16 (K. 545), 1st movement": "Sonata facile",
    "Minute Waltz (Op. 64 No. 1)": "Waltz in D flat",
    "Lullaby": "Wiegenlied, Cradle Song",
    "In the Hall of the Mountain King": "Peer Gynt",
    "Spring (Four Seasons)": "La primavera",
    "Traumerei": "Träumerei, Dreaming",
  };
  function buildLibrary() {
    SONGS = [
      ...mySongs.map((x) => ({ title: x.title, composer: "", notes: x.notes, beats: x.beats, durs: x.durs, bpm: x.bpm, mine: true })),
      ...fullPieces.map((x) => ({ title: x.title, composer: x.composer, notes: x.notes, beats: x.beats, chords: x.chords, bpm: x.bpm, left: x.left, leftBeats: x.leftBeats,
        fingers: x.fingers, kind: x.kind || "song", level: x.level || levelOf(x), tip: x.tip, hands: x.hands || (x.chords ? "both" : "right") })),
      ...LIBRARY.filter((x) => !x.mine && !x.title.includes(" - ") && x.title !== "Brahms' Lullaby" /* songs.json has the whole piece */ && !fullPieces.some((f) => f.title === x.title))
        .map((x) => ({ title: x.title, composer: "", notes: x.full, kind: "song", level: "beginner", hands: "right" })),
    ];
    SONGS.forEach((x) => { if (!x.mine && AKA[x.title]) x.aka = AKA[x.title]; x.key = (x.mine ? "mine:" : "") + x.title + (x.composer ? " - " + x.composer : ""); });
  }
  // How hard each piece in songs.json / chords.json is (Sham, 2026-11-10: separate songs by difficulty).
  // lessons.json carries its own level; anything unknown is judged by length.
  const LEVELS = {
    "Lullaby": "beginner",
    "Fur Elise": "intermediate", "Minuet in G": "intermediate", "Prelude in C (Well-Tempered Clavier)": "intermediate",
    "Gymnopedie No. 1": "intermediate", "Prelude Op. 28 No. 4": "intermediate", "Canon in D": "intermediate",
    "Air on the G String": "intermediate", "Piano Sonata No. 16 (K. 545), 1st movement": "intermediate",
    "Moonlight Sonata, 1st movement": "intermediate", "Moody Wind (chords)": "intermediate",
    "Rondo alla Turca": "advanced", "Eine kleine Nachtmusik, 1st movement": "advanced", "Invention No. 1": "advanced",
    "Toccata and Fugue in D minor": "advanced", "Clair de Lune": "advanced", "Arabesque No. 1": "advanced",
    "In the Hall of the Mountain King": "advanced", "The Entertainer": "advanced",
  };
  function levelOf(x) {
    if (LEVELS[x.title]) return LEVELS[x.title];
    const n = (x.notes || []).length;
    return n <= 80 ? "beginner" : n <= 400 ? "intermediate" : "advanced";
  }
  buildLibrary();
  // Private songs: private.json is encrypted (AES-GCM, key from a passphrase via PBKDF2), so only a
  // phone that opened the site once with #key=<passphrase> can read it. The key is then kept on the phone.
  const hashKey = /^#key=(.+)$/.exec(location.hash);
  if (hashKey) {
    store.set("pkey", decodeURIComponent(hashKey[1]));
    history.replaceState(null, "", location.pathname + location.search);
  }
  async function unseal(box, pass) {
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(box.salt), iterations: box.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(box.iv) }, key, bytes(box.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function privateSongs() {
    const pass = store.get("pkey", "");
    if (!pass || !window.crypto || !crypto.subtle) return Promise.resolve([]);
    return fetch("private.json").then((r) => (r.ok ? r.json() : null)).then((box) => (box ? unseal(box, pass) : [])).catch(() => []);
  }
  // songs.json: classical pieces note by note; chords.json: songs played chord by chord; lessons.json:
  // exercises and easy songs, some for both hands (built by tools/make_lessons.js)
  Promise.all([...["songs.json", "chords.json", "lessons.json"].map((f) => fetch(f).then((r) => (r.ok ? r.json() : [])).catch(() => [])), privateSongs()])
    .then(([pieces, chordSongs, lessons, mine]) => {
      fullPieces = [...mine, ...lessons, ...pieces, ...chordSongs];
      buildLibrary();
      if (!$("songs").hidden) buildSongList($("songSearch").value);
    });
  // the keys of step i of a song: a whole chord in a chord song, else the one note
  const stepKeys = (song, i) => (song.chords ? song.chords[i].keys : [song.notes[i]]);
  const pcEq = (a, b) => (((a - b) % 12) + 12) % 12 === 0;

  const octave = (m) => Math.floor(m / 12) - 1;
  const pcName = (m) => (state.names === "solfege" ? SOLFEGE : LETTER)[m % 12];
  const fullName = (m) => pcName(m) + octave(m);
  const otherName = (m) => (state.names === "solfege" ? LETTER : SOLFEGE)[m % 12] + octave(m);

  // ---------------------------------------------------------------- keyboard
  const kbd = $("kbd"), scroller = $("kbdScroll");
  const keys = new Map();
  const whiteIdx = new Map(); // midi -> position in white keys from A0 (black keys halfway)
  const SVGNS = "http://www.w3.org/2000/svg";
  let handSvg = null, keyW = 20;
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
    whiteIdx.clear();
    for (let m = A0; m <= C8; m++) {
      whiteIdx.set(m, IS_BLACK[m % 12] === 1 ? white - 0.5 : white);
      const el = document.createElement("div");
      const black = IS_BLACK[m % 12] === 1;
      el.className = "key " + (black ? "black" : "white") + (m % 12 === 0 ? " c" : "") + (m === A0 ? " clearkey" : "") + (isLeft(m) ? " lh" : "");
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
    keyW = w;
    handSvg = document.createElementNS(SVGNS, "svg");
    handSvg.setAttribute("class", "handover");
    handSvg.setAttribute("aria-hidden", "true");
    kbd.append(handSvg);
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
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // louder for phone speakers (Sham, 2026-11-10): notes go in hot and a soft clipper (tanh)
      // keeps chords from distorting harshly
      master = ctx.createWaveShaper();
      const n = 2048, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5); }
      master.curve = curve; master.oversample = "2x";
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  let master = null;
  function pluck(m) {
    const ac = audio();
    const t = ac.currentTime;
    const f = midiToFreq(m);
    const len = Math.max(0.6, 2.2 - (m - 21) / 50);
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(master);
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
    state.tapUntil = performance.now() + 1000; // the louder tap sound rings longer in the mic
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
  // Left hand = below middle C. When both hands play, the tune is the right hand's top note; a
  // melody played by one hand alone counts wherever it is on the keyboard.
  const SPLIT = 60;
  const isLeft = (m) => m < SPLIT;
  function melodyNote(notes) {
    const right = notes.filter((m) => !isLeft(m));
    return (right.length ? right : notes)[(right.length ? right : notes).length - 1];
  }
  function noteEvent(notes) {
    notes = [...new Set(notes)].sort((a, b) => a - b);
    if (notes.some((n) => CLEAR_KEYS.includes(n))) { clearAll("Cleared."); return; }
    if (state.practice) { playAlong(notes); return; }
    state.history.push({ notes, t: performance.now() });
    if (state.recording) {
      state.recording.push(melodyNote(notes));
      if (state.history.length > 64) state.history.shift();
      return;
    }
    if (state.history.length > 64) state.history.shift();
    // While the right hand is playing, left-hand notes well below it are accompaniment, not the tune
    // (a melody that just dips under middle C still counts).
    const now = performance.now();
    if (notes.some((m) => !isLeft(m))) { state.lastRight = now; state.lastRightNote = melodyNote(notes); }
    else if (now - (state.lastRight || -1e9) < 4000 && notes[notes.length - 1] < state.lastRightNote - 7) { render(); return; }
    // Recognising the piece from what's played is switched off for now (melody.js keeps the code).
    render();
  }

  // Play-following: only the next note of the chosen piece counts. Anything else is ignored: not
  // saved, not drawn on the staff. The note after next is accepted too, so a repeated note the mic
  // heard once, or a fast note it missed, doesn't block the piece.
  function playAlong(notes) {
    const p = state.practice, n = p.song.notes;
    if (p.pos >= n.length) return;
    let step = -1;
    for (let d = 0; d < (p.song.chords ? 1 : 2) && step < 0; d++) {
      if (p.pos + d < n.length && notes.some((m) => pcEq(m, n[p.pos + d]))) step = d;
    }
    if (step < 0) return;
    for (let d = 0; d <= step; d++) state.history.push({ notes: stepKeys(p.song, p.pos + d).slice().sort((a, b) => a - b), t: performance.now() });
    while (state.history.length > 64) state.history.shift();
    p.pos += step + 1;
    state.follow = practiceView();
    render();
    animateRoll();
    if (p.pos < n.length) scrollToKey(n[p.pos]);
  }
  function practiceView() {
    const p = state.practice, n = p.song.notes, c = p.song.chords;
    if (c) {
      // a chord song: every key of the chord to play now lights up at once
      const now = c[Math.min(p.pos, c.length - 1)];
      const done = p.pos >= n.length;
      return {
        title: p.song.title + (p.song.composer ? " - " + p.song.composer : ""),
        at: p.pos, of: n.length, done, chord: true, unit: c.every((x) => x.name) ? "chord" : "step",
        next: done ? [] : now.keys.slice(), fingers: done ? [] : now.fingers.slice(),
        names: c.slice(p.pos, p.pos + 4).map((x) => x.name), section: done ? "" : now.section,
        steps: c.slice(p.pos, p.pos + 4).map((x) => x.keys),
        sure: true, lost: 0, practice: true,
      };
    }
    return {
      title: p.song.title + (p.song.composer ? " - " + p.song.composer : ""),
      at: p.pos, of: n.length, next: n.slice(p.pos, p.pos + 4), done: p.pos >= n.length,
      fingers: (p.song.fingers || []).slice(p.pos, p.pos + 4),
      steps: n.slice(p.pos, p.pos + 4).map((m) => [m]),
      sure: true, lost: 0, practice: true,
    };
  }

  // ---------------------------------------------------------------- microphone loop
  let stream = null, analyser = null, timeBuf = null, freqBuf = null, raf = 0, wake = null;
  const det = { noise: 0.002, env: 0, held: null, cand: null, candN: 0, quiet: 0, lastT: 0, chordKey: "", freq: 0 };
  // Play-along hearing: each key's level over time, keys that just got louder (a hammer strike), and
  // when each key last moved the piece on.
  const hear = { hist: new Map(), pend: new Map() };

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
    // background level: drops fast, rises slowly, and while music plays (well above it) hardly at all:
    // chords ringing under the pedal for minutes must not become "background" and go deaf
    det.noise = r < det.noise ? r : det.noise + (r - det.noise) * (r < det.noise * 2 ? 0.003 : 0.00002);
    const gate = Math.max(profile ? profile.gate : 0.004, det.noise * 3);
    if (cal) { calibrate(r, now, sr); return; }
    const strike = r > gate * 2 && r > det.env * 1.6; // a fresh hammer strike, even on the same key
    det.env = Math.max(r, det.env * 0.9);

    if (r < gate) {
      if (state.practice) practiceHear(now, sr, true);
      if (++det.quiet > 4 && (det.held !== null || state.sounding.length)) {
        det.held = null; det.chordKey = ""; det.freq = 0;
        state.sounding = [];
        render();
      }
      return;
    }
    det.quiet = 0;
    const tapEcho = now < state.tapUntil;
    if (state.practice && !tapEcho) practiceHear(now, sr, false);

    if (state.mode === "single") {
      const p = yinPitch(timeBuf.subarray(timeBuf.length - 4096), sr);
      if (!p || p.clarity < (profile ? 0.85 : 0.8)) return;
      const raw = freqToMidi(p.freq);
      const fm = raw - offsetAt(raw) / 100; // in this piano's own tuning
      const m = Math.round(fm);
      if (m < A0 || m > C8) return;
      if (profile && Math.abs(fm - m) > 0.35) return; // between two of this piano's keys: not a key press
      if (CLEAR_KEYS.includes(m) && !reallyLow(p.freq, sr)) return; // a chord's "missing fundamental"
      det.freq = p.freq;
      det.cents = (fm - m) * 100;
      if (m === det.cand) det.candN++;
      else { det.cand = m; det.candN = 1; }
      const isNew = det.candN === 2 && m !== det.held;
      const again = m === det.held && strike;
      if (det.candN >= 2) {
        det.held = m;
        state.sounding = [m];
        if ((isNew || again) && !tapEcho && (!state.practice || CLEAR_KEYS.includes(m))) noteEvent([m]);
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
        if ((!state.practice || notes.some((c) => CLEAR_KEYS.includes(c))) && (added || strike) && key !== det.chordKey && !tapEcho) noteEvent(notes);
        else if (!state.practice && strike && !tapEcho && key === det.chordKey) noteEvent(notes);
        det.chordKey = key;
        render();
      }
    }
  }

  // Play-along listening. A real piano rings: with the pedal, or just legato, the last notes are
  // still sounding when the next one is struck, and the same key is often struck twice in a row.
  // So the app doesn't ask "which single pitch is loudest". It watches the next few keys of the piece:
  //  - each key's level is measured at its own harmonics over a short window (85 ms), so a strike
  //    shows up as a jump even while that key, or others, are still ringing;
  //  - a jump (x1.4 over its loudest moment 70-200 ms ago: notes ringing together make each other's
  //    level wobble, and a wobble never beats its own peaks), bigger than the jump of the keys
  //    on either side, is a possible strike of that key (a neighbour's strike leaks in, but less);
  //    Its own lowest harmonics must jump too: a note a fifth or an octave away shares some upper
  //    harmonics with it, never the lowest ones;
  //  - 0.1 s later it must still be up (not just the hammer's noise) and the chord finder must hear
  //    that note, in any octave. Then the piece moves on, one note per strike. Only the expected
  //    note, or the one after it, counts; anything else is ignored.
  const HEAR_N = 4096;
  const hann = new Float32Array(HEAR_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (HEAR_N - 1)));
  function keyLevel(m, sr) { // [all of its harmonics, its lowest two that a phone hears]
    const x = timeBuf.subarray(timeBuf.length - HEAR_N);
    const f0 = midiToFreq(m) * Math.pow(2, offsetAt(m) / 1200);
    let sum = 0, low = 0, nLow = 0;
    for (let h = 1; h <= 6; h++) {
      const f = f0 * h;
      if (f > 4500) break;
      if (f < 120) continue; // a phone mic hears little down there; the higher harmonics do the work
      const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < HEAR_N; i++) { const s0 = x[i] * hann[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      const amp = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
      sum += amp;
      if (nLow < 2) { low += amp; nLow++; }
    }
    return [sum, low];
  }
  // The pitch finder can hear a chord's notes as the harmonics of one very low note (D3 F4 A4 sound
  // like the 5th, 12th and 15th harmonics of A#0) and that would clear the piece. A real low key
  // fills its whole run of harmonics; a chord only a few of them.
  function reallyLow(f0, sr) {
    const x = timeBuf.subarray(timeBuf.length - HEAR_N);
    const amps = [];
    for (let h = 3; h <= 14; h++) {
      const w = (2 * Math.PI * f0 * h) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < HEAR_N; i++) { const s0 = x[i] * hann[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      amps.push(Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)));
    }
    const top = Math.max(...amps);
    return amps.filter((a) => a > 0.15 * top).length >= 8;
  }
  // How loud each of the 12 notes is right now: the loudest key of each, C4 to B6, measured at the
  // key's own pitch over the last 170 ms (long enough to tell neighbouring keys apart from C4 up; the
  // left hand's low notes show up there through their octaves).
  const CH_N = 8192;
  const hannCh = new Float32Array(CH_N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (CH_N - 1)));
  function chroma(sr) {
    const x = timeBuf.subarray(timeBuf.length - CH_N);
    const ch = new Array(12).fill(0);
    for (let m = 60; m < 96; m++) {
      const f = midiToFreq(m) * Math.pow(2, offsetAt(m) / 1200);
      const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < CH_N; i++) { const s0 = x[i] * hannCh[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      ch[m % 12] = Math.max(ch[m % 12], Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)));
    }
    return ch;
  }
  function practiceHear(now, sr, quiet) {
    const p = state.practice, n = p.song.notes;
    if (p.pos >= n.length || !analyser) return;
    // a step of a chord or two-hand song with just one key is heard like a melody note (more reliable)
    const stepNow = p.song.chords ? p.song.chords[p.pos] : null;
    const chord = stepNow && new Set(stepNow.keys).size > 1 ? stepNow : null;
    const watch = chord ? [...new Set(chord.keys)] : stepNow ? [stepNow.keys[0]] : [...new Set(n.slice(p.pos, p.pos + 4))];
    const keysNow = new Set();
    for (const m of watch) keysNow.add(m - 1).add(m).add(m + 1);
    const level = new Map(), rise = new Map(), base = new Map(), lowUp = new Map();
    for (const m of keysNow) {
      const [a, l] = quiet ? [0, 0] : keyLevel(m, sr);
      const h = hear.hist.get(m) || [];
      const old = h.slice(0, -2), ready = old.length > 0;
      const lo = ready ? Math.max(...old.map((v) => v[0])) : a;
      const lowLo = ready ? Math.max(...old.map((v) => v[1])) : l;
      level.set(m, a); base.set(m, lo); rise.set(m, ready ? a - lo : 0);
      lowUp.set(m, ready && l > 1.4 * lowLo);
      h.push([a, l]);
      if (h.length > 6) h.shift();
      hear.hist.set(m, h);
    }
    for (const m of watch) {
      const lo = base.get(m), up = rise.get(m);
      if (!hear.pend.has(m) && up > 0 && level.get(m) > 1.4 * lo && lowUp.get(m) && up > rise.get(m - 1) && up > rise.get(m + 1)) {
        hear.pend.set(m, { t: now, base: lo });
      }
    }
    for (const [m, q] of hear.pend) if (now - q.t > 450 || !watch.includes(m)) hear.pend.delete(m);
    if (quiet) return;
    if (chord) {
      // A chord: a fresh strike on any of its keys, still up 0.15 s later. Then how loud each of the 12
      // notes is (C3-B6, any octave): the chord's own notes must all be there (a four-note chord may
      // miss one: a seventh chord played without its 7th still counts), and no other note may be as
      // loud, unless it is still ringing from the chord before. Chords never repeat back to back, so
      // there is no skipping ahead.
      const struck = [...hear.pend].some(([m, q]) => now - q.t >= 150 && level.get(m) >= 1.2 * q.base);
      if (!struck) return;
      const ch = chroma(sr), top = Math.max(...ch);
      const pcs = [...new Set(chord.keys.map((m) => m % 12))];
      // still ringing: the step before, and in a two-hand piece the one before that (a held bass note)
      const prev = new Set(p.song.chords.slice(Math.max(0, p.pos - (p.song.hands === "both" ? 2 : 1)), p.pos).flatMap((c) => c.keys.map((m) => m % 12)));
      const got = pcs.filter((pc) => ch[pc] >= 0.25 * top).length;
      const wrong = ch.some((v, pc) => v >= 0.6 * top && !pcs.includes(pc) && !prev.has(pc));
      if (wrong || got < (pcs.length <= 3 ? pcs.length : pcs.length - 1)) return;
      hear.pend.clear();
      for (const [m, h] of hear.hist) hear.hist.set(m, h.slice(-1));
      playAlong([n[p.pos]]);
      return;
    }
    let sounding = null;
    for (let d = 0; d < (p.song.chords ? 1 : 2); d++) { // no skipping ahead between steps of a chord song
      const want = n[p.pos + d];
      if (want === undefined) break;
      const q = hear.pend.get(want);
      if (!q || now - q.t < 100 || level.get(want) < 1.2 * q.base) continue;
      if (!sounding) {
        analyser.getFloatFrequencyData(freqBuf);
        const mag = new Float32Array(freqBuf.length);
        for (let i = 0; i < mag.length; i++) mag[i] = Math.pow(10, freqBuf[i] / 20);
        sounding = chordNotes(mag, sr * Math.pow(2, -avgOffset() / 1200), analyser.fftSize, { maxNotes: 6, relative: 0.15 }).map((x) => x.midi);
      }
      if (!sounding.some((m) => pcEq(m, want))) continue;
      // One strike, one step: whatever else this strike stirred up doesn't count as well, and every
      // key's next strike is measured from where it is now.
      hear.pend.clear();
      for (const [m, h] of hear.hist) hear.hist.set(m, h.slice(-1));
      playAlong([want]); // moves on to the note after `want`
      return;
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

  // ---------------------------------------------------------------- Songs: practise or record your own
  // Right hand / left hand / both (Sham, 2026-11-12): pieces with a left-hand part (songs.json "left")
  // can be practised by either hand alone, or both together as steps: every key that starts at the same
  // moment in either hand is one step.
  let handPick = store.get("hand", "right");
  SHOW_ROLL = store.get("tiles", "on") === "on";
  function setTiles(on) {
    SHOW_ROLL = on;
    store.set("tiles", on ? "on" : "off");
    $("rollwrap").hidden = !(on && state.practice);
    requestAnimationFrame(() => { buildKeyboard(); renderKeys(); drawRoll(); drawStaff(); });
    animateRoll();
    render();
  }
  const fingerLH = (notes) => window.Fingering.fingerRH(notes.map((m) => 124 - m)); // the keyboard is a mirror image around D
  function partOf(base, hand) {
    if (!base.left || hand === "right") return base;
    base.parts = base.parts || {};
    if (base.parts[hand]) return base.parts[hand];
    const common = { title: base.title, composer: base.composer, kind: base.kind, level: base.level, bpm: base.bpm, key: base.key, base };
    let part;
    if (hand === "left") {
      part = { ...common, notes: base.left, beats: base.leftBeats, fingers: fingerLH(base.left), hands: "left" };
    } else {
      const rf = base.fingers || window.Fingering.fingerRH(base.notes), lf = fingerLH(base.left);
      const at = new Map();
      const add = (m, b, f) => {
        if (!at.has(b)) at.set(b, new Map());
        if (!at.get(b).has(m)) at.get(b).set(m, f);
      };
      base.notes.forEach((m, i) => add(m, base.beats[i], rf[i]));
      base.left.forEach((m, i) => add(m, base.leftBeats[i], lf[i]));
      const beats = [...at.keys()].sort((a, b) => a - b);
      const chords = beats.map((b) => {
        const ks = [...at.get(b)].sort((x, y) => x[0] - y[0]);
        return { name: "", keys: ks.map((k) => k[0]), fingers: ks.map((k) => k[1]), section: "" };
      });
      part = { ...common, notes: chords.map((c) => c.keys[c.keys.length - 1]), beats, chords, hands: "both" };
    }
    base.parts[hand] = part;
    return part;
  }
  function practise(key, hand) {
    const found = SONGS.find((x) => x.key === key);
    if (!found) return;
    if (hand) { handPick = hand; store.set("hand", hand); }
    const song = partOf(found, handPick);
    clearAll("");
    if (!song.fingers) song.fingers = song.chords ? song.chords.map((c) => c.fingers[0]) : window.Fingering.fingerRH(song.notes);
    if (!song.onsets) {
      // onsets in beats (one beat per note when the song has no rhythm) and how long each note lasts
      const b = song.beats && song.beats.length === song.notes.length ? song.beats : song.notes.map((_, i) => i);
      song.onsets = b;
      const longest = song.chords ? 8 : 4;
      // a whistled song keeps the lengths it was whistled with (Sham, 2026-11-11); others: until the next note
      if (!(song.durs && song.durs.length === song.notes.length)) {
        song.durs = b.map((t, i) => (i + 1 < b.length ? Math.max(0.25, Math.min(longest, b[i + 1] - t)) : song.chords ? 4 : 1));
      }
    }
    state.practice = { song, pos: 0, base: found };
    roll.beat = song.onsets[0] - 2; // a short count-in before the first note
    roll.running = true;
    animateRoll();
    state.follow = practiceView();
    closeSongs();
    render();
    scrollToKey(song.notes[0]);
  }
  function openSongs() {
    buildSongList();
    $("songs").hidden = false;
    $("songSearch").value = "";
  }
  function closeSongs() { $("songs").hidden = true; }
  // The list: Songs or Exercises, filtered by level, grouped Beginner / Middle / Advanced (Sham, 2026-11-10).
  // Searching looks through everything. My songs always come first.
  const LEVEL_NAMES = { beginner: "Beginner", intermediate: "Middle", advanced: "Advanced" };
  let libKind = store.get("libKind", "song"), libLevel = store.get("libLevel", "all");
  function buildSongList(filter = "") {
    const list = $("songList");
    list.textContent = "";
    const groups = new Map();
    const q = filter.trim().toLowerCase();
    const order = ["My songs", "Beginner", "Middle", "Advanced"];
    order.forEach((g) => groups.set(g, []));
    for (const s of SONGS) {
      if (q) { if (!(s.title + " " + s.composer + " " + (s.aka || "")).toLowerCase().includes(q)) continue; }
      else if (!s.mine && ((s.kind || "song") !== libKind || (libLevel !== "all" && s.level !== libLevel))) continue;
      if (s.mine && !q && libKind !== "song") continue;
      groups.get(s.mine ? "My songs" : LEVEL_NAMES[s.level] || "Middle").push(s);
    }
    let any = false;
    for (const g of order) {
      const items = groups.get(g);
      if (!items.length) continue;
      any = true;
      const h = document.createElement("h3");
      h.textContent = g;
      list.append(h);
      // exercises keep their written order (they build on each other); songs: both-hands versions next to the tune
      if (libKind === "song" && !q) items.sort((a, b) => a.title.localeCompare(b.title));
      for (const s of items) {
        const row = document.createElement("div");
        row.className = "songrow";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "songbtn";
        const t = document.createElement("span");
        const name = document.createElement("b");
        if (!s.mine) { const dot = document.createElement("i"); dot.className = "lvl " + s.level; name.append(dot); }
        name.append(s.title);
        if (s.aka) { const ak = document.createElement("span"); ak.className = "aka"; ak.textContent = " (" + s.aka + ")"; name.append(ak); }
        if (s.hands === "both") { const bh = document.createElement("span"); bh.className = "both"; bh.textContent = "both hands"; name.append(bh); }
        if (s.hands === "left") { const bh = document.createElement("span"); bh.className = "both"; bh.textContent = "left hand"; name.append(bh); }
        if (s.left) { const bh = document.createElement("span"); bh.className = "both"; bh.textContent = "right + left"; name.append(bh); }
        t.append(name);
        const sub = document.createElement("span");
        sub.className = "tip";
        sub.textContent = s.tip || (s.composer && s.composer !== "Exercise" ? s.composer : "");
        if (sub.textContent) t.append(sub);
        const n = document.createElement("small");
        n.textContent = `${s.notes.length} ${s.chords ? (s.hands === "both" && !s.chords.some((c) => c.name) ? "steps" : "chords") : "notes"}`;
        b.append(t, n);
        b.addEventListener("click", () => practise(s.key));
        row.append(b);
        if (s.mine) {
          const del = document.createElement("button");
          del.type = "button";
          del.className = "ghost delbtn";
          del.textContent = "Delete";
          del.setAttribute("aria-label", "Delete " + s.title);
          del.addEventListener("click", () => {
            if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Sure?"; return; }
            mySongs = mySongs.filter((x) => x.title !== s.title);
            saveMySongs();
            buildLibrary();
            buildSongList($("songSearch").value);
          });
          row.append(del);
        }
        list.append(row);
      }
    }
    if (!any) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = q ? "No piece matches that." : "Nothing at this level yet.";
      list.append(p);
    }
  }
  document.querySelectorAll('input[name="libkind"]').forEach((r) => {
    r.checked = r.value === libKind;
    r.addEventListener("change", () => { libKind = r.value; store.set("libKind", libKind); buildSongList($("songSearch").value); });
  });
  document.querySelectorAll('input[name="liblevel"]').forEach((r) => {
    r.checked = r.value === libLevel;
    r.addEventListener("change", () => { libLevel = r.value; store.set("libLevel", libLevel); buildSongList($("songSearch").value); });
  });
  function startRecording() {
    clearAll("");
    state.recording = [];
    closeSongs();
    $("recName").value = "";
    render();
  }
  function saveRecording() {
    const notes = state.recording || [];
    if (notes.length < 3) return;
    const title = $("recName").value.trim() || "My melody " + (mySongs.length + 1);
    mySongs = mySongs.filter((x) => x.title !== title).concat([{ title, notes }]);
    saveMySongs();
    buildLibrary();
    state.recording = null;
    practise("mine:" + title);
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
      const nm = document.createElement("span");
      nm.textContent = pcName(m);
      if (isLeft(m)) nm.className = "lh";
      big.append(nm);
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
    const next = calKey !== null ? [calKey] : state.follow ? state.follow.next.slice(0, state.follow.chord ? 8 : 1) : []; // only the note to play now
    const allNow = !!(calKey === null && state.follow && state.follow.chord);
    for (const [m, el] of keys) {
      const on = state.sounding.includes(m);
      const ni = next.indexOf(m);
      el.classList.toggle("on", on);
      el.classList.toggle("next", ni >= 0 && !on);
      el.classList.toggle("first", ni === 0 || (allNow && ni >= 0));
      const useFinger = calKey === null && state.follow && state.follow.fingers && keyNums === "finger";
      if (useFinger && ni >= 0) el.style.setProperty("--fc", FINGER_COLORS[state.follow.fingers[ni]]);
      el.querySelector(".ord").textContent = ni < 0 ? "" : calKey !== null ? "♪" : useFinger ? state.follow.fingers[ni] : ni + 1;
    }
    kbd.classList.toggle("fingered", !!(calKey === null && state.follow && state.follow.fingers && keyNums === "finger"));
    renderHandOverlay();
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
    box.querySelectorAll(".title,.chips,.nowtip").forEach((n) => n.remove());
    const rec = $("rec");
    rec.hidden = !state.recording;
    if (state.recording) {
      $("songHint").hidden = true;
      $("recCount").textContent = state.recording.length
        ? `Recording: ${state.recording.length} notes so far.`
        : "Recording. Play your melody.";
      $("recSave").disabled = state.recording.length < 3;
      return;
    }
    $("songHint").hidden = !!f;
    if (!f) return;
    const title = document.createElement("div");
    title.className = "title";
    const [name, composer] = f.title.split(" - ");
    title.textContent = name;
    const small = document.createElement("small");
    small.textContent = (composer ? composer + " · " : "") + (f.done ? "the end"
      : f.chord ? `${f.section ? f.section + " · " : ""}${f.unit} ${f.at + 1} of ${f.of}` : "note " + (f.at + 1) + " of " + f.of);
    title.append(small);
    box.append(title);
    // an exercise's tip: what to watch for
    if (state.practice && state.practice.song.tip && !f.done) {
      const tip = document.createElement("p");
      tip.className = "nowtip";
      tip.textContent = state.practice.song.tip;
      box.append(tip);
    }
    const lock = document.createElement("div");
    lock.className = "chips lockline";
    if (state.practice) {
      const done = f.done || f.at >= f.of;
      lock.textContent = done ? "Finished! " : `${Math.round((f.at / f.of) * 100)}% done · wrong notes are ignored · `;
      const again = document.createElement("button");
      again.type = "button";
      again.className = "linkbtn";
      again.textContent = "Start over";
      again.addEventListener("click", () => practise(state.practice.song.key));
      lock.append(again);
      if (state.practice.base && state.practice.base.left) {
        // which hand: right / left / both
        const pickBox = document.createElement("span");
        pickBox.className = "handpick";
        pickBox.setAttribute("role", "group");
        pickBox.setAttribute("aria-label", "Hand");
        for (const [h, label] of [["right", "Right"], ["left", "Left"], ["both", "Both"]]) {
          const hb = document.createElement("button");
          hb.type = "button";
          hb.textContent = label;
          hb.setAttribute("aria-pressed", String((state.practice.song.hands || "right") === h));
          hb.addEventListener("click", () => practise(state.practice.song.key, h));
          pickBox.append(hb);
        }
        lock.append(pickBox);
      }
      const tiles = document.createElement("button");
      tiles.type = "button";
      tiles.className = "tilesbtn";
      tiles.textContent = "Falling tiles";
      tiles.setAttribute("aria-pressed", String(SHOW_ROLL));
      tiles.addEventListener("click", () => setTiles(!SHOW_ROLL));
      lock.append(tiles);
    } else lock.textContent = !f.sure
      ? "Sounds like this. Keep playing to make sure."
      : f.lost
        ? "Off the melody. Pick it up from the teal keys. If you keep playing something else, it lets go."
        : "Locked on this piece. Play the lowest key (A0) to clear.";
    box.append(lock);
    if (f.chord && f.next.length) {
      // the chord to play now with its keys, then the next chord names
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.setAttribute("aria-label", "Play next");
      f.names.forEach((nm, i) => {
        const c = document.createElement("span");
        c.className = "chip";
        // a named chord shows its name (and its keys for the one to play now); a step of a two-hand piece shows its keys
        const ks = (f.steps[i] || []).slice().sort((a, b) => a - b).map(fullName).join(" ");
        c.textContent = nm ? (i ? nm : nm + ": " + ks) : ks;
        chips.append(c);
      });
      box.append(chips);
    } else if (f.next.length) {
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.setAttribute("aria-label", "Play next");
      f.next.forEach((m, i) => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = fullName(m) + (f.fingers ? " · " + f.fingers[i] : "");
        if (f.fingers && keyNums === "finger") { c.classList.add("fchip"); c.style.setProperty("--fc", FINGER_COLORS[f.fingers[i]]); }
        chips.append(c);
      });
      box.append(chips);
    }
    renderHand();
    renderRollControls();
  }

  // ---------------------------------------------------------------- falling notes
  // A waterfall above the keyboard: every note is a bar over its own key, as long as it is held,
  // in its finger's colour with the finger number. The bottom edge is "now". It waits for the player:
  // when the right note is played, everything slides down to the next one.
  const rollCanvas = $("roll");
  // Time runs at the tempo times the speed %, and stops at the next note until it is played
  // ("wait for me"). Paused, the waterfall just steps to the next note as it is played.
  const BPM = 80;
  const roll = { beat: 0, raf: 0, running: true, last: 0 };
  let speed = Math.max(20, Math.min(150, Number(store.get("speed", "60")) || 60));
  function rollTarget() {
    const p = state.practice;
    if (!p) return 0;
    const o = p.song.onsets;
    return p.pos < o.length ? o[p.pos] : o[o.length - 1] + p.song.durs[o.length - 1];
  }
  function animateRoll() {
    if (!SHOW_ROLL || roll.raf) return; // off, or already running
    roll.last = performance.now();
    roll.raf = requestAnimationFrame(rollFrame);
  }
  function rollFrame(now) {
    const p = state.practice;
    if (!p) { roll.raf = 0; return; }
    const dt = Math.min(0.1, (now - roll.last) / 1000); // a hidden tab doesn't jump ahead
    roll.last = now;
    const target = rollTarget();
    if (roll.drag) {
      // a finger is on the waterfall: it follows the finger, nothing else moves it
    } else if (roll.running) {
      // at the end there is nothing to wait for: run out to the last note's end
      roll.beat = Math.min(target, roll.beat + dt * ((p.song.bpm || BPM) / 60) * (speed / 100));
    } else {
      const d = target - roll.beat;
      roll.beat = Math.abs(d) < 0.002 || reduceMotion() ? target : roll.beat + d * 0.22;
    }
    drawRoll();
    roll.raf = requestAnimationFrame(rollFrame);
  }
  function renderRollControls() {
    const ctl = $("rollctl");
    ctl.hidden = !(SHOW_ROLL && state.practice);
    $("rollPlay").textContent = roll.running ? "Pause" : "Play";
    $("rollPlay").setAttribute("aria-pressed", String(!roll.running));
    $("speed").value = speed;
    $("speedOut").textContent = speed + "%";
  }
  function drawRoll() {
    const p = state.practice;
    const dpr = window.devicePixelRatio || 1;
    const Wc = rollCanvas.clientWidth, Hc = rollCanvas.clientHeight;
    if (!p || !Wc || !Hc) return;
    if (rollCanvas.width !== Math.round(Wc * dpr) || rollCanvas.height !== Math.round(Hc * dpr)) {
      rollCanvas.width = Math.round(Wc * dpr); rollCanvas.height = Math.round(Hc * dpr);
    }
    const g = rollCanvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, Wc, Hc);
    const css = getComputedStyle(document.documentElement);
    const lineC = css.getPropertyValue("--line").trim(), muted = css.getPropertyValue("--muted").trim();
    const dx = kbd.getBoundingClientRect().left - rollCanvas.getBoundingClientRect().left;
    // faint guides at every C, so a bar can be traced down to its key
    g.strokeStyle = lineC; g.lineWidth = 1;
    for (const [m, el] of keys) {
      if (m % 12 !== 0) continue;
      const x = Math.round(dx + el.offsetLeft) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hc); g.stroke();
    }
    const { notes, onsets, durs, fingers } = p.song;
    // pixels per beat: the piece's typical note gets a bar about 24px tall, and at least ~4 notes show
    if (!p.song.medDur) { const d = durs.slice().sort((x, y) => x - y); p.song.medDur = d[Math.floor(d.length / 2)] || 1; }
    const ppb = Math.max(Hc / 5, Math.min(Hc / 1.2, 24 / p.song.medDur));
    roll.ppb = ppb;
    // The "now" line sits a little above the keys (Sham, 2026-11-12), so the note just played stays in
    // sight below it as a reference for where the hand was.
    const base = Hc - Math.round(Math.min(70, Math.max(40, Hc * 0.24)));
    g.fillStyle = lineC; g.globalAlpha = 0.35; g.fillRect(0, base, Wc, Hc - base); g.globalAlpha = 1;
    const font = getComputedStyle(document.body).fontFamily;
    for (let i = Math.max(0, p.pos - 4); i < notes.length; i++) {
      const bottom = base - (onsets[i] - roll.beat) * ppb;
      if (bottom < 0) break;
      const top = bottom - durs[i] * ppb + 2;
      if (top > Hc) continue;
      const ks = stepKeys(p.song, i);
      for (let j = 0; j < ks.length; j++) {
      const el = keys.get(ks[j]);
      if (!el) continue;
      const fi = p.song.chords ? p.song.chords[i].fingers[j] : fingers[i];
      const x = dx + el.offsetLeft + 1, w = el.offsetWidth - 2;
      const color = FINGER_COLORS[fi] || muted;
      g.globalAlpha = i < p.pos - 1 ? 0.2 : i === p.pos - 1 ? 0.6 : 1; // the last note played stays clear
      g.fillStyle = color;
      const r = Math.min(5, w / 2, (bottom - top) / 2);
      g.beginPath();
      g.roundRect ? g.roundRect(x, top, w, bottom - top - 1, r) : g.rect(x, top, w, bottom - top - 1);
      g.fill();
      if (i === p.pos) { g.strokeStyle = "#000"; g.lineWidth = 3; g.stroke(); g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke(); }
      if (bottom - top > 14 && w >= 9) {
        g.fillStyle = "#fff";
        g.font = `700 ${Math.max(9, Math.min(13, w * 0.75))}px ${font}`;
        g.textAlign = "center";
        g.fillText(String(fi), x + w / 2, bottom - 6);
        g.textAlign = "start";
      }
      g.globalAlpha = 1;
      }
      if (p.song.chords) {
        // the chord's name, left of its right-hand bars
        const lowRH = keys.get(ks[0]);
        if (lowRH) {
          g.globalAlpha = i < p.pos ? 0.25 : 1;
          g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
          g.font = `700 13px ${font}`;
          g.textAlign = "right";
          g.fillText(p.song.chords[i].name, dx + lowRH.offsetLeft - 4, Math.max(14, bottom - 6));
          g.textAlign = "start";
          g.globalAlpha = 1;
        }
      }
    }
    // the "now" line where the bars meet the keys
    g.fillStyle = muted;
    g.fillRect(0, base - 1, Wc, 2);
  }

  // Swipe the waterfall up to go back to notes already passed (or missed), down to skip ahead
  // (Sham, 2026-11-12). The bars follow the finger; the note sitting on the "now" line becomes the
  // next one to play, and the keyboard lights it up straight away.
  function posAtBeat(b) {
    const o = state.practice.song.onsets;
    let lo = 0, hi = o.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (o[mid] < b) lo = mid + 1; else hi = mid; }
    return lo > 0 && b - o[lo - 1] < o[lo] - b ? lo - 1 : lo;
  }
  function setPos(i) {
    const p = state.practice;
    if (i === p.pos) return;
    p.pos = i;
    state.follow = practiceView();
    render();
  }
  rollCanvas.addEventListener("pointerdown", (e) => {
    if (!state.practice || roll.drag) return;
    roll.drag = { id: e.pointerId, y: e.clientY, beat: roll.beat, moved: false };
    try { rollCanvas.setPointerCapture(e.pointerId); } catch {}
  });
  rollCanvas.addEventListener("pointermove", (e) => {
    const d = roll.drag, p = state.practice;
    if (!d || d.id !== e.pointerId || !p) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return; // a tap is not a swipe
    d.moved = true;
    const o = p.song.onsets;
    roll.beat = Math.max(o[0] - 2, Math.min(o[o.length - 1], d.beat + dy / (roll.ppb || 24)));
    setPos(posAtBeat(roll.beat));
    drawRoll();
  });
  function endDrag(e) {
    const d = roll.drag;
    if (!d || d.id !== e.pointerId) return;
    roll.drag = null;
    const p = state.practice;
    if (d.moved && p) {
      setPos(posAtBeat(roll.beat));
      if (p.pos < p.song.notes.length) scrollToKey(p.song.notes[p.pos]);
    }
    animateRoll(); // eases onto the chosen note
  }
  rollCanvas.addEventListener("pointerup", endDrag);
  rollCanvas.addEventListener("pointercancel", endDrag);

  // ---------------------------------------------------------------- the hand picture
  const FINGER_NAMES = ["", "thumb", "index finger", "middle finger", "ring finger", "little finger"];
  const FINGER_COLORS = ["", "#e93d82", "#f76b15", "#29a383", "#3e63dd", "#8e4ec6"]; // pink orange green blue violet

  // A small hand hovering over the keyboard: each fingertip rests on the key that finger covers in
  // the current hand position (the upcoming notes' own keys where they fall inside it).
  function renderHandOverlay() {
    if (!handSvg) return;
    const f = state.follow;
    const show = !!(state.practice && f && f.fingers && f.fingers.length && keyNums === "finger" && !cal);
    if (!show) { handSvg.textContent = ""; return; }
    const H = kbd.clientHeight, w = keyW;
    // the left hand is a mirror image: its thumb is on the right (left-hand exercises, and the left
    // hand's turn in a two-hand piece)
    const song = state.practice.song;
    const lefty = song.hands === "left" || (song.hands === "both" && isLeft(f.next[0]));
    const dir = lefty ? -1 : 1;
    const thumb = Math.round(whiteIdx.get(f.next[0]) - dir * (f.fingers[0] - 1));
    const tips = [null];
    for (let i = 1; i <= 5; i++) tips.push({ x: (thumb + dir * (i - 1)) * w + w / 2, black: false });
    const placed = new Set();
    f.next.forEach((m, j) => {
      const fj = f.fingers[j];
      if (placed.has(fj) || !keys.has(m)) return;
      if (song.hands === "both" && f.chord && isLeft(m) !== lefty) return; // the other hand's key
      if (Math.abs(whiteIdx.get(m) - (thumb + dir * (fj - 1))) > 1.01) return; // outside this hand position
      const el = keys.get(m);
      tips[fj] = { x: el.offsetLeft + el.offsetWidth / 2, black: IS_BLACK[m % 12] === 1 };
      placed.add(fj);
    });
    const x0 = tips[1].x;
    const r = Math.max(5, Math.min(10, w * 0.5));
    const palmTop = 2, palmH = Math.max(12, H * 0.13);
    const xs = tips.slice(1).map((t) => t.x - x0);
    let g = handSvg.querySelector("g");
    if (!g) { g = document.createElementNS(SVGNS, "g"); handSvg.append(g); }
    const parts = [];
    // no palm bar: it hid the tops of the keys (Sham, 2026-11-09). The fingers start where it was.
    for (let i = 1; i <= 5; i++) {
      const t = tips[i], x = t.x - x0;
      const y = t.black ? H * 0.36 : H * 0.56;
      const next = f.chord ? f.fingers.some((fi, j) => fi === i && isLeft(f.next[j]) === lefty) : f.fingers[0] === i;
      parts.push(`<line x1="${x}" y1="${palmTop + palmH - 2}" x2="${x}" y2="${y}" stroke="${FINGER_COLORS[i]}" stroke-width="${Math.max(3, r * 0.55)}" stroke-linecap="round"/>`);
      parts.push(`<circle cx="${x}" cy="${y}" r="${next ? r + 2 : r}" fill="${FINGER_COLORS[i]}" stroke="#fff" stroke-width="${next ? 2.5 : 1.5}"/>`);
      parts.push(`<text x="${x}" y="${y}" dy="0.35em" font-size="${Math.round(r * 1.15)}">${i}</text>`);
    }
    g.innerHTML = parts.join("");
    g.style.transform = `translateX(${x0}px)`;
  }
  let keyNums = store.get("keynums", "finger");
  function renderHand() {
    const f = state.follow;
    const show = !!(state.practice && f && f.fingers && f.fingers.length);
    $("handbox").hidden = !show;
    const playing = !!state.practice;
    if (document.body.classList.contains("playing") !== playing) {
      document.body.classList.toggle("playing", playing);
      $("rollwrap").hidden = !(SHOW_ROLL && playing);
      requestAnimationFrame(() => { buildKeyboard(); renderKeys(); drawRoll(); drawStaff(); });
    }
    document.querySelector(".now").classList.toggle("practising", show);
    if (!show) return;
    const finger = f.fingers[0];
    document.querySelectorAll("#hand .finger").forEach((el) => el.classList.toggle("on", Number(el.dataset.f) === finger));
    if (f.chord) {
      const rh = f.next.map((m, j) => [m, f.fingers[j]]).filter(([m]) => !isLeft(m));
      const lh = f.next.filter(isLeft);
      // steps of a two-hand piece have no chord name; an empty hand is left out
      const parts = [];
      if (rh.length) parts.push(`right hand ${rh.map(([m]) => fullName(m)).join(" ")} (finger${rh.length > 1 ? "s" : ""} ${rh.map((x) => x[1]).join(" ")})`);
      if (lh.length) parts.push(`left hand ${lh.map(fullName).join(" ")}`);
      $("handText").textContent = (f.names[0] ? f.names[0] + ": " : "Next: ") + parts.join(", ") + ".";
      return;
    }
    $("handText").textContent = `Next: ${fullName(f.next[0])} with finger ${finger}, your ${FINGER_NAMES[finger]}.`;
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
    const red = css.getPropertyValue("--lh").trim();
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
    const next = state.follow ? (state.follow.steps || state.follow.next.map((m) => [m])).slice(0, 4) : [];
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
      ev.notes.forEach((m) => head(x, m, isLeft(m) ? red : newest ? brass : ink, false, alpha));
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
      const fingersNext = state.follow && state.follow.fingers ? state.follow.fingers : null;
      next.forEach((step, i) => {
        const x = x0 + 8 + i * colW;
        step.forEach((k) => head(x, k, teal, true, 1 - i * 0.22));
        const m = step[0];
        if (state.follow.chord) {
          g.fillStyle = teal;
          g.font = "700 11px " + getComputedStyle(document.body).fontFamily;
          g.textAlign = "center";
          g.fillText(state.follow.names[i] || "", x, trebleTop - 6);
          g.textAlign = "start";
          return;
        }
        if (fingersNext) {
          g.fillStyle = FINGER_COLORS[fingersNext[i]] || teal;
          g.font = "700 12px " + getComputedStyle(document.body).fontFamily;
          g.textAlign = "center";
          g.fillText(String(fingersNext[i]), x, Math.min(place(m).y - 12, trebleTop - 6));
          g.textAlign = "start";
        }
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
      state.tapUntil = performance.now() + 1000; // the louder tap sound rings longer in the mic
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
    state.practice = null; state.recording = null;
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
  $("songsBtn").addEventListener("click", openSongs);
  $("rollPlay").addEventListener("click", () => { roll.running = !roll.running; renderRollControls(); animateRoll(); });
  $("speed").addEventListener("input", (e) => {
    speed = Number(e.target.value);
    store.set("speed", String(speed));
    $("speedOut").textContent = speed + "%";
  });
  document.querySelectorAll("input[name=keynums]").forEach((r) => {
    r.checked = r.value === keyNums;
    r.addEventListener("change", () => { keyNums = r.value; store.set("keynums", r.value); render(); });
  });
  // Copy what was played (names with octaves, both naming styles) to paste into a chat.
  $("copyNotes").addEventListener("click", async () => {
    const seq = state.history.map((h) => h.notes.map((m) => LETTER[m % 12] + octave(m)).join("+"));
    const btn = $("copyNotes");
    if (!seq.length) { btn.textContent = "Play something first"; setTimeout(() => (btn.textContent = "Copy the notes I played"), 1800); return; }
    const text = "Notes I played: " + seq.join(" ");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = `Copied ${seq.length} notes`;
    } catch (e) {
      showMsg(text); // clipboard refused: show it so it can be selected and copied by hand
      btn.textContent = "Select the notes above to copy";
    }
    setTimeout(() => (btn.textContent = "Copy the notes I played"), 2500);
  });
  $("songsClose").addEventListener("click", closeSongs);
  $("songSearch").addEventListener("input", (e) => buildSongList(e.target.value));
  $("recStart").addEventListener("click", startRecording);
  $("recSave").addEventListener("click", saveRecording);
  $("recCancel").addEventListener("click", () => clearAll(""));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("songs").hidden) closeSongs(); });
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
    resizeT = setTimeout(() => { buildKeyboard(); render(); drawRoll(); }, 150);
  });
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawStaff);
  }

  buildKeyboard();
  render();
  requestAnimationFrame(() => scrollToKey(60, false));
  // piano.html#practise=<song key>: open a song straight away (the Whistle page links here after saving)
  const hashSong = /^#practise=(.+)$/.exec(location.hash);
  if (hashSong) {
    history.replaceState(null, "", location.pathname + location.search);
    practise(decodeURIComponent(hashSong[1]));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawStaff);
})();
