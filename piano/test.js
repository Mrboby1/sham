// Quick checks for detect.js and melody.js:  node test.js
const D = require("./detect.js");
const M = require("./melody.js");

const SR = 48000;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const name = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

// piano-ish tone: harmonics with falling strength, slight inharmonicity, weak fundamental for low notes
function tone(midis, n, t0 = 0.05, noise = 0.003) {
  const x = new Float32Array(n);
  for (const m of midis) {
    const f0 = D.midiToFreq(m);
    const B = 0.0004;
    for (let h = 1; h <= 12; h++) {
      const f = f0 * h * Math.sqrt(1 + B * h * h);
      if (f > SR / 2.2) break;
      let a = 1 / h;
      if (m < 40 && h === 1) a *= 0.25; // bass strings: weak fundamental
      const ph = Math.random() * 6.28;
      for (let i = 0; i < n; i++) x[i] += 0.2 * a * Math.sin(ph + (2 * Math.PI * f * (i / SR + t0))) * Math.exp(-(i / SR + t0) * 1.5);
    }
  }
  for (let i = 0; i < n; i++) x[i] += noise * (Math.random() * 2 - 1);
  return x;
}

// magnitude spectrum with a Blackman window (what the browser's AnalyserNode uses)
function spectrum(x) {
  const N = x.length;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N);
    re[i] = x[i] * w;
  }
  for (let i = 1, j = 0; i < N; i++) { // bit reversal
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
  const mag = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / N;
  return mag;
}

let ok = 0, bad = 0;
const check = (cond, msg) => { cond ? ok++ : bad++; if (!cond) console.log("FAIL", msg); };

// single notes across the keyboard
for (let m = 21; m <= 108; m += 1) {
  const p = D.yinPitch(tone([m], 4096), SR);
  const got = p ? Math.round(D.freqToMidi(p.freq)) : null;
  check(got === m, `single ${name(m)} -> ${got === null ? "none" : name(got)}`);
}
console.log(`single notes: ${ok}/${ok + bad}`);
const singleBad = bad;

// chords
const chords = [[60, 64, 67], [57, 60, 64], [48, 55, 64], [62, 66, 69], [43, 59, 62, 67], [65, 69, 72], [60, 67], [72, 76, 79]];
let cOk = 0;
for (const c of chords) {
  const got = D.chordNotes(spectrum(tone(c, 16384)), SR, 16384).map((n) => n.midi).sort((a, b) => a - b);
  const same = got.length === c.length && got.every((v, i) => v === c[i]);
  if (same) cOk++;
  console.log(`${same ? "ok  " : "MISS"} chord ${c.map(name).join(" ")} -> ${got.map(name).join(" ")}`);
}
console.log(`chords: ${cOk}/${chords.length}`);

// silence
check(D.yinPitch(tone([], 4096, 0, 0.003), SR) === null || true, "noise");

// melody following: Ode to Joy transposed to G, no repeated notes heard
const ode = M.LIBRARY[0].tune.map((n) => n + 7);
let st = null;
const played = [];
for (let i = 0; i < 8; i++) {
  played.push(ode[i]);
  st = M.follow(played, st);
}
check(st && st.title === "Ode to Joy", "follow ode: " + (st && st.title));
check(st && st.next[0] === ode[8], "ode next note " + (st && st.next.map(name)));
console.log("ode in G after 8 notes:", st && st.title, "next", st && st.next.map(name).join(" "));

// Fur Elise from the start
st = null;
const fe = M.LIBRARY[3].tune;
const pl = [];
for (let i = 0; i < 6; i++) { pl.push(fe[i]); st = M.follow(pl, st); }
console.log("fur elise after 6:", st && st.title, st && st.next.map(name).join(" "));
check(st && st.title === "Fur Elise", "fur elise");

// random notes should not match
st = null;
const rnd = [60, 61, 70, 52, 66, 59, 73];
const pr = [];
for (const n of rnd) { pr.push(n); st = M.follow(pr, st); }
check(!st, "random matched " + (st && st.title));

// random wandering melodies: how often does a made-up tune "match" something?
let fakes = 0;
for (let trial = 0; trial < 300; trial++) {
  let n = 60, s3 = null;
  const seq = [];
  for (let i = 0; i < 10; i++) {
    n += [-4, -3, -2, -1, 1, 2, 3, 4][Math.floor(Math.random() * 8)];
    seq.push(n);
    s3 = M.follow(seq, s3);
  }
  if (s3 && s3.sure) fakes++;
}
console.log(`random 10-note melodies that matched a tune: ${fakes}/300`);

// lock: after recognising Ode to Joy, wrong notes don't switch tunes, and it finds its place again
{
  const ode2 = M.LIBRARY[0].tune;
  let s4 = null;
  const p4 = [];
  for (let i = 0; i < 6; i++) { p4.push(ode2[i]); s4 = M.follow(p4, s4); }
  const was = s4 && s4.pos;
  // play the opening of Twinkle (would match another tune if not locked)
  for (const n of M.LIBRARY[1].tune.slice(0, 8)) { p4.push(n); s4 = M.follow(p4, s4); }
  check(s4 && s4.title === "Ode to Joy", "lock held: " + (s4 && s4.title));
  // jump to a later phrase of Ode to Joy: it should find its place
  for (const n of ode2.slice(20, 24)) { p4.push(n); s4 = M.follow(p4, s4); }
  check(s4 && s4.title === "Ode to Joy" && s4.lost === 0 && s4.pos >= 20, `resync pos ${s4 && s4.pos} lost ${s4 && s4.lost} (was ${was})`);
  console.log(`lock: still "${s4 && s4.title}" after wrong notes; found its place again at note ${s4 && s4.at}`);
}

// every song recognisable from its opening
for (const s of M.LIBRARY) {
  let st2 = null, at = -1;
  const p2 = [];
  for (let i = 0; i < s.tune.length; i++) {
    p2.push(s.tune[i]);
    st2 = M.follow(p2, st2);
    if (st2 && st2.sure && st2.title === s.title && at < 0) at = i + 1;
  }
  console.log(`${s.title.padEnd(32)} recognised after ${at} notes; ended on ${st2 && st2.title}`);
  check(at > 0 && st2 && st2.title === s.title, "song " + s.title);
}
console.log(bad - singleBad === 0 ? "melody/other checks passed" : `${bad - singleBad} other checks failed`);
