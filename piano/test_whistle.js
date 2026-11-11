// node test_whistle.js : synthetic whistles (detuned, vibrato, slides, breath noise) -> the right notes?
const W = require("./whistle-core.js");

const SR = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// tune: [[midi, seconds], ...]; repeated notes get a short breath gap, others a pitch slide
function whistle(tune, { detune = 0.35, vib = 0.25, noise = 0.02, slide = 0.04, gap = 0.06, amp = 0.3 } = {}) {
  const parts = [];
  let phase = 0;
  const tone = (m0, m1, dur, a) => {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR, k = i / n;
      const m = m0 + (m1 - m0) * k + detune + vib * Math.sin(2 * Math.PI * 5.5 * t);
      phase += (2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12)) / SR;
      const env = Math.min(1, i / (0.015 * SR), (n - i) / (0.015 * SR));
      out[i] = a * env * Math.sin(phase) + noise * (rnd() * 2 - 1);
    }
    return out;
  };
  const silence = (dur) => Float32Array.from({ length: Math.round(dur * SR) }, () => noise * 0.3 * (rnd() * 2 - 1));
  parts.push(silence(0.3));
  tune.forEach(([m, d], i) => {
    parts.push(tone(m, m, d, amp));
    const next = tune[i + 1];
    if (!next) return;
    if (next[0] === m) parts.push(silence(gap));
    else parts.push(tone(m, next[0], slide, amp));
  });
  parts.push(silence(0.3));
  const len = parts.reduce((s, p) => s + p.length, 0), all = new Float32Array(len);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}

const P = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (s) => { const m = /^([A-G])(#?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + P[m[1]] + (m[2] ? 1 : 0); };
const tuneOf = (s, d = 0.35) => s.split(" ").map((x) => [midi(x), d]);

let fails = 0;
function check(name, tune, opts, wantShifted) {
  const frames = W.analyze(whistle(tune, opts), SR);
  const r = W.transcribe(frames);
  const got = r.notes.map((n) => W.noteName(n.midi + r.shift)).join(" ");
  const ok = got === wantShifted;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: offset ${(r.offset * 100).toFixed(0)}c shift ${r.shift}\n     got  ${got}${ok ? "" : "\n     want " + wantShifted}`);
}

check("Twinkle, whistled 2 octaves up, +35c",
  tuneOf("C6 C6 G6 G6 A6 A6 G6 F6 F6 E6 E6 D6 D6 C6"), {},
  "C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4");
check("Ode to Joy, -40c, strong vibrato",
  tuneOf("E6 E6 F6 G6 G6 F6 E6 D6 C6 C6 D6 E6 E6 D6 D6", 0.3), { detune: -0.4, vib: 0.35 },
  "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4");
check("Fast notes (0.14 s), noisy",
  tuneOf("G5 A5 B5 C6 D6 E6 F#6 G6", 0.14), { noise: 0.05, detune: 0.1 },
  "G3 A3 B3 C4 D4 E4 F#4 G4");
check("Big leaps with slow slides",
  tuneOf("C6 C7 G6 E6 C6", 0.4), { slide: 0.09 },
  "C4 C5 G4 E4 C4");
check("Hummed low (A2..E3)",
  tuneOf("A2 C3 E3 C3 A2", 0.35), { vib: 0.15, detune: 0.2 },
  "A3 C4 E4 C4 A3");

// tuning offset wraps around: notes at +0.45 and -0.45 semitones are close
const off = W.tuningOffset([60.45, 62.55, 64.48]);
if (Math.abs(off - 0.49) > 0.06 && Math.abs(off + 0.51) > 0.06) { fails++; console.log("FAIL tuningOffset", off); }
else console.log("ok   tuningOffset wraps:", off.toFixed(2));

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
