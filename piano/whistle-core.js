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
    const gate = Math.max(0.003, floor * 3, peak * 0.02); // soft notes count too: YIN's clarity rejects noise
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

  // A whistler's tuning drifts: Sham's Toccata went from ~1 semitone sharp to ~half a semitone flat in 15 s.
  // One fixed tuning would snap half the notes the wrong way. Instead find, for each note, a tuning offset so
  // that (a) every note lands close to a key and (b) the offset only drifts slowly from note to note, which keeps
  // the intervals between neighbouring notes right. Viterbi over offsets -1.5..+1.5 semitones in 0.05 steps.
  function driftingTuning(notes, drift = 2) {
    if (!notes.length) return [];
    const S = [];
    for (let o = -1.5; o <= 1.5001; o += 0.05) S.push(o);
    const fit = (g, o) => { const d = g.m - o - Math.round(g.m - o); return Math.max(0.05, g.dur) * d * d; };
    let cost = S.map((o) => fit(notes[0], o) + 0.02 * o * o);
    const back = [];
    for (let i = 1; i < notes.length; i++) {
      const gapT = Math.max(0, notes[i].start - notes[i - 1].start);
      const lam = drift / (1 + gapT); // a long pause lets the tuning move more
      const nc = new Array(S.length), bk = new Array(S.length);
      for (let j = 0; j < S.length; j++) {
        let best = Infinity, arg = 0;
        for (let k = 0; k < S.length; k++) {
          const c = cost[k] + lam * (S[j] - S[k]) ** 2;
          if (c < best) { best = c; arg = k; }
        }
        nc[j] = best + fit(notes[i], S[j]) + 0.02 * S[j] * S[j];
        bk[j] = arg;
      }
      cost = nc;
      back.push(bk);
    }
    let j = cost.indexOf(Math.min(...cost));
    const path = [S[j]];
    for (let i = back.length - 1; i >= 0; i--) { j = back[i][j]; path.unshift(S[j]); }
    return path;
  }

  // frames: [{t, midi|null, level}] in time order. Returns notes in the pitch that was whistled (no octave shift).
  // Real whistles (Sham's test recording, 2026-11-11): loudness swings 3-5x inside one note, quiet notes are
  // still clean tones, slides between notes last 100-300 ms, and the whistler's tuning drifts by a quarter tone.
  // So: (1) frames where the pitch is sliding fast are left out of notes, (2) a new note needs a deep dip
  // relative to the note's *average* loudness (not its loudest moment), or a pitch change that holds,
  // (3) each note's pitch is the median of all its frames, snapped only at the end.
  function transcribe(frames, opts = {}) {
    const minNote = opts.minNote ?? 0.07;    // s: shorter = a blip, dropped
    const maxGap = opts.maxGap ?? 0.05;      // s: a gap (silence or slide) longer than this ends a note
    const settle = opts.settle ?? 0.05;      // s: a new pitch must hold this long to start a new note
    const maxSlope = opts.maxSlope ?? 15;    // semitones/s: faster than vibrato = sliding between notes
    const dip = opts.dip ?? 0.3;             // loudness under 30% of the note's average = a breath / tongue stop
    const n = frames.length;
    const frameDur = n > 1 ? (frames[n - 1].t - frames[0].t) / (n - 1) : 0.016;

    // median of 5 within voiced frames: kills single-frame octave jumps and clicks
    const raw = frames.map((f) => f.midi);
    const sm = raw.map((v, i) => {
      if (v == null) return null;
      const w = [];
      for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < n && raw[k] != null) w.push(raw[k]);
      return median(w);
    });
    const moving = sm.map((v, i) => {
      if (v == null) return false;
      let a = -1, b = -1;
      for (let k = i - 2; k < i; k++) if (k >= 0 && sm[k] != null) { a = k; break; }
      for (let k = i + 2; k > i; k--) if (k < n && sm[k] != null) { b = k; break; }
      if (a < 0) a = i;
      if (b < 0) b = i;
      if (a === b) return false;
      return Math.abs(sm[b] - sm[a]) / (frames[b].t - frames[a].t) > maxSlope;
    });

    const segs = [];
    let cur = null, cand = null;
    let broke = true; // the last note ended in silence or a breath (not a slide): the next one is a new attack
    const open = (i, afterDip) => {
      cur = { p: [sm[i]], start: frames[i].t, end: frames[i].t, last: frames[i].t, ref: frames[i].level ?? 1, dipped: false, afterDip };
      cand = null;
    };
    const close = () => { if (cur) segs.push(cur); cur = null; cand = null; };
    for (let i = 0; i < n; i++) {
      const t = frames[i].t, v = sm[i], lvl = frames[i].level ?? 1;
      if (v == null || moving[i]) {
        // A new attack needs the tone to actually stop (no pitch) and the sound to fall well below the note's
        // loudness. Getting louder or softer while the tone keeps going is never a new note (Sham, 2026-11-11).
        if (v == null && cur && lvl < dip * cur.ref) cur.dipped = true;
        if (v == null && (!cur || cur.dipped || t - cur.last > maxGap)) broke = true;
        if (cur && t - cur.last > maxGap) close();
        continue;
      }
      if (!cur) { open(i, broke); broke = false; continue; }
      if (cur.dipped) { close(); open(i, true); broke = false; continue; } // the tone stopped and started again
      const c = median(cur.p.slice(-12));
      if (Math.abs(v - c) < 0.6) {
        cur.p.push(v); cur.end = t; cur.last = t; cand = null;
        cur.ref += (lvl > cur.ref ? 0.15 : 0.03) * (lvl - cur.ref); // the note's typical loudness: up fast, down slowly
        continue;
      }
      if (!cand || Math.abs(v - cand.v) > 0.6) { cand = { v, i, t }; continue; }
      if (t - cand.t >= settle) {
        const ci = cand.i;
        cur.end = cand.t;
        close();
        open(ci, false);
        cur.end = cur.last = t;
      }
    }
    close();

    // each note's pitch: median of its frames; the whistler's own tuning from all notes, weighted by length
    const notesRaw = segs
      .map((g) => ({ m: median(g.p), start: g.start, dur: g.end - g.start + frameDur, afterDip: g.afterDip }))
      .filter((g) => g.dur >= minNote);
    const tune = opts.offset != null ? notesRaw.map(() => opts.offset) : driftingTuning(notesRaw);
    const offset = tune.length ? median(tune) : 0;
    const out = [];
    for (const [i, g] of notesRaw.entries()) {
      const midi = Math.round(g.m - tune[i]);
      const p = out[out.length - 1];
      // the same note broken by a slide-shaped wobble (not a breath): one note
      if (p && p.midi === midi && !g.afterDip && g.start - (p.start + p.dur) < 0.12) { p.dur = g.start + g.dur - p.start; continue; }
      out.push({ midi, start: g.start, dur: g.dur });
    }
    return { notes: out, offset, shift: autoShift(out.map((x) => x.midi)) };
  }

  const LETTER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SOLFEGE = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const noteName = (m, solfege) => (solfege ? SOLFEGE : LETTER)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  const api = { analyze, transcribe, tuningOffset, autoShift, frame, noteName, LO_HZ, HI_HZ };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Whistle = api;
})(this);
