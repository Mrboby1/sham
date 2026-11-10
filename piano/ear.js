// Recognise the sound: ear training with a deck of cards, turned over one at a time.
// Each card is one of three games:
//   read   - a note on the staff: play that exact key
//   echo   - the app plays one note: play it back (any octave)
//   melody - the app plays a short tune: play it back note by note (any octave)
// It listens through the microphone like the main page (detect.js, and this piano's tuning from
// "Tune to my piano" if it was done), and the keys on screen can be tapped too.
(function () {
  "use strict";
  const { yinPitch, rms, midiToFreq, freqToMidi } = window.Detect;

  const LETTER = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const SOLFEGE = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const LETTER_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const KBD_LO = 48, KBD_HI = 84; // C3 to C6 on screen

  const $ = (id) => document.getElementById(id);
  const store = { // shared with the main page (same "pn." keys)
    get(k, d) { try { return localStorage.getItem("pn." + k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("pn." + k, v); } catch (e) { /* private mode */ } },
  };
  let profile = null;
  try { profile = JSON.parse(store.get("profile", "null")); } catch (e) { profile = null; }
  function offsetAt(m) {
    if (!profile || !profile.points || !profile.points.length) return 0;
    const pts = profile.points;
    if (m <= pts[0][0]) return pts[0][1];
    if (m >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      if (m <= pts[i][0]) { const [m0, c0] = pts[i - 1], [m1, c1] = pts[i]; return c0 + ((c1 - c0) * (m - m0)) / (m1 - m0); }
    }
    return 0;
  }

  let names = store.get("names", "letter");
  let level = store.get("earLevel", "easy");
  let games = (store.get("earGames", "read,echo,melody")).split(",").filter(Boolean);
  const nameOf = (m) => (names === "solfege" ? SOLFEGE : LETTER)[((m % 12) + 12) % 12];
  const fullName = (m) => nameOf(m) + (Math.floor(m / 12) - 1);
  const pcEq = (a, b) => (((a - b) % 12) + 12) % 12 === 0;
  const rand = (n) => Math.floor(Math.random() * n);
  const keys = (lo, hi, whiteOnly) => { const r = []; for (let m = lo; m <= hi; m++) if (!whiteOnly || !IS_BLACK[m % 12]) r.push(m); return r; };

  // What each level asks. Melodies move by scale steps of up to `leap` within `pool`.
  const LEVELS = {
    easy: { read: keys(60, 72, true), echo: keys(60, 67, true), melody: { pool: keys(60, 67, true), len: 3, leap: 2 } },
    medium: { read: keys(43, 79, true), echo: keys(60, 72, true), melody: { pool: keys(60, 72, true), len: 4, leap: 3 } },
    hard: { read: keys(40, 84, false), echo: keys(60, 72, false), melody: { pool: keys(57, 77, true), len: 5, leap: 4 } },
  };
  const KIND = {
    read: { label: "Read", ask: "Play this note" },
    echo: { label: "Play back", ask: "Play the note you hear" },
    melody: { label: "Melody", ask: "Repeat the melody" },
  };

  // ---------------------------------------------------------------- sound
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
  // A plucked-string tone like the main page's, but short, so the mic is free again soon.
  function tone(m, at, len) {
    const ac = audio();
    const t = Math.max(ac.currentTime, at);
    const f = midiToFreq(m) * Math.pow(2, offsetAt(m) / 1200); // in this piano's tuning
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(master);
    [1, 0.5, 0.28, 0.14, 0.08, 0.04].forEach((a, i) => {
      const h = i + 1, fh = f * h * Math.sqrt(1 + 0.0004 * h * h);
      if (fh > 12000) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = fh;
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len / h);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
    });
  }
  let deafUntil = 0; // the mic ignores what it hears while the phone itself is playing
  function playNotes(seq) {
    const ac = audio();
    const t0 = ac.currentTime + 0.08, gap = 0.62, len = 0.85;
    seq.forEach((m, i) => tone(m, t0 + i * gap, len));
    const ms = (0.08 + (seq.length - 1) * gap + len + 0.25) * 1000;
    deafUntil = performance.now() + ms;
    det.held = null;
    return ms;
  }

  // ---------------------------------------------------------------- the deck
  let deck = [], at = -1, right = 0, nextTimer = 0;
  function makeCard(type, prev) {
    const L = LEVELS[level];
    if (type === "melody") {
      const { pool, len, leap } = L.melody;
      let i = Math.floor(pool.length / 4) + rand(Math.ceil(pool.length / 2));
      const seq = [pool[i]];
      while (seq.length < len) {
        let j;
        do { j = i + (rand(2 * leap + 1) - leap); } while (j === i || j < 0 || j >= pool.length);
        i = j;
        seq.push(pool[i]);
      }
      return { type, seq, pos: 0, misses: 0, done: false, shown: false };
    }
    const pool = L[type];
    let m;
    do { m = pool[rand(pool.length)]; } while (prev && prev.target === m && pool.length > 1);
    return { type, target: m, misses: 0, done: false, shown: false };
  }
  // The deck never runs out (Sham, 2026-11-10): the next card is dealt when it's turned. The games
  // come from a shuffled bag, so each one turns up equally often.
  let bag = [];
  function nextType() {
    if (!bag.length) {
      bag = (games.length ? games : ["read", "echo", "melody"]).slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = rand(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return bag.pop();
  }
  function newDeck() {
    deck = []; bag = [];
    at = -1; right = 0;
    turn();
  }
  const card = () => (at >= 0 && at < deck.length ? deck[at] : null);

  // Turn over the next card (a quarter turn out, swap the face, a quarter turn back in).
  function turn() {
    clearTimeout(nextTimer);
    const el = $("card");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const swap = () => {
      if (at + 1 >= deck.length) deck.push(makeCard(nextType(), deck[deck.length - 1]));
      at++;
      det.armed = false;
      drawCard();
      el.classList.remove("turning");
      const c = card();
      if (c && c.type !== "read") setTimeout(() => { if (card() === c) playNotes(c.type === "echo" ? [c.target] : c.seq); }, reduce ? 150 : 450);
    };
    if (reduce || at < 0) { swap(); return; }
    el.classList.add("turning");
    setTimeout(swap, 280);
  }

  // ---------------------------------------------------------------- card faces
  function staffSVG(m) {
    // one staff: treble from middle C up, bass below it
    const hs = 6, top = 40, W = 240, H = 150, x = 150;
    const treble = m >= 60;
    const dia = (Math.floor(m / 12) - 1) * 7 + LETTER_STEP[m % 12];
    const topDia = treble ? 38 : 26; // F5 / A3: the top line
    const y = (d) => top + (topDia - d) * hs;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${treble ? "Treble" : "Bass"} staff with one note">`;
    for (let i = 0; i < 5; i++) s += `<line class="staffline" x1="6" x2="${W - 6}" y1="${top + i * 2 * hs}" y2="${top + i * 2 * hs}"/>`;
    s += treble
      ? `<text class="clef" x="10" y="${top + 6 * hs + 4}" font-size="66">\u{1D11E}</text>`
      : `<text class="clef" x="12" y="${top + 6 * hs - 2}" font-size="42">\u{1D122}</text>`;
    const bottomDia = topDia - 8;
    for (let d = bottomDia - 2; d >= dia; d -= 2) s += `<line class="staffline" x1="${x - 14}" x2="${x + 14}" y1="${y(d)}" y2="${y(d)}"/>`;
    for (let d = topDia + 2; d <= dia; d += 2) s += `<line class="staffline" x1="${x - 14}" x2="${x + 14}" y1="${y(d)}" y2="${y(d)}"/>`;
    if (IS_BLACK[m % 12]) s += `<text class="acc" x="${x - 30}" y="${y(dia) + 9}">♯</text>`;
    s += `<ellipse class="head" cx="${x}" cy="${y(dia)}" rx="8.4" ry="6" transform="rotate(-20 ${x} ${y(dia)})"/>`;
    return s + "</svg>";
  }
  // Where the staff sits on the keyboard: both clefs are told from middle Do (C4, the teal dot).
  const exactRead = () => level === "hard";
  function clefHint(m) {
    const mid = fullName(60);
    return m >= 60
      ? `Treble clef: from middle ${nameOf(60)} (${mid}, the teal dot) up. Bottom line = ${fullName(64)}.`
      : `Bass clef: below middle ${nameOf(60)} (${mid}, the teal dot). Top line = ${fullName(57)}.`;
  }
  function drawCard() {
    const el = $("card"), c = card();
    el.classList.remove("ok");
    el.classList.toggle("has-face", !!c);
    showAnswer(null);
    if (!c) return;
    const k = KIND[c.type];
    let face = "";
    if (c.type === "read") face = staffSVG(c.target);
    else face = `<button class="ear" id="again" type="button" aria-label="Hear it again">${c.type === "echo" ? "♪" : "♫"}</button>`;
    const dots = c.type === "melody" ? `<div class="dots" id="dots">${c.seq.map(() => "<i></i>").join("")}</div>` : "";
    el.innerHTML = `
      <div class="kind">${k.label} · card ${at + 1}</div>
      <p class="ask">${k.ask}</p>
      <div class="face">${face}</div>
      ${dots}
      ${c.type === "read" ? `<p class="hint">${clefHint(c.target)}</p>` : ""}
      <p class="say" id="say">${c.type === "read" ? (exactRead() ? "Play that exact key." : "Play it on the piano. Any octave counts.") : c.type === "echo" ? "Listen, then play it. Any octave." : "Listen, then play it back. Any octave."}</p>
      <div class="cardbtns">
        ${c.type !== "read" ? '<button type="button" id="hear">Hear again</button>' : ""}
        <button type="button" id="show">Show me</button>
        <button type="button" id="next" class="go">Next</button>
      </div>`;
    if ($("again")) $("again").onclick = () => replay();
    if ($("hear")) $("hear").onclick = () => replay();
    $("show").onclick = () => { c.shown = true; c.misses = Math.max(c.misses, 1); reveal(c); };
    $("next").onclick = () => turn();
    updateDots(c);
    updateScore();
  }
  function drawIntro() {
    $("card").classList.remove("has-face");
    $("card").innerHTML = `
      <div class="kind">Recognise the sound</div>
      <p class="ask">An endless deck</p>
      <p class="intro">Each card asks you to <b>read a note</b>, <b>play back a note you hear</b> or <b>repeat a short melody</b>. Play on your piano (the app listens) or tap the keys. Any octave counts, except on Hard "Read" cards (the teal dot is middle ${nameOf(60)}, ${fullName(60)}).</p>
      <div class="cardbtns"><button type="button" id="start" class="go">Start</button></div>`;
    $("start").onclick = start;
  }
  function updateDots(c) {
    if (!c || c.type !== "melody" || !$("dots")) return;
    [...$("dots").children].forEach((d, i) => { d.className = i < c.pos ? "done" : i === c.pos && !c.done ? "now" : ""; });
  }
  function updateScore() {
    $("score").textContent = deck.length ? `card ${at + 1} · ${right} right first time` : "";
  }
  function say(text, cls) { const s = $("say"); if (s) { s.textContent = text; s.className = "say" + (cls ? " " + cls : ""); } }
  function replay() {
    const c = card();
    if (!c || c.type === "read") return;
    audio();
    playNotes(c.type === "echo" ? [c.target] : c.seq);
  }
  function reveal(c) {
    if (c.type === "melody") {
      showAnswer(c.seq);
      say("It goes " + c.seq.map(fullName).join(" – ") + ". Play it back.", "");
    } else {
      showAnswer([c.target]);
      say(`It's ${fullName(c.target)}. Play it.`, "");
    }
  }

  // ---------------------------------------------------------------- answers
  function answer(m) {
    const c = card();
    if (!c || c.done) return;
    flashHeard(m);
    const el = $("card");
    if (c.type === "melody") {
      const want = c.seq[c.pos];
      if (pcEq(m, want)) {
        c.pos++;
        updateDots(c);
        if (c.pos >= c.seq.length) { win(c, "Right! " + c.seq.map(fullName).join(" – ")); return; }
        say(`${nameOf(m)} ✓ ${c.pos} of ${c.seq.length}`, "ok");
        return;
      }
      miss(c, `That was ${nameOf(m)}. Note ${c.pos + 1} is different: try again.`);
      return;
    }
    const ok = c.type === "read" && exactRead() ? m === c.target : pcEq(m, c.target);
    if (ok) {
      const where = m === c.target ? "" : ` On the staff it's exactly ${fullName(c.target)}${c.target === 60 ? " (middle)" : c.target > 60 ? ", above middle " + nameOf(60) : ", below middle " + nameOf(60)}.`;
      win(c, `Right! That's ${nameOf(c.target)}.${where}`);
      if (where) showAnswer([c.target]);
      return;
    }
    if (c.type === "read" && pcEq(m, c.target)) { say(`Right note, wrong octave: you played ${fullName(m)}. Try the one on the staff.`, "bad"); el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); return; }
    if (c.type === "echo") {
      // any octave counts, so measure from the nearest octave of the right note: -6..+6 half-steps.
      // Just an arrow, which way to go (Sham, 2026-11-10)
      const d = ((((m - c.target) % 12) + 18) % 12) - 6;
      miss(c, d === 6 || d === -6 ? "▲▼" : d > 0 ? "▼" : "▲", "arrow", `${d > 0 ? "lower" : "higher"}`);
      return;
    }
    miss(c, `That was ${fullName(m)}. Try again.`);
  }
  function miss(c, text, cls, label) {
    c.misses++;
    const el = $("card");
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
    if (c.misses >= 3 && !c.shown) { c.shown = true; reveal(c); return; }
    say(text, cls || "bad");
    const sEl = $("say");
    if (label && sEl) sEl.setAttribute("aria-label", label); else if (sEl) sEl.removeAttribute("aria-label");
  }
  function win(c, text) {
    c.done = true;
    if (c.misses === 0 && !c.shown) right++;
    $("card").classList.add("ok");
    say(text + (c.misses === 0 && !c.shown ? "" : " (not first time)"), "ok");
    updateScore();
    nextTimer = setTimeout(() => { if (card() === c) turn(); }, text.length > 40 ? 3000 : 1500); // longer when there's more to read
  }

  // ---------------------------------------------------------------- keyboard
  const kbd = $("kbd");
  const keyEls = new Map();
  function buildKeyboard() {
    kbd.innerHTML = "";
    const whites = keys(KBD_LO, KBD_HI, true);
    const w = kbd.clientWidth / whites.length;
    let wi = 0;
    for (let m = KBD_LO; m <= KBD_HI; m++) {
      const el = document.createElement("div");
      const black = IS_BLACK[m % 12] === 1;
      el.className = "key " + (black ? "black" : "white") + (m % 12 === 0 ? " c" : "") + (m === 60 ? " mid" : "");
      el.dataset.midi = m;
      el.innerHTML = `<span class="nm">${m % 12 === 0 ? fullName(m) : nameOf(m)}</span>`;
      if (black) { el.style.left = wi * w - w * 0.31 + "px"; el.style.width = w * 0.62 + "px"; }
      else { el.style.left = wi * w + "px"; el.style.width = w + "px"; wi++; }
      el.setAttribute("aria-label", fullName(m));
      kbd.append(el);
      keyEls.set(m, el);
    }
  }
  kbd.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".key");
    if (!el) return;
    const m = Number(el.dataset.midi);
    tone(m, 0, 0.8);
    deafUntil = Math.max(deafUntil, performance.now() + 900); // don't also hear the phone's own sound
    det.held = null;
    if (!card() && at < 0) return;
    answer(m);
  });
  let heardTimer = 0;
  function flashHeard(m) {
    keyEls.forEach((el) => el.classList.remove("heard"));
    const el = keyEls.get(m) || keyEls.get(KBD_LO + (((m - KBD_LO) % 12) + 12) % 12 + 12);
    if (el) el.classList.add("heard");
    clearTimeout(heardTimer);
    heardTimer = setTimeout(() => keyEls.forEach((x) => x.classList.remove("heard")), 700);
  }
  function showAnswer(list) {
    keyEls.forEach((el) => el.classList.remove("answer"));
    (list || []).forEach((m) => { const el = keyEls.get(m); if (el) el.classList.add("answer"); });
  }

  // ---------------------------------------------------------------- microphone
  let stream = null, analyser = null, timeBuf = null, raf = 0, wake = null;
  // armed: a new card only takes a fresh key press (a strike, or a note after silence), so the last
  // answer still ringing on the piano doesn't answer the next card too.
  const det = { noise: 0.002, env: 0, held: null, cand: null, candN: 0, quiet: 0, lastT: 0, armed: true };
  function showMsg(t) { const m = $("msg"); m.textContent = t; m.hidden = !t; if (t) $("status").querySelector("span").textContent = "No mic: tap the keys"; }
  async function startMic() {
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMsg("This browser can't use the microphone here. You can still tap the keys.");
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (err) {
      showMsg(err && err.name === "NotAllowedError"
        ? "Microphone access is blocked. On iPhone: Settings > Safari > Microphone > Allow, then reload. You can still tap the keys."
        : "Couldn't start the microphone. You can still tap the keys.");
      return false;
    }
    const ac = audio();
    analyser = ac.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    ac.createMediaStreamSource(stream).connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    try { wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
    $("status").classList.add("on");
    $("status").querySelector("span").textContent = "Listening";
    loop();
    return true;
  }
  // One note at a time: a pitch that holds for two checks in a row is a key press; the same key
  // again counts when it is struck again (the level jumps).
  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - det.lastT < 33) return;
    det.lastT = now;
    analyser.getFloatTimeDomainData(timeBuf);
    const sr = ctx.sampleRate;
    const r = rms(timeBuf.subarray(timeBuf.length - 1024));
    det.noise = r < det.noise ? r : det.noise + (r - det.noise) * (r < det.noise * 2 ? 0.003 : 0.00002);
    const gate = Math.max(profile && profile.gate ? profile.gate : 0.004, det.noise * 3);
    const strike = r > gate * 2 && r > det.env * 1.6;
    det.env = Math.max(r, det.env * 0.9);
    if (r < gate) { if (++det.quiet > 4) { det.held = null; det.armed = true; } return; }
    det.quiet = 0;
    if (now < deafUntil) { det.held = null; det.cand = null; det.armed = false; return; }
    if (!det.armed) { if (!strike) return; det.armed = true; det.held = null; det.cand = null; }
    const p = yinPitch(timeBuf, sr);
    if (!p || p.clarity < (profile ? 0.85 : 0.8)) return;
    const raw = freqToMidi(p.freq);
    const fm = raw - offsetAt(raw) / 100;
    const m = Math.round(fm);
    if (m < 24 || m > 108) return;
    if (profile && Math.abs(fm - m) > 0.35) return;
    if (m === det.cand) det.candN++;
    else { det.cand = m; det.candN = 1; }
    if (det.candN >= 2) {
      const isNew = det.candN === 2 && m !== det.held;
      const again = m === det.held && strike;
      det.held = m;
      if (isNew || again) answer(m);
    }
  }

  // ---------------------------------------------------------------- settings and start
  async function start() {
    audio();
    newDeck();
    await startMic();
  }
  document.querySelectorAll('input[name="level"]').forEach((r) => {
    r.checked = r.value === level;
    r.addEventListener("change", () => { level = r.value; store.set("earLevel", level); if (deck.length) newDeck(); });
  });
  document.querySelectorAll('input[name="names"]').forEach((r) => {
    r.checked = r.value === names;
    r.addEventListener("change", () => {
      names = r.value; store.set("names", names); buildKeyboard();
      if (card()) drawCard();
    });
  });
  document.querySelectorAll('.chk input').forEach((b) => {
    b.checked = games.includes(b.value);
    b.addEventListener("change", () => {
      games = [...document.querySelectorAll(".chk input")].filter((x) => x.checked).map((x) => x.value);
      if (!games.length) { b.checked = true; games = [b.value]; }
      store.set("earGames", games.join(","));
      if (deck.length) newDeck();
    });
  });
  window.addEventListener("resize", () => requestAnimationFrame(buildKeyboard));
  buildKeyboard();
  drawIntro();
})();
