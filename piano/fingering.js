// Right-hand fingering for a melody (1 = thumb ... 5 = little finger).
// Finds the cheapest finger for every note with dynamic programming over the five fingers, using the
// rules of Parncutt et al. (1997) "An ergonomic model of keyboard fingering": comfortable and
// practical spans for each finger pair, extra cost for stretching and squeezing, for the weak 4th
// and 5th fingers, for the thumb or little finger on a black key, and for thumb passing / crossing.
(function (root) {
  "use strict";

  // Spans in semitones from the lower-numbered finger to the higher one (right hand):
  // [MinPrac, MinComf, MinRel, MaxRel, MaxComf, MaxPrac]
  const SPAN = {
    "1-2": [-5, -3, 1, 5, 8, 10],
    "1-3": [-4, -2, 3, 7, 10, 12],
    "1-4": [-3, -1, 5, 9, 12, 14],
    "1-5": [-1, 1, 7, 10, 13, 15],
    "2-3": [1, 1, 1, 2, 3, 5],
    "2-4": [1, 1, 3, 4, 5, 7],
    "2-5": [2, 2, 5, 6, 8, 10],
    "3-4": [1, 1, 1, 2, 2, 4],
    "3-5": [1, 1, 3, 4, 5, 7],
    "4-5": [1, 1, 1, 2, 3, 5],
  };
  const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const isBlack = (m) => BLACK[((m % 12) + 12) % 12] === 1;
  // position along the keyboard in white keys (a black key sits halfway between its neighbours)
  const WHITE = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
  const white = (m) => Math.floor(m / 12) * 7 + WHITE[((m % 12) + 12) % 12];
  // where the thumb sits if finger f plays note m with the hand in its natural five-finger position
  const thumbAt = (m, f) => white(m) - (f - 1);
  const W = { weak: 0.5, threeFour: 0.5, move: 1.5, pass: 2, shift: 2 }; // tuned against standard fingerings (test_fingering.js)

  // cost of playing note b with finger g right after note a with finger f
  function step(a, f, b, g) {
    let c = 0;
    if (f === g) {
      if (a === b) return 0;                       // repeated note, same finger: fine
      return 6 + Math.abs(b - a) * 0.5;            // same finger on a different note breaks legato
    }
    const lo = Math.min(f, g), hi = Math.max(f, g);
    const span = f < g ? b - a : a - b;            // distance from the lower finger to the higher
    const [minP, minC, minR, maxR, maxC, maxP] = SPAN[lo + "-" + hi];
    if (span < minP || span > maxP) c += 10 + 2 * Math.max(minP - span, span - maxP); // barely possible
    if (span < minC) c += 2 * (minC - span);       // stretch rule
    if (span > maxC) c += 2 * (span - maxC);
    if (span < minR) c += (lo === 1 ? 2 : 1) * (minR - span); // small-span rule
    if (span > maxR) c += (lo === 1 ? 2 : 1) * (span - maxR); // large-span rule
    if (g === 4) c += W.weak;                      // weak-finger rule
    if ((f === 3 && g === 4) || (f === 4 && g === 3)) c += W.threeFour; // 3-4 rule
    // hand moves: teachers keep the hand in one five-finger position as long as possible
    const moved = Math.abs(thumbAt(b, g) - thumbAt(a, f));
    c += W.move * moved + (moved >= 1 ? W.shift : 0); // each new hand position costs extra
    if (isBlack(b) && g === 1) c += 2 + (isBlack(a) ? 0 : 1);  // thumb on black
    if (isBlack(b) && g === 5) c += 1 + (isBlack(a) ? 0 : 1);  // little finger on black
    // thumb passing under (ascending onto 1) or a finger crossing over the thumb (descending from 1)
    const passing = (g === 1 && b > a && f > 1) || (f === 1 && b < a && g > 1);
    if (passing) c += isBlack(f === 1 ? a : b) && !isBlack(f === 1 ? b : a) ? 3 + W.pass : W.pass;
    return c;
  }

  function fingerRH(notes) {
    const n = notes.length;
    if (!n) return [];
    const INF = 1e9;
    let cost = [0, 0, 0, 0, 0, 0];
    // starting hand: avoid the thumb on a black key and the weak fingers on the first note
    for (let f = 1; f <= 5; f++) cost[f] = (isBlack(notes[0]) && f === 1 ? 3 : 0) + (f >= 4 ? 0.5 : 0);
    const back = [];
    for (let i = 1; i < n; i++) {
      const next = [INF, INF, INF, INF, INF, INF], from = [0, 0, 0, 0, 0, 0];
      for (let g = 1; g <= 5; g++) {
        for (let f = 1; f <= 5; f++) {
          const c = cost[f] + step(notes[i - 1], f, notes[i], g);
          if (c < next[g]) { next[g] = c; from[g] = f; }
        }
      }
      back.push(from);
      cost = next;
    }
    let best = 1;
    for (let f = 2; f <= 5; f++) if (cost[f] < cost[best]) best = f;
    const out = new Array(n);
    out[n - 1] = best;
    for (let i = n - 1; i > 0; i--) out[i - 1] = back[i - 1][out[i]];
    return out;
  }

  const api = { fingerRH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Fingering = api;
})(this);
