// The Ear page's exercises (Sham, 2026-11-12: "add a bunch of exercises to each category").
// Pure functions, so node can test them. Each category has several kinds; each kind's gen(level, rand)
// deals one exercise:
//   id       unique per exercise, so the page can remember what was done and not deal it again
//   seq      the notes to play, in order (or in any order when anyOrder)
//   exact    the octave must match (else any octave counts)
//   staff    notes drawn on the staff (read cards), clef "treble" | "bass", chord = stacked
//   play     what the app plays (echo / melody cards): a list of steps, each step a list of notes sounded together
//   answer   for the higher/lower cards: only this note is asked for
//   title    shown when it's solved (tune names)
(function (root) {
  "use strict";
  const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const range = (lo, hi, f) => { const r = []; for (let m = lo; m <= hi; m++) if (!f || f(m)) r.push(m); return r; };
  const white = (lo, hi) => range(lo, hi, (m) => !IS_BLACK[m % 12]);
  const black = (lo, hi) => range(lo, hi, (m) => IS_BLACK[m % 12] === 1);
  const pick = (a, rand) => a[Math.floor(rand() * a.length)];
  const by = (lv, e, m, h) => (lv === "easy" ? e : lv === "medium" ? m : h);

  // a walk through `pool` (sorted): moves of 1..leap places, no note twice in a row
  function walk(pool, len, leap, rand) {
    let i = Math.floor(pool.length / 4) + Math.floor(rand() * Math.ceil(pool.length / 2));
    const seq = [pool[i]];
    while (seq.length < len) {
      let j;
      do { j = i + (Math.floor(rand() * (2 * leap + 1)) - leap); } while (j === i || j < 0 || j >= pool.length);
      i = j;
      seq.push(pool[i]);
    }
    return seq;
  }
  const clefOf = (notes) => { const s = notes.slice().sort((a, b) => a - b); return s[s.length >> 1] >= 60 ? "treble" : "bass"; };

  // triads: [root offset name, intervals]
  const MAJ = [0, 4, 7], MIN = [0, 3, 7];
  const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const chordName = (root, q) => NAMES[root % 12] + (q === MIN ? "m" : "");
  function chordsFor(level) {
    if (level === "easy") return [[60, MAJ], [65, MAJ], [67, MAJ]];
    if (level === "medium") return [[60, MAJ], [62, MIN], [64, MIN], [65, MAJ], [67, MAJ], [69, MIN], [48, MAJ], [53, MAJ], [55, MAJ], [57, MIN]];
    const r = [];
    for (let root = 48; root <= 71; root++) { r.push([root, MAJ]); r.push([root, MIN]); }
    return r;
  }
  // inversion 0/1/2: the lowest notes move up an octave
  const voice = (root, q, inv) => q.map((iv, k) => root + iv + (k < inv ? 12 : 0)).sort((a, b) => a - b);

  // Public-domain tune openings, in C (rhythm left out: just the notes)
  const TUNES = [
    ["Twinkle Twinkle Little Star", [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]],
    ["Mary Had a Little Lamb", [64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67]],
    ["Ode to Joy", [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]],
    ["Frère Jacques", [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, 64, 65, 67]],
    ["Hot Cross Buns", [64, 62, 60, 64, 62, 60, 60, 60, 62, 62, 64, 62, 60]],
    ["London Bridge", [67, 69, 67, 65, 64, 65, 67, 62, 64, 65, 64, 65, 67]],
    ["Jingle Bells", [64, 64, 64, 64, 64, 64, 64, 67, 60, 62, 64]],
    ["Row, Row, Row Your Boat", [60, 60, 60, 62, 64, 64, 62, 64, 65, 67]],
    ["Au Clair de la Lune", [60, 60, 60, 62, 64, 62, 60, 64, 62, 62, 60]],
    ["When the Saints Go Marching In", [60, 64, 65, 67, 60, 64, 65, 67, 60, 64, 65, 67, 64, 60, 64, 62]],
    ["Old MacDonald", [67, 67, 67, 62, 64, 64, 62, 71, 71, 69, 69, 67]],
    ["Happy Birthday", [55, 55, 57, 55, 60, 59, 55, 55, 57, 55, 62, 60]],
    ["Amazing Grace", [55, 60, 64, 60, 64, 62, 60, 57, 55]],
    ["Yankee Doodle", [60, 60, 62, 64, 60, 64, 62, 55, 60, 60, 62, 64, 60, 59]],
    ["Brahms' Lullaby", [64, 64, 67, 64, 64, 67, 64, 67, 72, 71, 69, 69, 67]],
    ["Oh! Susanna", [60, 62, 64, 67, 67, 69, 67, 64, 60, 62, 64, 64, 62, 60, 62]],
    ["Camptown Races", [67, 67, 64, 67, 69, 67, 64, 64, 62, 64, 62]],
    ["Lightly Row", [67, 64, 64, 65, 62, 62, 60, 62, 64, 65, 67, 67, 67]],
    ["Skip to My Lou", [64, 64, 60, 60, 64, 64, 67, 62, 62, 59, 59, 62, 62, 67]],
    ["This Old Man", [67, 64, 67, 67, 64, 67, 69, 67, 65, 64, 62, 64, 65]],
  ];
  // major scales for the scale runs
  const SCALES = { C: [0, 2, 4, 5, 7, 9, 11], G: [7, 9, 11, 0, 2, 4, 6], F: [5, 7, 9, 10, 0, 2, 4], D: [2, 4, 6, 7, 9, 11, 1], A: [9, 11, 1, 2, 4, 6, 8] };
  const scaleNotes = (key, lo, hi) => range(lo, hi, (m) => SCALES[key].includes(m % 12));

  const EX = {
    read: [
      {
        key: "treble", name: "Treble clef",
        gen(lv, rand) {
          const m = pick(by(lv, white(60, 72), white(60, 81), range(60, 84)), rand);
          return { id: `read.treble.${m}`, seq: [m], staff: [m], clef: "treble" };
        },
      },
      {
        key: "bass", name: "Bass clef",
        gen(lv, rand) {
          const m = pick(by(lv, white(48, 59), white(41, 59), range(36, 59)), rand);
          return { id: `read.bass.${m}`, seq: [m], staff: [m], clef: "bass" };
        },
      },
      {
        key: "ledger", name: "Ledger lines",
        gen(lv, rand) {
          const easy = [["treble", 60], ["bass", 60], ["treble", 81]];
          const med = easy.concat([["treble", 57], ["treble", 59], ["bass", 62], ["bass", 64], ["treble", 83], ["bass", 40], ["bass", 38]]);
          const hard = med.concat([["treble", 84], ["treble", 86], ["treble", 55], ["bass", 65], ["bass", 36], ["treble", 61], ["bass", 61], ["treble", 82]]);
          const [clef, m] = pick(by(lv, easy, med, hard), rand);
          return { id: `read.ledger.${clef}.${m}`, seq: [m], staff: [m], clef };
        },
      },
      {
        key: "sharp", name: "Sharps",
        gen(lv, rand) {
          const m = pick(by(lv, black(61, 70), black(49, 82), black(37, 85)), rand);
          return { id: `read.sharp.${m}`, seq: [m], staff: [m], clef: m >= 60 ? "treble" : "bass" };
        },
      },
      {
        key: "pair", name: "Two notes",
        gen(lv, rand) {
          const pool = by(lv, white(60, 72), rand() < 0.5 ? white(60, 79) : white(43, 59), rand() < 0.5 ? range(60, 81) : range(40, 59));
          const seq = walk(pool, 2, by(lv, 4, 6, 9), rand);
          return { id: `read.pair.${seq.join("-")}`, seq, staff: seq, clef: clefOf(seq) };
        },
      },
      {
        key: "phrase", name: "Read a phrase",
        gen(lv, rand) {
          const pool = by(lv, white(60, 72), rand() < 0.6 ? white(60, 79) : white(43, 59), range(57, 79));
          const seq = walk(pool, by(lv, 4, 5, 6), by(lv, 1, 2, 3), rand);
          return { id: `read.phrase.${seq.join("-")}`, seq, staff: seq, clef: clefOf(seq) };
        },
      },
      {
        key: "chord", name: "Chord",
        gen(lv, rand) {
          const [root, q] = pick(chordsFor(lv), rand);
          const inv = lv === "hard" ? Math.floor(rand() * 3) : 0;
          const notes = voice(root, q, inv);
          return { id: `read.chord.${root}.${q === MIN ? "m" : "M"}.${inv}`, seq: notes, staff: notes, chord: true, anyOrder: true, clef: notes[0] >= 55 ? "treble" : "bass", title: chordName(root, q) };
        },
      },
    ],
    echo: [
      {
        key: "note", name: "One note",
        gen(lv, rand) {
          const m = pick(by(lv, white(60, 67), white(60, 72), range(60, 72)), rand);
          return { id: `echo.note.${m}`, seq: [m], play: [[m]] };
        },
      },
      {
        key: "low", name: "Low notes",
        gen(lv, rand) {
          const m = pick(by(lv, white(48, 55), white(43, 59), range(40, 59)), rand);
          return { id: `echo.low.${m}`, seq: [m], play: [[m]] };
        },
      },
      {
        key: "fromC", name: "From Do",
        gen(lv, rand) {
          const m = pick(by(lv, white(62, 72), range(61, 72), range(61, 84)), rand);
          return { id: `echo.fromC.${m}`, seq: [m], play: [[60], [m]], note: "first" };
        },
      },
      {
        key: "higher", name: "The higher one",
        gen(lv, rand) {
          const pool = by(lv, white(60, 72), white(57, 76), range(57, 76));
          const minGap = by(lv, 4, 2, 1);
          let a, b;
          do { a = pick(pool, rand); b = pick(pool, rand); } while (Math.abs(a - b) < minGap || Math.abs(a - b) > 12 || (a - b) % 12 === 0);
          const together = lv === "hard";
          return { id: `echo.higher.${a}-${b}`, seq: [Math.max(a, b)], play: together ? [[a, b]] : [[a], [b]], together };
        },
      },
      {
        key: "lower", name: "The lower one",
        gen(lv, rand) {
          const pool = by(lv, white(60, 72), white(57, 76), range(57, 76));
          const minGap = by(lv, 4, 2, 1);
          let a, b;
          do { a = pick(pool, rand); b = pick(pool, rand); } while (Math.abs(a - b) < minGap || Math.abs(a - b) > 12 || (a - b) % 12 === 0);
          const together = lv === "hard";
          return { id: `echo.lower.${a}-${b}`, seq: [Math.min(a, b)], play: together ? [[a, b]] : [[a], [b]], together };
        },
      },
      {
        key: "two", name: "Two notes",
        gen(lv, rand) {
          const seq = walk(by(lv, white(60, 67), white(60, 72), range(60, 72)), 2, by(lv, 3, 5, 9), rand);
          return { id: `echo.two.${seq.join("-")}`, seq, play: seq.map((m) => [m]) };
        },
      },
      {
        key: "chord", name: "Chord",
        gen(lv, rand) {
          if (lv === "easy") {
            // two notes together: thirds, fourths, fifths, sixths on white keys
            const pool = white(60, 72);
            let a, b;
            do { a = pick(pool, rand); b = pick(pool, rand); } while (![3, 4, 5, 7, 8, 9].includes(b - a));
            return { id: `echo.chord.${a}-${b}`, seq: [a, b], play: [[a, b]], anyOrder: true };
          }
          const [root, q] = pick(chordsFor(lv), rand);
          const inv = lv === "hard" ? Math.floor(rand() * 3) : 0;
          const notes = voice(root, q, inv);
          return { id: `echo.chord.${root}.${q === MIN ? "m" : "M"}.${inv}`, seq: notes, play: [notes], anyOrder: true, title: chordName(root, q) };
        },
      },
    ],
    melody: [
      {
        key: "steps", name: "Steps",
        gen(lv, rand) {
          const seq = walk(by(lv, white(60, 67), white(60, 72), white(57, 77)), by(lv, 3, 4, 5), by(lv, 1, 2, 2), rand);
          return { id: `melody.steps.${seq.join("-")}`, seq, play: seq.map((m) => [m]) };
        },
      },
      {
        key: "jumps", name: "Jumps",
        gen(lv, rand) {
          const [root, q] = pick(chordsFor(lv).filter(([r]) => r >= 55), rand);
          const tones = range(root - 12, root + 19, (m) => q.includes((((m - root) % 12) + 12) % 12)).filter((m) => m >= 55 && m <= 81);
          const seq = walk(tones, by(lv, 3, 4, 5), by(lv, 1, 2, 2), rand);
          return { id: `melody.jumps.${seq.join("-")}`, seq, play: seq.map((m) => [m]), title: chordName(root, q) + " chord notes" };
        },
      },
      {
        key: "scale", name: "Scale run",
        gen(lv, rand) {
          const key = pick(by(lv, ["C"], ["C", "G", "F"], ["C", "G", "F", "D", "A"]), rand);
          const notes = scaleNotes(key, 57, 81);
          const len = by(lv, 4, 5, 7);
          const up = rand() < 0.5;
          const s = Math.floor(rand() * (notes.length - len + 1));
          let seq = notes.slice(s, s + len);
          if (!up) seq = seq.reverse();
          return { id: `melody.scale.${seq.join("-")}`, seq, play: seq.map((m) => [m]), title: `${key} major scale, ${up ? "up" : "down"}` };
        },
      },
      {
        key: "black", name: "Black keys",
        gen(lv, rand) {
          const seq = walk(black(61, 75), by(lv, 3, 4, 5), by(lv, 1, 2, 2), rand);
          return { id: `melody.black.${seq.join("-")}`, seq, play: seq.map((m) => [m]) };
        },
      },
      {
        key: "tune", name: "Name that tune",
        gen(lv, rand) {
          const [title, all] = pick(TUNES, rand);
          const seq = all.slice(0, by(lv, 5, 8, 12));
          return { id: `melody.tune.${title}`, seq, play: seq.map((m) => [m]), title };
        },
      },
    ],
  };

  const api = { EX, TUNES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EarExercises = api;
})(this);
