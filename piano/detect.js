// Pitch detection for Piano Notes. Pure functions, no browser APIs, so they can be tested in node.
//   yinPitch(samples, sampleRate)   -> {freq, clarity} | null       one note at a time (melodies, tuning)
//   chordNotes(mag, sampleRate, fftSize, opts) -> [{midi, strength}]   several notes at once (best effort)
(function (root) {
  "use strict";

  const A0 = 21, C8 = 108;
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

  // Downsample by 2 (average pairs). Piano tops out at 4.2 kHz, so 24 kHz keeps everything we need
  // and makes YIN 4x cheaper.
  function half(x) {
    const out = new Float32Array(x.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = 0.5 * (x[2 * i] + x[2 * i + 1]);
    return out;
  }

  function rms(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / x.length);
  }

  // YIN (de Cheveigne & Kawahara 2002): cumulative-mean-normalised difference, first dip under threshold.
  // `samples` should hold ~4096 samples at 44.1/48 kHz (about 85 ms), enough for two periods of A0.
  function yinPitch(samples, sampleRate, threshold = 0.15) {
    if (sampleRate > 30000) {
      const p = yinCore(half(samples), sampleRate / 2, threshold, 26);
      // top octaves have periods of only a few samples at 24 kHz: re-check at full rate
      if (p && p.freq > 900) return yinCore(samples.subarray(samples.length - 1024), sampleRate, threshold, 800) || p;
      return p;
    }
    return yinCore(samples, sampleRate, threshold, 26);
  }

  function yinCore(x, sr, threshold, minFreq) {
    const maxTau = Math.min(Math.floor(sr / minFreq), Math.floor(x.length / 2));
    const minTau = Math.max(2, Math.floor(sr / 4400));
    const W = x.length - maxTau;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) {
        const v = x[j] - x[j + tau];
        s += v * v;
      }
      d[tau] = s;
    }
    // cumulative mean normalisation
    const c = new Float32Array(maxTau + 1);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      run += d[tau];
      c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = minTau; t < maxTau; t++) {
      if (c[t] < threshold) {
        while (t + 1 < maxTau && c[t + 1] < c[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;
    // parabolic interpolation around the dip
    const a = c[tau - 1], b = c[tau], e = c[tau + 1];
    const denom = a + e - 2 * b;
    const shift = denom !== 0 ? (0.5 * (a - e)) / denom : 0;
    const freq = sr / (tau + Math.max(-1, Math.min(1, shift)));
    if (freq < 26 || freq > 4400) return null;
    return { freq, clarity: 1 - b };
  }

  // Several notes at once. `mag` = linear magnitude spectrum (fftSize/2 bins).
  // For every piano key, add up the energy at its first harmonics; take the strongest key, remove its
  // harmonics from the spectrum, and repeat. Removing harmonics stops a C4 from also reporting C5 / G5.
  function chordNotes(mag, sampleRate, fftSize, opts = {}) {
    const maxNotes = opts.maxNotes || 4;
    const rel = opts.relative || 0.3;
    const binHz = sampleRate / fftSize;
    const spec = Float32Array.from(mag);
    const nb = spec.length;

    const peakAround = (f) => {
      const lo = Math.max(1, Math.floor((f * 0.983) / binHz)); // +-30 cents
      const hi = Math.min(nb - 1, Math.ceil((f * 1.017) / binHz));
      let best = 0, at = -1;
      for (let i = lo; i <= hi; i++) if (spec[i] > best) { best = spec[i]; at = i; }
      return [best, at];
    };
    const salience = (m) => {
      const f0 = midiToFreq(m);
      if (f0 / binHz < 3) return 0; // too low to resolve at this FFT size
      let s = 0;
      for (let h = 1; h <= 6; h++) {
        const f = f0 * h;
        if (f > 6000) break;
        s += peakAround(f)[0] / Math.sqrt(h);
      }
      // A real note has its own energy at the fundamental. (Bass strings are the exception: their
      // fundamental is weak, so below A2 the octave above counts too.) Without this check a C-E-G
      // chord also "finds" a C an octave lower, whose harmonics land on all three notes.
      const f1 = peakAround(f0)[0], f2 = peakAround(2 * f0)[0];
      const own = m >= 45 || f1 < 0.1 * f2 ? f1 : Math.max(f1, f2);
      if (own < s * 0.25) s *= 0.25;
      return s;
    };

    const found = [];
    let first = 0;
    for (let k = 0; k < maxNotes; k++) {
      let best = 0, bestM = -1;
      for (let m = A0; m <= C8; m++) {
        if (found.some((n) => n.midi === m)) continue;
        const s = salience(m);
        if (s > best) { best = s; bestM = m; }
      }
      if (bestM < 0) break;
      if (k === 0) first = best;
      else if (best < first * rel) break;
      found.push({ midi: bestM, strength: k === 0 ? 1 : best / first });
      // remove this note's harmonics
      const f0 = midiToFreq(bestM);
      for (let h = 1; h <= 10; h++) {
        const f = f0 * h;
        const lo = Math.max(1, Math.floor((f * 0.98) / binHz) - 1);
        const hi = Math.min(nb - 1, Math.ceil((f * 1.02) / binHz) + 1);
        for (let i = lo; i <= hi; i++) spec[i] *= 0.12;
      }
    }
    return found;
  }

  const api = { yinPitch, chordNotes, rms, midiToFreq, freqToMidi, A0, C8 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Detect = api;
})(this);
