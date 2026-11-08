# sham

## Piano Notes

**Open it:** https://mrboby1.github.io/sham/piano/

A web app for iPhone (it works on any phone or computer). It listens to a piano through the
microphone and:

- lights up the keys you play on a full 88-key keyboard (A0 to C8)
- writes the notes on a grand staff, with the note names (C D E or Do Re Mi)
- recognises a tune it knows after a few notes, shows its name, and highlights the next keys to play
- shows how in tune each note is

To install it on an iPhone, open the link in Safari, tap **Share**, then **Add to Home Screen**.

Everything runs on the phone. There's no server and no account, and no audio leaves the phone.

Files: `piano/detect.js` (pitch and chord detection), `piano/melody.js` (the tune list and
recogniser), `piano/app.js` (screen, keyboard and staff). Run `node piano/test.js` for the checks.
