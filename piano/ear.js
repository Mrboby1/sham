// Recognise the sound: ear training with a deck of cards, turned over one at a time.
// Each card is from one of three categories, each with several kinds of exercise (ear-exercises.js):
//   read   - notes on the staff: play them
//   echo   - the app plays something: play it back (any octave)
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

  // steps: each a list of notes sounded together (a chord rings a little longer)
  function playSteps(steps) {
    const ac = audio();
    const t0 = ac.currentTime + 0.08, gap = 0.62;
    let t = t0, end = t0;
    steps.forEach((step) => {
      const len = step.length > 1 ? 1.4 : 0.85;
      step.forEach((m) => tone(m, t, len));
      end = t + len;
      t += step.length > 1 ? 1.1 : gap;
    });
    const ms = (end - ac.currentTime + 0.25) * 1000;
    deafUntil = performance.now() + ms;
    det.held = null;
    return ms;
  }

  // ---------------------------------------------------------------- the deck
  // Every exercise has an id. The ones already dealt are remembered per level (this phone only), so
  // the deck never deals the same one twice unless asked: "Do again" on the card, or "Start over"
  // (Sham, 2026-11-12: "I don't want to repeat exercises if I don't choose to").
  const EX = window.EarExercises.EX;
  let deck = [], at = -1, right = 0, nextTimer = 0;
  let seen = {};
  try { seen = JSON.parse(store.get("earSeen", "{}")) || {}; } catch (e) { seen = {}; }
  const seenSet = () => new Set(seen[level] || []);
  function markSeen(id) {
    const list = seen[level] || (seen[level] = []);
    if (!list.includes(id)) list.push(id);
    if (list.length > 6000) list.splice(0, list.length - 6000);
    store.set("earSeen", JSON.stringify(seen));
  }
  const used = () => (seen[level] || []).length;

  // games come from a shuffled bag so each category turns up equally often; inside a category the
  // kinds take turns the same way
  let bag = [], kindBags = {}, emptyKinds = new Set();
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function nextKind(cat) {
    const left = EX[cat].filter((k) => !emptyKinds.has(cat + "." + k.key));
    if (!left.length) return null;
    let b = (kindBags[cat] || []).filter((k) => left.includes(k));
    if (!b.length) b = shuffle(left.slice());
    const k = b.pop();
    kindBags[cat] = b;
    return k;
  }
  // a new exercise nobody has seen on this level, or null when every one has been done
  function deal() {
    const cats = games.length ? games : ["read", "echo", "melody"];
    const done = seenSet();
    for (let tries = 0; tries < 40; tries++) {
      if (!bag.length) bag = shuffle(cats.slice());
      const cat = bag.pop();
      const kind = nextKind(cat);
      if (!kind) { if (cats.every((c) => !nextKind(c))) return null; continue; }
      for (let i = 0; i < 300; i++) {
        const e = kind.gen(level, Math.random);
        if (!done.has(e.id) && !deck.some((d) => d.id === e.id)) return fresh({ ...e, type: cat, kind: kind.key, kindName: kind.name });
      }
      emptyKinds.add(cat + "." + kind.key); // every one of this kind is done
    }
    return null;
  }
  const fresh = (e) => ({ again: false, ...e, pos: 0, got: [], misses: 0, done: false, shown: false });
  function newDeck() {
    deck = []; bag = []; kindBags = {}; emptyKinds = new Set();
    at = -1; right = 0;
    turn();
  }
  const card = () => (at >= 0 && at < deck.length ? deck[at] : null);
  function playCard(c) {
    if (!c || !c.play) return;
    audio();
    playSteps(c.play);
  }

  // Turn over the next card (a quarter turn out, swap the face, a quarter turn back in).
  // `repeat`: deal the same exercise again (the "Do again" button).
  function turn(repeat) {
    clearTimeout(nextTimer);
    const el = $("card");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const swap = () => {
      if (repeat && card()) {
        const { pos, got, misses, done, shown, ...e } = card();
        deck.splice(at + 1, deck.length, fresh({ ...e, again: true }));
      } else if (at + 1 >= deck.length) {
        const c = deal();
        if (!c) { el.classList.remove("turning"); drawAllDone(); return; }
        deck.push(c);
        markSeen(c.id);
      }
      at++;
      det.armed = false;
      drawCard();
      el.classList.remove("turning");
      const c = card();
      if (c && c.play) setTimeout(() => { if (card() === c) playCard(c); }, reduce ? 150 : 450);
    };
    if (reduce || at < 0) { swap(); return; }
    el.classList.add("turning");
    setTimeout(swap, 280);
  }

  // ---------------------------------------------------------------- card faces
  // Notes on one staff (treble or bass), side by side, or stacked for a chord.
  function staffSVG(notes, clef, chord) {
    const hs = 6, top = 40, W = 240, H = 150;
    const treble = clef === "treble";
    const topDia = treble ? 38 : 26; // F5 / A3: the top line
    const bottomDia = topDia - 8;
    const dia = (m) => (Math.floor(m / 12) - 1) * 7 + LETTER_STEP[m % 12];
    const y = (d) => top + (topDia - d) * hs;
    const n = notes.length;
    const xs = notes.map((_, i) => (chord ? 150 : n === 1 ? 150 : 82 + (i * (W - 104)) / (n - 1)));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${treble ? "Treble" : "Bass"} staff with ${n === 1 ? "one note" : chord ? "a chord" : n + " notes"}">`;
    for (let i = 0; i < 5; i++) s += `<line class="staffline" x1="6" x2="${W - 6}" y1="${top + i * 2 * hs}" y2="${top + i * 2 * hs}"/>`;
    s += treble
      ? `<text class="clef" x="10" y="${top + 6 * hs + 4}" font-size="66">\u{1D11E}</text>`
      : `<text class="clef" x="12" y="${top + 6 * hs - 2}" font-size="42">\u{1D122}</text>`;
    const sorted = notes.map((m, i) => [m, xs[i]]);
    // in a chord, a note a step above its neighbour sits on the other side of the stem
    const ds = notes.map(dia);
    sorted.forEach(([m, x], i) => {
      const d = ds[i];
      const side = chord && ds.some((o, j) => j !== i && o === d - 1 && notes[j] < m) ? 16 : 0;
      for (let k = bottomDia - 2; k >= d; k -= 2) s += `<line class="staffline" x1="${x - 14}" x2="${x + 14 + side}" y1="${y(k)}" y2="${y(k)}"/>`;
      for (let k = topDia + 2; k <= d; k += 2) s += `<line class="staffline" x1="${x - 14}" x2="${x + 14 + side}" y1="${y(k)}" y2="${y(k)}"/>`;
      if (IS_BLACK[m % 12]) s += `<text class="acc" x="${x - (chord ? 30 + 12 * (i % 2) : n > 3 ? 22 : 30)}" y="${y(d) + 9}"${n > 3 && !chord ? ' font-size="20"' : ""}>♯</text>`;
      s += `<ellipse class="head" cx="${x + side}" cy="${y(d)}" rx="8.4" ry="6" transform="rotate(-20 ${x + side} ${y(d)})"/>`;
    });
    return s + "</svg>";
  }
  // Where the staff sits on the keyboard: both clefs are told from middle Do (C4, the teal dot).
  const exactRead = () => level === "hard";
  const isExact = (c) => c.type === "read" && exactRead();
  function clefHint(c) {
    const mid = fullName(60);
    return c.clef === "treble"
      ? `Treble clef: bottom line = ${fullName(64)}. The teal dot is middle ${nameOf(60)} (${mid}).`
      : `Bass clef: top line = ${fullName(57)}. The teal dot is middle ${nameOf(60)} (${mid}).`;
  }
  const CAT = { read: "Read", echo: "Play back", melody: "Melody" };
  function askOf(c) {
    if (c.type === "read") return c.chord ? "Play this chord" : c.seq.length > 1 ? "Play these notes" : "Play this note";
    if (c.type === "melody") return c.kind === "tune" ? "Repeat the tune" : "Repeat the melody";
    return { fromC: "Play the second note", higher: "Play the higher note", lower: "Play the lower note", two: "Play both notes", chord: "Play the chord's notes" }[c.kind] || "Play the note you hear";
  }
  function sayOf(c) {
    const oct = isExact(c) ? "Play the exact keys." : "Any octave counts.";
    if (c.anyOrder) return `One note at a time, any order. ${oct}`;
    if (c.type === "read") return c.seq.length > 1 ? `Left to right. ${oct}` : isExact(c) ? "Play that exact key." : "Play it on the piano. Any octave counts.";
    if (c.kind === "fromC") return `First you hear ${nameOf(60)}, then a new note. Play the new one.`;
    if (c.kind === "higher" || c.kind === "lower") return `Two notes${c.together ? " together" : ""}. Play the ${c.kind} one. Any octave.`;
    if (c.kind === "tune") return "Listen, then play it back. Do you know it?";
    return c.seq.length > 1 ? "Listen, then play it back. Any octave." : "Listen, then play it. Any octave.";
  }
  function drawCard() {
    const el = $("card"), c = card();
    el.classList.remove("ok");
    el.classList.toggle("has-face", !!c);
    showAnswer(null);
    if (!c) return;
    const face = c.type === "read"
      ? staffSVG(c.staff, c.clef, c.chord)
      : `<button class="ear" id="again" type="button" aria-label="Hear it again">${c.type === "melody" ? "♫" : "♪"}</button>`;
    const dots = c.seq.length > 1 ? `<div class="dots" id="dots">${c.seq.map(() => "<i></i>").join("")}</div>` : "";
    el.innerHTML = `
      <div class="kind">${CAT[c.type]} · ${c.kindName} · card ${at + 1}${c.again ? " · again" : ""}</div>
      <p class="ask">${askOf(c)}</p>
      <div class="face">${face}</div>
      ${dots}
      ${c.type === "read" ? `<p class="hint">${clefHint(c)}</p>` : ""}
      <p class="say" id="say">${sayOf(c)}</p>
      <div class="cardbtns">
        ${c.play ? '<button type="button" id="hear">Hear again</button>' : ""}
        <button type="button" id="show">Show me</button>
        <button type="button" id="redo" title="Deal this exercise again">Do again</button>
        <button type="button" id="next" class="go">Next</button>
      </div>`;
    if ($("again")) $("again").onclick = () => replay();
    if ($("hear")) $("hear").onclick = () => replay();
    $("show").onclick = () => { c.shown = true; c.misses = Math.max(c.misses, 1); reveal(c); };
    $("redo").onclick = () => turn(true);
    $("next").onclick = () => turn();
    updateDots(c);
    updateScore();
  }
  function drawIntro() {
    $("card").classList.remove("has-face");
    const n = used();
    $("card").innerHTML = `
      <div class="kind">Recognise the sound</div>
      <p class="ask">An endless deck</p>
      <p class="intro"><b>Read</b>: notes, sharps, ledger lines, phrases and chords on the staff. <b>Play back</b>: single notes, the higher or lower of two, notes after ${nameOf(60)}, chords. <b>Melody</b>: steps, jumps, scales, black keys and tunes to name. Play on your piano (the app listens) or tap the keys. An exercise you've done isn't dealt again; tap <b>Do again</b> on a card to repeat it.</p>
      <div class="cardbtns"><button type="button" id="start" class="go">Start</button>${n ? `<button type="button" id="reset">Start over (${n} done)</button>` : ""}</div>`;
    $("start").onclick = start;
    if ($("reset")) $("reset").onclick = resetSeen;
  }
  function drawAllDone() {
    $("card").classList.remove("has-face");
    const L = level[0].toUpperCase() + level.slice(1);
    $("card").innerHTML = `
      <div class="kind">${L} level</div>
      <p class="ask">All done!</p>
      <p class="intro">You've done every exercise ${games.length < 3 ? "in the categories you picked " : ""}on ${L}. Try a harder level, or start over to get them all again.</p>
      <div class="cardbtns"><button type="button" id="reset" class="go">Start over</button></div>`;
    $("reset").onclick = () => { resetSeen(); newDeck(); };
    updateScore();
  }
  function resetSeen() {
    if (!confirm(`Forget the ${used()} exercises done on ${level}? They can be dealt again.`)) return;
    seen[level] = [];
    store.set("earSeen", JSON.stringify(seen));
    emptyKinds = new Set();
    if (!deck.length) drawIntro();
    updateScore();
  }
  function updateDots(c) {
    if (!c || c.seq.length < 2 || !$("dots")) return;
    const ds = [...$("dots").children];
    if (c.anyOrder) { ds.forEach((d, i) => { d.className = i < c.got.length ? "done" : ""; }); return; }
    ds.forEach((d, i) => { d.className = i < c.pos ? "done" : i === c.pos && !c.done ? "now" : ""; });
  }
  function updateScore() {
    $("score").textContent = deck.length ? `card ${at + 1} · ${right} right first time · ${used()} done on ${level}` : "";
  }
  function say(text, cls) { const s = $("say"); if (s) { s.textContent = text; s.className = "say" + (cls ? " " + cls : ""); } }
  function replay() { playCard(card()); }
  function reveal(c) {
    showAnswer(c.seq);
    if (c.seq.length > 1) say((c.anyOrder ? "The notes: " : "It goes ") + c.seq.map(fullName).join(" – ") + (c.title ? ` (${c.title})` : "") + ". Play it.", "");
    else say(`It's ${fullName(c.seq[0])}. Play it.`, "");
  }

  // ---------------------------------------------------------------- answers
  const same = (c, m, want) => (isExact(c) ? m === want : pcEq(m, want));
  function answer(m) {
    const c = card();
    if (!c || c.done) return;
    flashHeard(m);
    const el = $("card");
    const shake = () => { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); };
    const name = c.title && c.kind !== "jumps" ? ` (${c.title})` : "";
    if (c.anyOrder) {
      const want = c.seq.filter((x) => !c.got.includes(x));
      const hit = want.find((x) => same(c, m, x));
      if (hit !== undefined) {
        c.got.push(hit);
        updateDots(c);
        if (c.got.length >= c.seq.length) { win(c, "Right! " + c.seq.map(fullName).join(" – ") + name); return; }
        say(`${nameOf(m)} ✓ ${c.got.length} of ${c.seq.length}`, "ok");
        return;
      }
      if (c.got.some((x) => same(c, m, x))) { say(`${nameOf(m)} you already have. ${c.seq.length - c.got.length} to go.`, ""); return; }
      if (isExact(c) && want.some((x) => pcEq(m, x))) { say(`Right note, wrong octave: you played ${fullName(m)}.`, "bad"); shake(); return; }
      miss(c, `${nameOf(m)} isn't in it. Try again.`);
      return;
    }
    if (c.seq.length > 1) {
      const want = c.seq[c.pos];
      if (same(c, m, want)) {
        c.pos++;
        updateDots(c);
        if (c.pos >= c.seq.length) { win(c, "Right! " + c.seq.map(fullName).join(" – ") + name); return; }
        say(`${nameOf(m)} ✓ ${c.pos} of ${c.seq.length}`, "ok");
        return;
      }
      if (isExact(c) && pcEq(m, want)) { say(`Right note, wrong octave: you played ${fullName(m)}.`, "bad"); shake(); return; }
      miss(c, `That was ${nameOf(m)}. Note ${c.pos + 1} is different: try again.`);
      return;
    }
    const target = c.seq[0];
    if (same(c, m, target)) {
      const where = c.type === "read" && m !== target ? ` On the staff it's exactly ${fullName(target)}${target === 60 ? " (middle)" : target > 60 ? ", above middle " + nameOf(60) : ", below middle " + nameOf(60)}.` : "";
      win(c, `Right! That's ${nameOf(target)}.${where}`);
      if (where) showAnswer([target]);
      return;
    }
    if (c.type === "read" && pcEq(m, target)) { say(`Right note, wrong octave: you played ${fullName(m)}. Try the one on the staff.`, "bad"); shake(); return; }
    if (c.type === "echo") {
      if (c.kind === "higher" || c.kind === "lower") {
        const other = c.play.flat().find((x) => x !== target);
        if (pcEq(m, other)) { miss(c, `That's the ${c.kind === "higher" ? "lower" : "higher"} one. Play the other.`); return; }
      }
      // any octave counts, so measure from the nearest octave of the right note: -6..+6 half-steps.
      // Just an arrow, which way to go (Sham, 2026-11-10)
      const d = ((((m - target) % 12) + 18) % 12) - 6;
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
    showAnswer(c.seq);
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
