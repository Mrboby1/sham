r"""Add a left-hand part to every piece in songs.json (Sham, 2026-11-12: "2 sets of notes for each song,
right hand / left hand").

The right hand is what fetch_songs.py already extracted (top line of the highest track). The left hand
comes from the same compiled MIDI (midi_src/src/...): the lowest-sounding track (the piano's lower staff,
the cello / bass in a string piece), keeping the lowest note at each onset, so it can be played one note
at a time. The organ Toccata uses the left-hand manual, not the pedals.

  Run from the piano folder:  ..\.venv\Scripts\python.exe tools\make_hands.py
Needs the MIDI files that fetch_songs.py leaves in midi_src/src (no network).
"""
import json
import sys
from pathlib import Path

import mido

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "tools"))
from fetch_songs import PIECES, WORK  # noqa: E402

OUT = HERE / "songs.json"
LH_TRACK = {"Toccata and Fugue in D minor": 1}  # index among the note tracks, highest first


def note_tracks(mid):
    out = []
    for tr in mid.tracks:
        t, notes = 0, []
        for msg in tr:
            t += msg.time
            if msg.type == "note_on" and msg.velocity > 0 and msg.channel != 9:
                notes.append((t, msg.note))
        if len(notes) >= 16:
            out.append(notes)
    return sorted(out, key=lambda ns: -sum(n for _, n in ns) / len(ns))  # highest first


def left_hand(mid_path, title):
    mid = mido.MidiFile(mid_path)
    tracks = note_tracks(mid)
    if len(tracks) < 2:
        return None
    lh = tracks[LH_TRACK.get(title, len(tracks) - 1)]
    by = {}
    for t, n in lh:
        k = round(t / mid.ticks_per_beat * 16)  # same 64th-note grid as the right hand
        by[k] = min(by.get(k, 999), n)
    ks = sorted(by)
    return [by[k] for k in ks], [round(k / 16, 4) for k in ks]


def main():
    songs = json.loads(OUT.read_text(encoding="utf-8"))
    folder = {title: f for title, _c, f, _m in PIECES}
    for s in songs:
        f = folder.get(s["title"])
        if not f:
            print(f"keep  {s['title']:<45} {'(own left hand)' if s.get('left') else '(no source)'}")
            continue
        mids = sorted((WORK / "src" / f.replace("/", "_")).glob("*.mid"), key=lambda p: p.stat().st_size, reverse=True)
        lh = left_hand(mids[0], s["title"]) if mids else None
        if not lh and s["title"] == "Canon in D":
            # this score has the tune only: add Pachelbel's ground bass, one note every 2 beats
            # (the melody's opening notes move at the same pace), repeated to the end
            ground = [50, 45, 47, 42, 43, 38, 43, 45]  # D3 A2 B2 F#2 G2 D2 G2 A2
            n = int(s["beats"][-1] // 2) + 1
            lh = ([ground[i % 8] for i in range(n)], [2 * i for i in range(n)])
        if not lh:
            s.pop("left", None)
            s.pop("leftBeats", None)
            print(f"none  {s['title']:<45} (one part only)")
            continue
        s["left"], s["leftBeats"] = lh
        print(f"ok    {s['title']:<45} right {len(s['notes']):>5}  left {len(lh[0]):>5}  [{min(lh[0])}-{max(lh[0])}]")
    OUT.write_text(json.dumps(songs, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
