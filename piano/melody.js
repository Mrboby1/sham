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

  const MIN_MATCH = 3; // matching steps needed (= 4 different notes in a row)

  // played: midi notes in the order they were played (repeats allowed).
  // Returns {title, at, of, next: [midi...], confidence} or null.
  function follow(played, prev) {
    const P = collapse(played).slice(-12);
    if (P.length < 2) return null;
    const last = P[P.length - 1];

    // Keep following the tune we already recognised while the player stays on it.
    if (prev && prev.song) {
      const s = prev.song;
      const want = s.tune[prev.pos + 1] + prev.offset;
      if (last === want && prev.pos + 1 < s.tune.length) return result(s, prev.pos + 1, prev.offset, prev.score + 1);
      if (last === s.tune[prev.pos] + prev.offset) return result(s, prev.pos, prev.offset, prev.score);
    }
    if (P.length < MIN_MATCH + 1) return null;

    const ps = steps(P);
    let best = null;
    for (const s of LIBRARY) {
      for (let end = 0; end < s.steps.length; end++) {
        if (s.steps[end] !== ps[ps.length - 1]) continue; // the newest step must match exactly
        let score = 0, misses = 0;
        for (let k = 0; k < ps.length && end - k >= 0; k++) {
          if (ps[ps.length - 1 - k] === s.steps[end - k]) score++;
          else if (++misses > 1) break;
          else score -= 0.5;
        }
        if (score >= MIN_MATCH && (!best || score > best.score)) {
          const pos = end + 1; // index in tune of the note just played
          best = { s, pos, offset: last - s.tune[pos], score };
        }
      }
    }
    return best ? result(best.s, best.pos, best.offset, best.score) : null;
  }

  function result(s, pos, offset, score) {
    const next = s.tune.slice(pos + 1, pos + 5).map((n) => n + offset);
    return {
      song: s, pos, offset, score,
      title: s.title,
      at: pos + 1,
      of: s.tune.length,
      next,
      done: next.length === 0,
    };
  }

  const api = { follow, LIBRARY, parse, collapse };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Melody = api;
})(this);
