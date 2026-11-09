"""Write chords.json: songs played as chords (a whole chord per step), for the play-along.

    .venv\\Scripts\\python.exe piano\\tools\\make_chords.py

Each step is one chord: the right hand plays a close voicing around E4-F#5, the left hand the root
below middle C. `notes` holds the top key of each chord (the app scrolls to it and shows it on the
staff); `chords` holds every key and finger. Only the chord progression is stored, no lyrics or melody.
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "chords.json"

# name: (right-hand keys low to high, their fingers, left-hand root)
VOICING = {
    "Am":    ([69, 72, 76],     [1, 3, 5],    45),  # A C E        + A2
    "D7":    ([69, 72, 74, 78], [1, 2, 3, 5], 50),  # A C D F#     + D3
    "G7":    ([67, 71, 74, 77], [1, 2, 3, 5], 43),  # G B D F      + G2
    "C7":    ([67, 70, 72, 76], [1, 2, 3, 5], 48),  # G Bb C E     + C3
    "C":     ([67, 72, 76],     [1, 2, 5],    48),  # G C E        + C3
    "F#dim": ([66, 69, 72],     [1, 3, 5],    42),  # F# A C       + F#2
    "B7":    ([66, 69, 71, 75], [1, 2, 3, 5], 47),  # F# A B D#    + B2
    "Em":    ([67, 71, 76],     [1, 2, 5],    52),  # G B E        + E3
}

# Moody Wind (Anthony Lazaro), E minor, about 115 bpm. Chart: Cifra Club. One bar per chord, two on Em.
CYCLE = ["Am", "D7", "G7", "C7", "F#dim", "B7", "Em"]
SOLO = ["Am", "D7", "G7", "C", "F#dim", "B7", "Em"]
MOODY_WIND = [("Intro", CYCLE, 1), ("Verse 1", CYCLE, 2), ("Chorus", CYCLE, 2), ("Verse 2", CYCLE, 2),
              ("Chorus", CYCLE, 2), ("Solo", SOLO, 1), ("Ending", CYCLE, 1)]


def song(title, composer, form, bpm, source):
    notes, beats, chords, t = [], [], [], 0.0
    for section, cycle, times in form:
        for _ in range(times):
            for name in cycle:
                rh, fingers, lh = VOICING[name]
                notes.append(rh[-1])
                beats.append(t)
                chords.append({"name": name, "keys": rh + [lh], "fingers": fingers + [5], "section": section})
                t += 8 if name == "Em" else 4
    return {"title": title, "composer": composer, "notes": notes, "beats": beats, "chords": chords,
            "bpm": bpm, "source": source, "license": "chord progression only"}


def main():
    songs = [song("Moody Wind (chords)", "Anthony Lazaro", MOODY_WIND, 115,
                  "https://www.cifraclub.com/anthony-lazaro/moody-wind/")]
    OUT.write_text(json.dumps(songs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="")
    print(f"wrote {OUT}: " + ", ".join(f"{s['title']} ({len(s['chords'])} chords)" for s in songs))


if __name__ == "__main__":
    main()
