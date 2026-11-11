// Whistle to notes: the pure part (no browser APIs), so it can be tested in node.
//   analyze(samples, sampleRate, hopSec)  -> frames [{t, midi|null, level}]   pitch track of a recording
//   transcribe(frames, opts)              -> {notes:[{midi, start, dur}], offset, shift, raw}
//   autoShift(midis)                      -> octaves (in semitones) that bring the tune into piano middle range
// A whistle is close to a pure tone, so one-note-at-a-time YIN (detect.js) tracks it well. The work is in
// turning a wobbly, sliding pitch line into clean notes: tuning offset, smoothing, hysteresis, min length.
(function (root) {
  "use strict";

  const D = typeof module !== "undefined" && module.exports ? require("./detect.js") : root.Detect;
  const { yinPitch, rms } = D;

  const LO_HZ = 80, HI_HZ = 4400;   // a hum down to E2 .. the top of a whistle
  const MIN_CLARITY = 0.75;

  // One frame of audio -> {midi (fractional) | null, level}
  function frame(samples, sr, gate) {
    // loudness of the newest ~16 ms only: short enough to see the breath dip between two repeated notes
    const level = rms(samples.subarray(Math.max(0, samples.length - Math.round(0.016 * sr))));
    if (level < gate) return { midi: null, level };
    const p = yinPitch(samples, sr, 0.2);
    if (!p || p.clarity < MIN_CLARITY || p.freq < LO_HZ || p.freq > HI_HZ) return { midi: null, level };
    return { midi: 69 + 12 * Math.log2(p.freq / 440), level };
  }

  // Pitch track of a whole recording (an uploaded voice memo, or a test signal).
  function analyze(samples, sr, hopSec = 0.016) {
    const win = sr > 30000 ? 2048 : 1024;
    const hop = Math.max(1, Math.round(hopSec * sr));
    // gate: well above the quietest part of the recording (room noise), and above digital silence
    const levels = [];
    for (let i = 0; i + win <= samples.length; i += hop * 4) levels.push(rms(samples.subarray(i, i + win)));
    levels.sort((a, b) => a - b);
    const floor = levels.length ? levels[Math.floor(levels.length * 0.1)] : 0;
    const peak = levels.length ? levels[Math.floor(levels.length * 0.98)] : 0;
    const gate = Math.max(0.003, floor * 3, peak * 0.08);
    const out = [];
    for (let i = 0; i + win <= samples.length; i += hop) {
      const f = frame(samples.subarray(i, i + win), sr, gate);
      out.push({ t: (i + win / 2) / sr, midi: f.midi, level: f.level });
    }
    return out;
  }

  // Whistlers are rarely tuned to A=440. Find their own tuning: the average distance from the nearest
  // semitone, averaged on a circle so +0.45 and -0.45 count as close together.
  function tuningOffset(midis) {
    if (!midis.length) return 0;
    let s = 0, c = 0;
    for (const m of midis) { s += Math.sin(2 * Math.PI * m); c += Math.cos(2 * Math.PI * m); }
    return Math.atan2(s, c) / (2 * Math.PI); // -0.5 .. 0.5 semitones
  }

  function median(a) {
    const b = a.slice().sort((x, y) => x - y);
    return b.length ? b[b.length >> 1] : 0;
  }

  // Bring the tune to the octave above middle C (a whistle sits 1-2 octaves above where a piano tune is usually written).
  function autoShift(midis) {
    if (!midis.length) return 0;
    let shift = -12 * Math.floor((median(midis) - 60) / 12); // middle of the tune lands in C4..B4
    while (Math.min(...midis) + shift < 21) shift += 12;
    while (Math.max(...midis) + shift > 108) shift -= 12;
    return shift;
  }

  // frames: [{t, midi|null}] in time order. Returns notes in the pitch that was whistled (no octave shift).
  function transcribe(frames, opts = {}) {
    const minNote = opts.minNote ?? 0.09;    // s: shorter = a slide or a blip, dropped
    const maxGap = opts.maxGap ?? 0.06;      // s: silence longer than this ends a note
    const settle = opts.settle ?? 0.05;      // s: a new pitch must hold this long to start a new note
    const voiced = frames.filter((f) => f.midi != null);
    const offset = opts.offset ?? tuningOffset(voiced.map((f) => f.midi));

    // median of 5 within each voiced run: kills single-frame octave jumps and clicks
    const q = frames.map((f) => (f.midi == null ? null : f.midi - offset));
    const sm = q.map((v, i) => {
      if (v == null) return null;
      const w = [];
      for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < q.length && q[k] != null) w.push(q[k]);
      return median(w);
    });

    const dip = opts.dip ?? 0.35;            // a breath between repeated notes: loudness falls under 35% of the note's
    const notes = [];
    let cur = null;        // {midi, start, end, ref, dipped}
    let cand = null;       // {midi, start}
    let lastVoiced = -1;
    const close = () => { if (cur) notes.push(cur); cur = null; cand = null; };
    const open = (midi, t, level) => { cur = { midi, start: t, end: t, ref: level, dipped: false }; cand = null; };
    for (let i = 0; i < frames.length; i++) {
      const t = frames[i].t, v = sm[i], level = frames[i].level ?? 1;
      if (cur && level < dip * cur.ref) cur.dipped = true;
      if (v == null) {
        if (cur && t - lastVoiced > maxGap) close();
        continue;
      }
      lastVoiced = t;
      const r = Math.round(v);
      if (!cur) { open(r, t, level); continue; }
      if (cur.dipped && level >= 0.6 * cur.ref) { close(); open(r, t, level); continue; } // re-articulated
      if (cur.dipped) continue;                 // still in the dip: belongs to no note
      if (Math.abs(v - cur.midi) < 0.65) {      // still the same note (vibrato, drift)
        cur.end = t; cur.ref = Math.max(cur.ref, level); cand = null; continue;
      }
      if (!cand || cand.midi !== r) { cand = { midi: r, start: t }; continue; }
      if (t - cand.start >= settle) {
        cur.end = cand.start;
        notes.push(cur);
        open(r, cand.start, level);
        cur.end = t;
      }
    }
    close();

    const frameDur = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 0.016;
    const out = notes
      .map((n) => ({ midi: n.midi, start: n.start, dur: n.end - n.start + frameDur }))
      .filter((n) => n.dur >= minNote);
    return { notes: out, offset, shift: autoShift(out.map((n) => n.midi)) };
  }

  const LETTER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SOLFEGE = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const noteName = (m, solfege) => (solfege ? SOLFEGE : LETTER)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  const api = { analyze, transcribe, tuningOffset, autoShift, frame, noteName, LO_HZ, HI_HZ };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Whistle = api;
})(this);
