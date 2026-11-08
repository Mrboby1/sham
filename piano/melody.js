// Melody follower for Piano Notes: recognises a known tune from the notes played so far and
// predicts the next ones. Works in any key (it compares the steps between notes, not the notes).
// All tunes are traditional or public domain.
(function (root) {
  "use strict";

  const SONGS = [
    ["Ode to Joy", "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4 D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4"],
    ["Twinkle Twinkle Little Star", "C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4 C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4"],
    ["Mary Had a Little Lamb", "E4 D4 C4 D4 E4 E4 E4 D4 D4 D4 E4 G4 G4 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4"],
    ["Fur Elise", "E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 C5 B4 A4"],
    ["Happy Birthday", "G4 G4 A4 G4 C5 B4 G4 G4 A4 G4 D5 C5 G4 G4 G5 E5 C5 B4 A4 F5 F5 E5 C5 D5 C5"],
    ["Jingle Bells", "E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4 E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 G4 G4 F4 D4 C4"],
    ["Frere Jacques", "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4 E4 F4 G4 G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G3 C4 C4 G3 C4"],
    ["Brahms' Lullaby", "E4 E4 G4 E4 E4 G4 E4 G4 C5 B4 A4 A4 G4 D4 E4 F4 D4 D4 E4 F4 D4 F4 B4 A4 G4 B4 C5"],
    ["Row Row Row Your Boat", "C4 C4 C4 D4 E4 E4 D4 E4 F4 G4 C5 C5 C5 G4 G4 G4 E4 E4 E4 C4 C4 C4 G4 F4 E4 D4 C4"],
    ["Au Clair de la Lune", "C4 C4 C4 D4 E4 D4 C4 E4 D4 D4 C4 C4 C4 C4 D4 E4 D4 C4 E4 D4 D4 C4 D4 D4 D4 D4 A3 A3 D4 C4 B3 A3 G3 C4 C4 C4 D4 E4 D4 C4 E4 D4 D4 C4"],
    ["Amazing Grace", "D4 G4 B4 G4 B4 A4 G4 E4 D4 D4 G4 B4 G4 B4 A4 D5 B4 D5 B4 D5 B4 G4 D4 E4 G4 E4 D4 D4 G4 B4 G4 B4 A4 G4"],
    ["When the Saints Go Marching In", "C4 E4 F4 G4 C4 E4 F4 G4 C4 E4 F4 G4 E4 C4 E4 D4 E4 E4 D4 C4 C4 E4 G4 G4 F4 E4 F4 G4 E4 C4 D4 C4"],
    ["London Bridge", "G4 A4 G4 F4 E4 F4 G4 D4 E4 F4 E4 F4 G4 G4 A4 G4 F4 E4 F4 G4 D4 G4 E4 C4"],

    // Classical: the main theme of each piece (top line of the right hand).
    ["Eine kleine Nachtmusik - Mozart", "G4 D4 G4 D4 G4 D4 G4 B4 D5 C5 A4 C5 A4 C5 A4 F#4 A4 D4"],
    ["Rondo alla Turca - Mozart", "B4 A4 G#4 A4 C5 D5 C5 B4 C5 E5 F5 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5 C6"],
    ["Symphony No. 40 - Mozart", "Eb5 D5 D5 Eb5 D5 D5 Eb5 D5 D5 Bb5 Bb5 A5 G5 G5 F5 Eb5 Eb5 D5 C5 C5 D5 C5 C5 D5 C5 C5 D5 C5 C5 A5 A5 G5 F#5 F#5 Eb5 D5 D5 C5 Bb4 Bb4"],
    ["Piano Sonata No. 16 (K. 545) - Mozart", "C5 E5 G5 B4 C5 D5 C5 A5 G5 C6 G5"],
    ["Minuet in G - Bach", "D5 G4 A4 B4 C5 D5 G4 G4 E5 C5 D5 E5 F#5 G5 G4 G4 C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 F#4 G4 A4 B4 G4 A4"],
    ["Toccata and Fugue in D minor - Bach", "A5 G5 A5 G5 F5 E5 D5 C#5 D5 A4 G4 A4 E4 F4 C#4 D4"],
    ["Jesu, Joy of Man's Desiring - Bach", "G4 A4 B4 D5 C5 C5 E5 D5 D5 G5 F#5 G5 D5 B4 G4 A4 B4 C5 D5 E5 D5 C5 B4 A4 B4 G4 F#4 G4 A4 D4 F#4 A4 C5 B4 A4 B4"],
    ["Prelude in C (Well-Tempered Clavier) - Bach", "C4 E4 G4 C5 E5 G4 C5 E5 C4 D4 A4 D5 F5 A4 D5 F5 B3 D4 G4 D5 F5 G4 D5 F5 C4 E4 G4 C5 E5 G4 C5 E5"],
    ["Badinerie - Bach", "B5 D6 B5 F#5 B5 F#5 D5 F#5 D5 B4"],
    ["Spring (Four Seasons) - Vivaldi", "E5 G#5 G#5 G#5 F#5 E5 B5 B5 A5 G#5 G#5 G#5 F#5 E5 B5 B5 A5 G#5 A5 B5 A5 G#5 F#5"],
    ["Clair de Lune - Debussy", "Ab5 Ab5 F5 F5 Eb5 F5 Eb5 Db5 Eb5 Db5 C5 Db5 C5 Bb4 C5 Bb4"],
    ["Symphony No. 5 - Beethoven", "G4 G4 G4 Eb4 F4 F4 F4 D4 G4 G4 G4 Eb4 Ab4 Ab4 Ab4 G4 Eb5 Eb5 Eb5 C5"],
    ["Nocturne Op. 9 No. 2 - Chopin", "Bb4 G5 F5 G5 F5 Eb5 Bb4 G5 C5 C6 G5 Bb5 Ab5 G5"],
    ["In the Hall of the Mountain King - Grieg", "B3 C#4 D4 E4 F#4 D4 F#4 F4 C#4 F4 E4 C4 E4 B3 C#4 D4 E4 F#4 D4 F#4 B4 A4 F#4 D4 F#4 A4"],
    ["Canon in D - Pachelbel", "F#5 E5 D5 C#5 B4 A4 B4 C#5 D5 C#5 B4 A4 G4 F#4 G4 E4"],
    ["Gymnopedie No. 1 - Satie", "F#5 A5 G5 F#5 C#5 B4 C#5 D5 A4 F#4"],
    ["The Blue Danube - Strauss", "D4 D4 F#4 A4 A4 A5 A5 F#5 F#5 D4 D4 F#4 A4 A4 A5 A5 G5 G5 C#4 C#4 E4 B4 B4 B5 B5 G5 G5 C#4 C#4 E4 B4 B4 B5 B5 F#5 F#5"],
  ];

  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parse(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) throw new Error("bad note " + name);
    return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  }
  // Repeated notes are easy to miss by ear (the mic hears one long note), so matching ignores them.
  function collapse(seq) {
    const out = [];
    for (const n of seq) if (out[out.length - 1] !== n) out.push(n);
    return out;
  }
  const steps = (seq) => seq.slice(1).map((n, i) => n - seq[i]);

  const LIBRARY = SONGS.map(([title, notes]) => {
    const full = notes.split(/\s+/).map(parse);
    const tune = collapse(full);
    return { title, tune, steps: steps(tune) };
  });

  // Matching compares pitch classes (C, C#, D ... ignoring the octave) in any key, and forgives a
  // missed note, an extra note or a wrong note. Through a phone mic notes are often heard an octave
  // off, or a fast one is missed; an exact step-by-step comparison broke on every such slip.
  const pcEq = (a, b) => (((a - b) % 12) + 12) % 12 === 0;
  function pcCollapse(seq) {
    const out = [];
    for (const n of seq) if (!out.length || !pcEq(out[out.length - 1], n)) out.push(n);
    return out;
  }

  const MATCH = 2, WRONG = -3, GAP = -1.5;
  const SURE_START = 9;   // from a piece's first note: about 5 notes
  const SURE_MID = 12;    // joining mid-piece: about 7 notes
  const SHOW = 7;         // a guess below this isn't shown
  const MARGIN = 3;       // the best piece must beat every other piece by this much to lock

  // Best local alignment of played notes P against tune T shifted by t semitones (mod 12), ending
  // with the last played note matched. Returns {score, end, start} or null.
  function align(P, T, t) {
    const n = P.length, m = T.length;
    let pS = new Float32Array(m + 1), pSt = new Int16Array(m + 1).fill(-1);
    let cS = new Float32Array(m + 1), cSt = new Int16Array(m + 1).fill(-1);
    let best = null;
    for (let i = 1; i <= n; i++) {
      cS[0] = 0; cSt[0] = -1;
      for (let j = 1; j <= m; j++) {
        const hit = pcEq(P[i - 1], T[j - 1] + t);
        let s = 0, st = -1;
        if (hit) {
          if (pS[j - 1] > 0) { s = pS[j - 1] + MATCH; st = pSt[j - 1]; } else { s = MATCH; st = j - 1; }
        } else if (pS[j - 1] + WRONG > 0) { s = pS[j - 1] + WRONG; st = pSt[j - 1]; }
        if (i === n && hit && (!best || s > best.score)) best = { score: s, end: j - 1, start: st };
        if (pS[j] + GAP > s) { s = pS[j] + GAP; st = pSt[j]; }         // an extra note was heard
        if (cS[j - 1] + GAP > s) { s = cS[j - 1] + GAP; st = cSt[j - 1]; } // a note of the tune was missed
        cS[j] = s; cSt[j] = st;
      }
      [pS, cS] = [cS, pS];
      [pSt, cSt] = [cSt, pSt];
    }
    return best;
  }

  // Semitone offset that puts the tune's note at `end` in the octave the player is using.
  function octaveOffset(P, T, end, t) {
    const recent = P.slice(-4), ref = T.slice(Math.max(0, end - 3), end + 1);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return t + 12 * Math.round((mean(recent) - mean(ref) - t) / 12);
  }

  // played: midi notes in the order they were played (repeats allowed).
  function follow(played, prev) {
    const P = pcCollapse(played).slice(-14);
    if (P.length < 2) return null;
    // Locked: once a piece is recognised it stays the piece until the player clears it.
    // Wrong notes never switch to another tune; the follower just finds its place again.
    // A guess that isn't sure yet is re-checked on every note.
    if (prev && prev.song && prev.sure) return stayOn(prev, P);
    if (P.length < 4) return null;

    const perSong = [];
    for (const s of LIBRARY) {
      let best = null;
      for (let t = 0; t < 12; t++) {
        const a = align(P, s.tune, t);
        if (!a) continue;
        const score = a.score + (a.start === 0 ? 1 : 0);
        if (!best || score > best.score) best = { s, t, score, end: a.end, fromStart: a.start === 0 };
      }
      if (best && best.score >= SHOW) perSong.push(best);
    }
    if (!perSong.length) return null;
    perSong.sort((a, b) => b.score - a.score);
    const [a, b] = perSong;
    const sure = (!b || a.score >= b.score + MARGIN) && (a.fromStart ? a.score >= SURE_START : a.score >= SURE_MID);
    return result(a.s, a.end, octaveOffset(P, a.s.tune, a.end, a.t), a.score, 0, sure);
  }

  function stayOn(prev, P) {
    const s = prev.song, off = prev.offset, len = s.tune.length;
    const last = P[P.length - 1];
    if (prev.pos + 1 < len && pcEq(last, s.tune[prev.pos + 1] + off)) return result(s, prev.pos + 1, off, prev.score + MATCH, 0);
    if (pcEq(last, s.tune[prev.pos] + off)) return result(s, prev.pos, off, prev.score, prev.lost);
    if (prev.pos + 1 >= len && pcEq(last, s.tune[0] + off)) return result(s, 0, off, prev.score, 0); // starting over

    // Off the expected path: find the last few notes elsewhere in this piece (same key first, then
    // any key in case the player moved hands). Take the best place, nearest ahead on a tie.
    const R = P.slice(-6);
    const tries = [((off % 12) + 12) % 12, ...Array.from({ length: 12 }, (_, t) => t)];
    for (let i = 0; i < tries.length; i++) {
      const t = tries[i];
      const a = align(R, s.tune, t);
      const need = i === 0 ? 5 : 8; // ~3 notes in the same key, ~5 in a new key
      if (a && a.score >= need) return result(s, a.end, i === 0 ? off : octaveOffset(P, s.tune, a.end, t), prev.score, 0);
    }
    return result(s, prev.pos, off, prev.score, prev.lost + 1); // stay put until the player finds it
  }

  function result(s, pos, offset, score, lost = 0, sure = true) {
    const next = s.tune.slice(pos + 1, pos + 5).map((n) => n + offset);
    return {
      song: s, pos, offset, score, lost, sure,
      title: s.title,
      at: pos + 1,
      of: s.tune.length,
      next, // while lost, still shows where the piece was: the player can pick it up from there
      done: next.length === 0,
    };
  }

  const CLEAR_KEYS = [21, 22, 23]; // A0, A#0, B0: playing the lowest key unlocks (bottom 3 forgive mic errors)

  // Practice: lock onto a chosen piece before its first note, in its written key.
  function start(title) {
    const s = LIBRARY.find((x) => x.title === title);
    if (!s) return null;
    const r = result(s, -1, 0, 0, 0, true);
    r.at = 0;
    return r;
  }
  // A melody the player recorded (midi notes). Returns the library entry.
  function addSong(title, notes, mine = true) {
    const tune = collapse(notes);
    if (tune.length < 2) return null;
    const entry = { title, tune, steps: steps(tune), mine };
    const i = LIBRARY.findIndex((x) => x.title === title);
    if (i >= 0) LIBRARY[i] = entry; else LIBRARY.push(entry);
    return entry;
  }
  function removeSong(title) {
    const i = LIBRARY.findIndex((x) => x.title === title && x.mine);
    if (i >= 0) LIBRARY.splice(i, 1);
  }

  const api = { follow, start, addSong, removeSong, LIBRARY, parse, collapse, CLEAR_KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Melody = api;
})(this);
