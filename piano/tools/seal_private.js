// Encrypt the private songs for the site.
//
//     node piano\tools\seal_private.js
//
// Reads piano/private/songs.json (plain, never published: same format as songs.json) and the
// passphrase in piano/private/key.txt (made on the first run), and writes piano/private.json:
// AES-256-GCM with a key from PBKDF2-SHA256. Only a phone that opened the site with
// #key=<passphrase> can read it (app.js, unseal()).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PIANO = path.resolve(__dirname, "..");
const DIR = path.join(PIANO, "private");
const KEY = path.join(DIR, "key.txt");
const SRC = path.join(DIR, "songs.json");
const OUT = path.join(PIANO, "private.json");
const ITER = 200000;

fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(KEY)) fs.writeFileSync(KEY, crypto.randomBytes(18).toString("base64url"));
if (!fs.existsSync(SRC)) fs.writeFileSync(SRC, "[]");
const pass = fs.readFileSync(KEY, "utf8").trim();
const songs = JSON.parse(fs.readFileSync(SRC, "utf8"));

const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(pass, salt, ITER, 32, "sha256");
const c = crypto.createCipheriv("aes-256-gcm", key, iv);
const data = Buffer.concat([c.update(JSON.stringify(songs), "utf8"), c.final(), c.getAuthTag()]);
fs.writeFileSync(OUT, JSON.stringify({ iter: ITER, salt: salt.toString("base64"), iv: iv.toString("base64"), data: data.toString("base64") }));
console.log(`wrote ${OUT}: ${songs.length} private song(s): ${songs.map((s) => s.title).join(", ")}`);
