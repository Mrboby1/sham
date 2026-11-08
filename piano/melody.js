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

  const MIN_MATCH = 4; // matching steps needed (= 5 different notes in a row)

  // played: midi notes in the order they were played (repeats allowed).
  // Returns {title, at, of, next: [midi...], confidence} or null.
  function follow(played, prev) {
    const P = collapse(played).slice(-12);
    if (P.length < 2) return null;
    const last = P[P.length - 1];

    // Locked: once a piece is recognised it stays the piece until the player clears it.
    // Wrong notes never switch to another tune; the follower just finds its place again.
    // A guess that isn't sure yet is re-checked on every note.
    if (prev && prev.song && prev.sure) return stayOn(prev, P);
    if (P.length < MIN_MATCH + 1) return null;

    const ps = steps(P);
    const perSong = [];
    for (const s of LIBRARY) {
      let best = null;
      for (let end = 0; end < s.steps.length; end++) {
        if (s.steps[end] !== ps[ps.length - 1]) continue; // the newest step must match exactly
        let score = 0, misses = 0, k = 0;
        for (; k < ps.length && end - k >= 0; k++) {
          if (ps[ps.length - 1 - k] === s.steps[end - k]) score++;
          else if (++misses > 1) break;
          else score -= 0.5;
        }
        const fromStart = end - k < 0 && misses === 0; // matched right back to the first note of the piece
        if (fromStart) score += 1;
        if (score >= MIN_MATCH && (!best || score > best.score)) {
          const pos = end + 1; // index in tune of the note just played
          best = { s, pos, offset: last - s.tune[pos], score, fromStart };
        }
      }
      if (best) perSong.push(best);
    }
    if (!perSong.length) return null;
    perSong.sort((a, b) => b.score - a.score);
    const [a, b] = perSong;
    // Sure = clearly better than any other piece. Only then does it lock.
    // From the start of a piece, 5 notes are enough; joining mid-piece takes 7.
    const sure = (!b || a.score >= b.score + 1) && (a.fromStart || a.score >= 6);
    return result(a.s, a.pos, a.offset, a.score, 0, sure);
  }

  function stayOn(prev, P) {
    const s = prev.song, off = prev.offset, len = s.tune.length;
    const last = P[P.length - 1];
    if (prev.pos + 1 < len && last === s.tune[prev.pos + 1] + off) return result(s, prev.pos + 1, off, prev.score + 1, 0);
    if (last === s.tune[prev.pos] + off) return result(s, prev.pos, off, prev.score, prev.lost);
    if (prev.pos + 1 >= len && last === s.tune[0] + off) return result(s, 0, off, prev.score, 0); // starting over

    // Off the expected path. Look for the last 3 notes (then 2) somewhere in this piece, in the same
    // key, and take the place closest ahead of where we were.
    for (const k of [3, 2]) {
      if (P.length < k) continue;
      const R = P.slice(-k);
      let best = -1, bestDist = Infinity;
      for (let i = k - 1; i < len; i++) {
        let ok = true;
        for (let j = 0; j < k && ok; j++) ok = s.tune[i - k + 1 + j] + off === R[j];
        if (!ok) continue;
        const dist = (i - prev.pos + len) % len;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best >= 0) return result(s, best, off, prev.score, 0);
    }
    // Same shape in another key (the player moved hands): match the last 4 steps.
    if (P.length >= 5) {
      const ps = steps(P.slice(-5));
      for (let i = 4; i < len; i++) {
        let ok = true;
        for (let j = 0; j < 4 && ok; j++) ok = s.steps[i - 4 + j] === ps[j];
        if (ok) return result(s, i, last - s.tune[i], prev.score, 0);
      }
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

  const api = { follow, LIBRARY, parse, collapse, CLEAR_KEYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Melody = api;
})(this);
