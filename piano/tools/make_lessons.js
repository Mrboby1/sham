// Builds lessons.json: beginner and intermediate exercises and easy songs, some for both hands.
//   node tools/make_lessons.js
// Everything here is traditional, public domain or a standard technical exercise (scales, Hanon).
//
// Notation: space-separated tokens, each  NOTE[:BEATS[:FINGER[:NAME]]]
//   NOTE    C4, F#4, Bb3; a chord is joined with "+": C4+E4+G4; "r" is a rest
//   BEATS   how long, in quarter-note beats (default 1)
//   FINGER  1-5 (a chord: one per note, joined with "+"); right-hand fingers left out are worked out
//           by fingering.js, left-hand fingers must be written
//   NAME    a chord name shown beside the bars, e.g. "C"
// An item has `rh` and/or `lh`. With both, the two hands are merged into steps by time: notes that
// start together are one step (played together), like a chord song.
"use strict";
const fs = require("fs");
const path = require("path");
const { fingerRH } = require("../fingering.js");

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error("bad note " + n);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
function parse(line) {
  const out = [];
  let t = 0;
  for (const tok of line.trim().split(/\s+/)) {
    const [n, b = "1", f = "", name = ""] = tok.split(":");
    const beats = Number(b);
    if (!(beats > 0)) throw new Error("bad beats in " + tok);
    if (n !== "r") {
      const keys = n.split("+").map(midi);
      const fingers = f ? f.split("+").map(Number) : null;
      if (fingers && fingers.length !== keys.length) throw new Error("fingers don't match notes in " + tok);
      out.push({ t, keys, fingers, name });
    }
    t += beats;
  }
  return out;
}
// The same note pattern repeated from each start note: e.g. Hanon.
function pattern(starts, offsets, beats, fingers) {
  const whites = [];
  for (let m = 36; m <= 96; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
  const name = (m) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][m % 12] + (Math.floor(m / 12) - 1);
  const toks = [];
  for (const s of starts) {
    const i = whites.indexOf(midi(s));
    offsets.forEach((o, j) => toks.push(`${name(whites[i + o])}:${beats}:${fingers[j]}`));
  }
  return toks.join(" ");
}

// Arpeggios over C, F, G, Am, one octave: up the 4 chord notes, back down, the root held (8 beats each).
const ARP = { C: ["C", "E", "G"], F: ["F", "A", "C"], G: ["G", "B", "D"], Am: ["A", "C", "E"] };
function arps(oct, fingersUp, fingersDown) {
  return Object.values(ARP).map(([a, b, c]) => {
    const o2 = (n) => (PC[n] < PC[a] ? oct + 1 : oct); // a chord note below the root sits an octave up
    const up = [a + oct, b + o2(b), c + o2(c), a + (oct + 1)];
    const down = [up[2], up[1], up[0]];
    return up.map((n, i) => `${n}:1:${fingersUp[i]}`).join(" ") + " " + down.map((n, i) => `${n}:${i === 2 ? 2 : 1}:${fingersDown[i]}`).join(" ");
  }).join(" ");
}

