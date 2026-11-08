// Compare computed fingering with standard fingerings:  node test_fingering.js
const { fingerRH } = require("./fingering.js");
const M = require("./melody.js");
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const parse = (s) => s.split(" ").map((x) => { const m = /^([A-G])(#)?(\d)$/.exec(x); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] ? 1 : 0); });

const cases = [
  ["Ode to Joy", "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4", "3 3 4 5 5 4 3 2 1 1 2 3 3 2 2"],
  ["C major scale up", "C4 D4 E4 F4 G4 A4 B4 C5", "1 2 3 1 2 3 4 5"],
  ["C major scale down", "C5 B4 A4 G4 F4 E4 D4 C4", "5 4 3 2 1 3 2 1"],
  ["Fur Elise opening", "E5 D#5 E5 D#5 E5 B4 D5 C5 A4", "5 4 5 4 5 2 4 3 1"],
  ["Twinkle", "C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4", "1 1 4 4 5 5 4 3 3 2 2 1 1 1"],
  ["Mary had a little lamb", "E4 D4 C4 D4 E4 E4 E4", "3 2 1 2 3 3 3"],
  ["C major, two octaves up", "C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6", "1 2 3 1 2 3 4 1 2 3 1 2 3 4 5"],
  ["D major scale up", "D4 E4 F#4 G4 A4 B4 C#5 D5", "1 2 3 1 2 3 4 5"],
  ["G major scale down", "G5 F#5 E5 D5 C5 B4 A4 G4", "5 4 3 2 1 3 2 1"],
  ["Minuet in G opening", "D5 G4 A4 B4 C5 D5 G4 G4", "5 1 2 3 4 5 1 1"],
];
let exact = 0, close = 0, total = 0;
for (const [name, notes, want] of cases) {
  const got = fingerRH(parse(notes));
  const w = want.split(" ").map(Number);
  const same = got.filter((f, i) => f === w[i]).length;
  exact += same; total += w.length;
  close += got.filter((f, i) => Math.abs(f - w[i]) <= 1).length;
  console.log(`${name.padEnd(24)} got  ${got.join(" ")}\n${"".padEnd(24)} want ${want}   (${same}/${w.length})`);
}
console.log(`\nexact ${exact}/${total}, within one finger ${close}/${total}`);

// speed on the longest piece
const songs = require("./songs.json");
const big = songs.reduce((a, b) => (a.notes.length > b.notes.length ? a : b));
const t = Date.now();
const f = fingerRH(big.notes);
console.log(`${big.title}: ${big.notes.length} notes fingered in ${Date.now() - t} ms; first 20: ${f.slice(0, 20).join(" ")}`);