const ITEMS = [
  // ------------------------------------------------------------------ exercises: beginner
  { kind: "exercise", level: "beginner", title: "1. Five fingers in C (right hand)",
    tip: "Thumb on middle C, one finger per key. Say the finger numbers out loud.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:2:1 r:2 C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:4:1" },
  { kind: "exercise", level: "beginner", title: "2. Five fingers in C (left hand)",
    tip: "Little finger (5) on the C below middle C. The left hand counts from the thumb too: thumb = 1.",
    lh: "C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5 r:2 C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:4:5" },
  { kind: "exercise", level: "beginner", title: "3. Skipping keys (right hand)",
    tip: "Every other key: a skip of one white key, called a third. Keep the hand still, only the fingers move.",
    rh: "C4:1:1 E4:1:3 D4:1:2 F4:1:4 E4:1:3 G4:1:5 r:2 G4:1:5 E4:1:3 F4:1:4 D4:1:2 E4:1:3 C4:3:1" },
  { kind: "exercise", level: "beginner", title: "4. Hands take turns",
    tip: "The right hand goes up and down, then the left hand does the same an octave lower.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:2:1 r:10 C4:1:1 E4:1:3 G4:1:5 E4:1:3 C4:2:1",
    lh: "r:10 C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5 r:6 C3:4:5" },
  { kind: "exercise", level: "beginner", title: "5. Hands together, the same way",
    tip: "Both hands play C D E F G together, an octave apart. Right hand starts with the thumb, left hand with the little finger.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:2:1",
    lh: "C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5" },
  { kind: "exercise", level: "beginner", title: "6. Hands together, mirror image",
    tip: "Both thumbs start on a C and the hands move apart, then back. Same finger number in both hands at each step.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5 F4:1:4 E4:1:3 D4:1:2 C4:2:1",
    lh: "C3:1:1 B2:1:2 A2:1:3 G2:1:4 F2:1:5 G2:1:4 A2:1:3 B2:1:2 C3:2:1" },
  { kind: "exercise", level: "beginner", title: "7. Five fingers in G (right hand)",
    tip: "The same shape moved up: thumb on G.",
    rh: "G4:1:1 A4:1:2 B4:1:3 C5:1:4 D5:1:5 C5:1:4 B4:1:3 A4:1:2 G4:2:1 r:2 G4:1:1 B4:1:3 D5:1:5 B4:1:3 G4:2:1" },
  { kind: "exercise", level: "beginner", title: "8. Broken C chord",
    tip: "C, E and G are the C major chord. Right hand 1-3-5, then left hand 5-3-1.",
    rh: "C4:1:1 E4:1:3 G4:1:5 E4:1:3 C4:1:1 E4:1:3 G4:2:5 r:8",
    lh: "r:8 C3:1:5 E3:1:3 G3:1:1 E3:1:3 C3:1:5 E3:1:3 G3:2:1" },
  { kind: "exercise", level: "beginner", title: "9. First chords: C, F, G",
    tip: "Three keys at once in the right hand, one bass note in the left. The hand barely moves between chords.",
    rh: "C4+E4+G4:4:1+3+5:C C4+F4+A4:4:1+4+5:F C4+E4+G4:4:1+3+5:C D4+G4+B4:4:1+3+5:G C4+E4+G4:4:1+3+5:C",
    lh: "C3:4:5 F3:4:2 C3:4:5 G3:4:1 C3:4:5" },
  { kind: "exercise", level: "beginner", title: "10. C major scale (right hand)",
    tip: "Going up, the thumb tucks under after E (finger 3). Going down, finger 3 crosses over the thumb onto E.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:1 G4:1:2 A4:1:3 B4:1:4 C5:1:5 B4:1:4 A4:1:3 G4:1:2 F4:1:1 E4:1:3 D4:1:2 C4:2:1" },

  // Arpeggios (Sham, 2026-11-15: "I'm lacking practice in joining both hands at once. Arpeggios?")
  { kind: "exercise", level: "beginner", title: "11. Arpeggios C, F, G, Am (right hand)",
    tip: "Each chord's notes one after another: fingers 1-2-3-5 up, 3-2-1 down. The hand keeps the same shape for every chord, it just moves.",
    rh: arps(4, [1, 2, 3, 5], [3, 2, 1]) },
  { kind: "exercise", level: "beginner", title: "12. Arpeggios C, F, G, Am (left hand)",
    tip: "The left hand plays the same chords an octave lower: fingers 5-3-2-1 up, 2-3-5 down.",
    lh: arps(3, [5, 3, 2, 1], [2, 3, 5]) },
  { kind: "exercise", level: "beginner", title: "13. Arpeggios C, F, G, Am, hands together",
    tip: "Both hands at once, an octave apart. Slowly: each pair of keys should sound as one. Right hand 1-2-3-5, left hand 5-3-2-1.",
    rh: arps(4, [1, 2, 3, 5], [3, 2, 1]), lh: arps(3, [5, 3, 2, 1], [2, 3, 5]) },

  // ------------------------------------------------------------------ exercises: intermediate
  { kind: "exercise", level: "intermediate", title: "C major scale (left hand)",
    tip: "Going up, finger 3 crosses over the thumb onto A. Going down, the thumb tucks under after G.",
    lh: "C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 A3:1:3 B3:1:2 C4:1:1 B3:1:2 A3:1:3 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5" },
  { kind: "exercise", level: "intermediate", title: "C major scale, hands together",
    tip: "The two thumbs never cross at the same moment: go slowly and listen that both keys sound as one.",
    rh: "C4:1:1 D4:1:2 E4:1:3 F4:1:1 G4:1:2 A4:1:3 B4:1:4 C5:1:5 B4:1:4 A4:1:3 G4:1:2 F4:1:1 E4:1:3 D4:1:2 C4:2:1",
    lh: "C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 A3:1:3 B3:1:2 C4:1:1 B3:1:2 A3:1:3 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:2:5" },
  { kind: "exercise", level: "intermediate", title: "G major scale (right hand)",
    tip: "Like C major but with F sharp (the black key).",
    rh: "G4:1:1 A4:1:2 B4:1:3 C5:1:1 D5:1:2 E5:1:3 F#5:1:4 G5:1:5 F#5:1:4 E5:1:3 D5:1:2 C5:1:1 B4:1:3 A4:1:2 G4:2:1" },
  { kind: "exercise", level: "intermediate", title: "F major scale (right hand)",
    tip: "F major has B flat. The thumb tucks under after B flat, finger 4.",
    rh: "F4:1:1 G4:1:2 A4:1:3 Bb4:1:4 C5:1:1 D5:1:2 E5:1:3 F5:1:4 E5:1:3 D5:1:2 C5:1:1 Bb4:1:4 A4:1:3 G4:1:2 F4:2:1" },
  { kind: "exercise", level: "intermediate", title: "A minor scale (right hand)",
    tip: "All white keys from A to A: the sad-sounding sister of C major.",
    rh: "A4:1:1 B4:1:2 C5:1:3 D5:1:1 E5:1:2 F5:1:3 G5:1:4 A5:1:5 G5:1:4 F5:1:3 E5:1:2 D5:1:1 C5:1:3 B4:1:2 A4:2:1" },
  { kind: "exercise", level: "intermediate", title: "C major arpeggio, 2 octaves (right hand)",
    tip: "C, E, G up two octaves. The thumb passes under after G.",
    rh: "C4:1:1 E4:1:2 G4:1:3 C5:1:1 E5:1:2 G5:1:3 C6:1:5 G5:1:3 E5:1:2 C5:1:1 G4:1:3 E4:1:2 C4:2:1" },
  { kind: "exercise", level: "intermediate", title: "C major arpeggio, 2 octaves (left hand)",
    tip: "Fingers 5-4-2-1, then finger 3 crosses over the thumb onto E. Coming down, the thumb passes under after E.",
    lh: "C2:1:5 E2:1:4 G2:1:2 C3:1:1 E3:1:3 G3:1:2 C4:1:1 G3:1:2 E3:1:3 C3:1:1 G2:1:2 E2:1:4 C2:2:5" },
  { kind: "exercise", level: "intermediate", title: "C major arpeggio, 2 octaves, hands together",
    tip: "Two octaves apart. The hands cross their thumbs at different moments, so go slowly until it feels even.",
    rh: "C4:1:1 E4:1:2 G4:1:3 C5:1:1 E5:1:2 G5:1:3 C6:1:5 G5:1:3 E5:1:2 C5:1:1 G4:1:3 E4:1:2 C4:2:1",
    lh: "C2:1:5 E2:1:4 G2:1:2 C3:1:1 E3:1:3 G3:1:2 C4:1:1 G3:1:2 E3:1:3 C3:1:1 G2:1:2 E2:1:4 C2:2:5" },
  { kind: "exercise", level: "intermediate", title: "Hanon No. 1 (right hand)",
    tip: "The classic finger exercise: 1-2-3-4-5-4-3-2, moving up one key each time. Lift each finger high, play evenly.",
    rh: pattern(["C4", "D4", "E4", "F4", "G4", "A4", "B4"], [0, 2, 3, 4, 5, 4, 3, 2], 0.5, [1, 2, 3, 4, 5, 4, 3, 2]) + " C5:2:1" },
  { kind: "exercise", level: "intermediate", title: "Chords: Am, F, C, G",
    tip: "The chords of hundreds of pop songs. Right hand stays near middle C; the left hand plays the bass note.",
    rh: "C4+E4+A4:4:1+2+5:Am C4+F4+A4:4:1+3+5:F C4+E4+G4:4:1+3+5:C D4+G4+B4:4:1+3+5:G C4+E4+A4:4:1+2+5:Am C4+F4+A4:4:1+3+5:F C4+E4+G4:4:1+3+5:C D4+G4+B4:4:1+3+5:G C4+E4+G4:4:1+3+5:C",
    lh: "A2:4:5 F2:4:5 C3:4:5 G2:4:5 A2:4:5 F2:4:5 C3:4:5 G2:4:5 C3:4:5" },

  // ------------------------------------------------------------------ exercises: advanced
  { kind: "exercise", level: "advanced", title: "Chromatic scale (right hand)",
    tip: "Every key, black and white. Finger 3 on the black keys, thumb on the white ones (2 on F and C going up).",
    rh: "C4:.5:1 C#4:.5:3 D4:.5:1 D#4:.5:3 E4:.5:1 F4:.5:2 F#4:.5:3 G4:.5:1 G#4:.5:3 A4:.5:1 A#4:.5:3 B4:.5:1 C5:.5:2 B4:.5:1 A#4:.5:3 A4:.5:1 G#4:.5:3 G4:.5:1 F#4:.5:3 F4:.5:2 E4:.5:1 D#4:.5:3 D4:.5:1 C#4:.5:3 C4:2:1" },
  { kind: "exercise", level: "advanced", title: "C major scale, 2 octaves, hands together",
    tip: "Eighth notes: two per beat. Get it even slowly before going faster.",
    rh: "C4:.5:1 D4:.5:2 E4:.5:3 F4:.5:1 G4:.5:2 A4:.5:3 B4:.5:4 C5:.5:1 D5:.5:2 E5:.5:3 F5:.5:1 G5:.5:2 A5:.5:3 B5:.5:4 C6:.5:5 B5:.5:4 A5:.5:3 G5:.5:2 F5:.5:1 E5:.5:3 D5:.5:2 C5:.5:1 B4:.5:4 A4:.5:3 G4:.5:2 F4:.5:1 E4:.5:3 D4:.5:2 C4:2:1",
    lh: "C2:.5:5 D2:.5:4 E2:.5:3 F2:.5:2 G2:.5:1 A2:.5:3 B2:.5:2 C3:.5:1 D3:.5:4 E3:.5:3 F3:.5:2 G3:.5:1 A3:.5:3 B3:.5:2 C4:.5:1 B3:.5:2 A3:.5:3 G3:.5:1 F3:.5:2 E3:.5:3 D3:.5:4 C3:.5:1 B2:.5:2 A2:.5:3 G2:.5:1 F2:.5:2 E2:.5:3 D2:.5:4 C2:2:5" },

  // ------------------------------------------------------------------ songs: beginner (with rhythm)
  { kind: "song", level: "beginner", title: "Hot Cross Buns", composer: "Traditional",
    tip: "Just three notes: E, D, C. Fingers 3, 2, 1.",
    rh: "E4 D4 C4:2 E4 D4 C4:2 C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 E4 D4 C4:2" },
  { kind: "song", level: "beginner", title: "Mary Had a Little Lamb", composer: "Traditional",
    rh: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4" },
  { kind: "song", level: "beginner", title: "Twinkle Twinkle Little Star", composer: "Traditional",
    rh: "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2" },
  { kind: "song", level: "beginner", title: "Ode to Joy", composer: "Beethoven",
    rh: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2 D4 D4 E4 C4 D4 E4:.5 F4:.5 E4 C4 D4 E4:.5 F4:.5 E4 D4 C4 D4 G3:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2" },
  { kind: "song", level: "beginner", title: "Lightly Row", composer: "Traditional",
    rh: "G4 E4 E4:2 F4 D4 D4:2 C4 D4 E4 F4 G4 G4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4 D4 D4 D4 D4 D4 E4 F4:2 E4 E4 E4 E4 E4 F4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4" },
  { kind: "song", level: "beginner", title: "Frere Jacques", composer: "Traditional",
    rh: "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2" },
  { kind: "song", level: "beginner", title: "Au Clair de la Lune", composer: "Traditional",
    rh: "C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 D4 D4 D4 D4 A3:2 A3:2 D4 C4 B3 A3 G3:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4" },
  { kind: "song", level: "beginner", title: "Jingle Bells", composer: "Pierpont",
    rh: "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4 F4 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4" },
  { kind: "song", level: "beginner", title: "When the Saints Go Marching In", composer: "Traditional",
    rh: "C4 E4 F4 G4:5 C4 E4 F4 G4:5 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:6 E4 E4 D4 C4:3 C4 E4:2 G4:2 G4 F4:5 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:6" },
  { kind: "song", level: "beginner", title: "Yankee Doodle", composer: "Traditional",
    rh: "C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4:2 B3:2 C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4:2 C4:2" },
  { kind: "song", level: "beginner", title: "Row Row Row Your Boat", composer: "Traditional",
    rh: "C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3" },

  // ------------------------------------------------------------------ songs: beginner, both hands
  { kind: "song", level: "beginner", title: "Twinkle Twinkle Little Star (both hands)", composer: "Traditional",
    tip: "The left hand stays on C, F and G (fingers 5, 2, 1) while the right hand plays the tune.",
    rh: "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2",
    lh: "C3:4:5 F3:2:2 C3:2:5 F3:2:2 C3:2:5 G3:2:1 C3:2:5 C3:2:5 F3:2:2 C3:2:5 G3:2:1 C3:2:5 F3:2:2 C3:2:5 G3:2:1 C3:4:5 F3:2:2 C3:2:5 F3:2:2 C3:2:5 G3:2:1 C3:2:5" },
  { kind: "song", level: "beginner", title: "Ode to Joy (both hands)", composer: "Beethoven",
    tip: "One long bass note per bar in the left hand: C or G.",
    rh: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2",
    lh: "C3:4:5 G2:4:5 C3:4:5 G2:4:5 C3:4:5 G2:4:5 C3:4:5 G2:2:5 C3:2:5" },
  { kind: "song", level: "beginner", title: "Mary Had a Little Lamb (both hands)", composer: "Traditional",
    tip: "Left hand: C with the little finger, G with the thumb.",
    rh: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4",
    lh: "C3:4:5 C3:4:5 G3:4:1 C3:4:5 C3:4:5 C3:4:5 G3:4:1 C3:4:5" },
  { kind: "song", level: "beginner", title: "Hot Cross Buns (both hands)", composer: "Traditional",
    tip: "Left hand: C with the little finger (5), G with the thumb (1).",
    rh: "E4 D4 C4:2 E4 D4 C4:2 C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 E4 D4 C4:2",
    lh: "C3:4:5 C3:4:5 C3:2:5 G3:2:1 C3:4:5" },
  { kind: "song", level: "beginner", title: "Lightly Row (both hands)", composer: "Traditional",
    tip: "Left hand: one note per bar, C (finger 5) or G (thumb).",
    rh: "G4 E4 E4:2 F4 D4 D4:2 C4 D4 E4 F4 G4 G4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4 D4 D4 D4 D4 D4 E4 F4:2 E4 E4 E4 E4 E4 F4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4",
    lh: "C3:4:5 G3:4:1 C3:4:5 C3:4:5 C3:4:5 G3:4:1 C3:4:5 C3:4:5 G3:4:1 G3:4:1 C3:4:5 C3:4:5 C3:4:5 G3:4:1 C3:4:5 C3:4:5" },
  { kind: "song", level: "beginner", title: "Frere Jacques (both hands)", composer: "Traditional",
    tip: "Left hand: thumb on C, little finger on the G below it, two beats each.",
    rh: "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2",
    lh: "C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:2:1 G2:2:5 C3:4:1" },
  { kind: "song", level: "beginner", title: "Au Clair de la Lune (both hands)", composer: "Traditional",
    tip: "Left hand on G A B C D below middle C: G with 5, C with 2, D with the thumb.",
    rh: "C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4 D4 D4 D4 D4 A3:2 A3:2 D4 C4 B3 A3 G3:4 C4 C4 C4 D4 E4:2 D4:2 C4 E4 D4 D4 C4:4",
    lh: "C3:4:2 C3:2:2 G2:2:5 C3:2:2 G2:2:5 C3:4:2 C3:4:2 C3:2:2 G2:2:5 C3:2:2 G2:2:5 C3:4:2 G2:4:5 D3:4:1 G2:4:5 G2:4:5 C3:4:2 C3:2:2 G2:2:5 C3:2:2 G2:2:5 C3:4:2" },
  { kind: "song", level: "beginner", title: "Jingle Bells (both hands)", composer: "Pierpont",
    tip: "Left hand: C (5), F (2) and G (thumb), one per bar.",
    rh: "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4 F4 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:4",
    lh: "C3:4:5 C3:4:5 C3:4:5 C3:4:5 F3:4:2 C3:4:5 G3:4:1 G3:4:1 C3:4:5 C3:4:5 C3:4:5 C3:4:5 F3:4:2 C3:4:5 G3:4:1 C3:4:5" },
  { kind: "song", level: "beginner", title: "When the Saints Go Marching In (both hands)", composer: "Traditional",
    tip: "The right hand starts alone; the left hand comes in on the first long G. C (5), F (2), G (thumb).",
    rh: "C4 E4 F4 G4:5 C4 E4 F4 G4:5 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:6 E4 E4 D4 C4:3 C4 E4:2 G4:2 G4 F4:5 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:6",
    lh: "r:3 C3:4:5 C3:4:5 C3:4:5 C3:4:5 C3:4:5 C3:4:5 G3:4:1 G3:5:1 C3:3:5 C3:6:5 F3:6:2 C3:7:5 G3:2:1 C3:6:5" },
  { kind: "song", level: "beginner", title: "Yankee Doodle (both hands)", composer: "Traditional",
    tip: "Left hand: thumb on C, little finger on the G below, two per bar.",
    rh: "C4 C4 D4 E4 C4 E4 D4 G3 C4 C4 D4 E4 C4:2 B3:2 C4 C4 D4 E4 F4 E4 D4 C4 B3 G3 A3 B3 C4:2 C4:2",
    lh: "C3:4:1 G2:4:5 C3:4:1 G2:4:5 C3:4:1 G2:4:5 G2:4:5 C3:4:1" },
  { kind: "song", level: "beginner", title: "Row Row Row Your Boat (both hands)", composer: "Traditional",
    tip: "Left hand: one C per bar (finger 5), a G (thumb) near the end.",
    rh: "C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3",
    lh: "C3:3:5 C3:3:5 C3:3:5 C3:3:5 C3:3:5 C3:3:5 G3:3:1 C3:3:5" },
];

const items = ITEMS.map((it) => {
  const rh = it.rh ? parse(it.rh) : [], lh = it.lh ? parse(it.lh) : [];
  const len = (line) => line.trim().split(/s+/).reduce((a, tok) => a + Number(tok.split(":")[1] || 1), 0);
  if (it.rh && it.lh && Math.abs(len(it.rh) - len(it.lh)) > 1e-9) console.warn(`  ! ${it.title}: right hand ${len(it.rh)} beats, left hand ${len(it.lh)}`);
  const out = { title: it.title, composer: it.composer || (it.kind === "exercise" ? "Exercise" : ""), level: it.level, kind: it.kind };
  if (it.tip) out.tip = it.tip;
  out.hands = rh.length && lh.length ? "both" : lh.length ? "left" : "right";
  if (out.hands !== "both" && !rh.concat(lh).some((e) => e.keys.length > 1)) {
    // one hand, one note at a time
    const ev = rh.length ? rh : lh;
    out.notes = ev.map((e) => e.keys[0]);
    out.beats = ev.map((e) => e.t);
    if (ev.every((e) => e.fingers)) out.fingers = ev.map((e) => e.fingers[0]);
    else if (!rh.length) throw new Error(it.title + ": left-hand fingers must be written");
  } else {
    // steps: what starts together is played together (right hand's keys first)
    if (rh.length && !rh.every((e) => e.fingers)) {
      const f = fingerRH(rh.map((e) => e.keys[0]));
      rh.forEach((e, i) => { if (!e.fingers) e.fingers = e.keys.length === 1 ? [f[i]] : null; });
    }
    if (lh.some((e) => !e.fingers) || rh.some((e) => !e.fingers)) throw new Error(it.title + ": fingers missing");
    const byT = new Map();
    for (const e of [...rh, ...lh.map((e) => ({ ...e, left: true }))]) {
      const k = Math.round(e.t * 1000);
      if (!byT.has(k)) byT.set(k, { t: e.t, keys: [], fingers: [], lefts: [], name: "" });
      const s = byT.get(k);
      s.keys.push(...e.keys); s.fingers.push(...e.fingers); s.lefts.push(...e.keys.map(() => !!e.left));
      if (e.name && !s.name) s.name = e.name;
    }
    const steps = [...byT.values()].sort((a, b) => a.t - b.t);
    out.notes = steps.map((s) => s.keys[0]);
    out.beats = steps.map((s) => s.t);
    // lefts: which keys are the left hand's (a left hand can reach middle C and above)
    out.chords = steps.map((s) => ({ name: s.name, keys: s.keys, fingers: s.fingers, section: "", ...(rh.length && lh.length ? { lefts: s.lefts } : {}) }));
  }
  out.license = "Public Domain";
  return out;
});
const file = path.join(__dirname, "..", "lessons.json");
fs.writeFileSync(file, JSON.stringify(items));
console.log(`${items.length} items -> lessons.json`);
for (const x of items) console.log(`  ${x.kind.padEnd(8)} ${x.level.padEnd(12)} ${x.hands.padEnd(5)} ${String(x.notes.length).padStart(4)}  ${x.title}`);
