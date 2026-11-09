r"""Build piano/songs.json: whole pieces from the Mutopia Project (free public-domain / Creative
Commons sheet music), compiled to MIDI with LilyPond, with the melody (right-hand top line)
extracted note by note.

  Run from the piano folder:  ..\.venv\Scripts\python.exe tools\fetch_songs.py
Needs: LilyPond 2.24 (winget install LilyPond.LilyPond), the `mido` package, and network access to
GitHub (raw.githubusercontent.com) where Mutopia keeps its sources.
"""
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import mido

HERE = Path(__file__).resolve().parent.parent           # .../piano
WORK = HERE / "midi_src"
OUT = HERE / "songs.json"
RAW = "https://raw.githubusercontent.com/MutopiaProject/MutopiaProject/master/"
LILY = Path.home() / "AppData/Local/Microsoft/WinGet/Packages/LilyPond.LilyPond_Microsoft.Winget.Source_8wekyb3d8bbwe/lilypond-2.24.4/bin"

# (title, composer, Mutopia folder, main .ly file name inside it)
PIECES = [
    ("Fur Elise", "Beethoven", "ftp/BeethovenLv/WoO59/fur_Elise_WoO59", "fur_Elise_WoO59.ly"),
    ("Moonlight Sonata, 1st movement", "Beethoven", "ftp/BeethovenLv/O27/moonlight/moonlight-lys", "moonlight1-a4.ly"),
    ("Piano Sonata No. 16 (K. 545), 1st movement", "Mozart", "ftp/MozartWA/KV545/K545-1", "K545-1.ly"),
    ("Rondo alla Turca", "Mozart", "ftp/MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca-lys", "KV331_3_RondoAllaTurca.ly"),
    ("Eine kleine Nachtmusik, 1st movement", "Mozart", "ftp/MozartWA/KV525/eine-kleine-nachtmusik-mvt1/eine-kleine-nachtmusik-mvt1-lys", "eine-kleine-nachtmusik-mvt1.ly"),
    ("Prelude in C (Well-Tempered Clavier)", "Bach", "ftp/BachJS/BWV846/wtk1-prelude1", "wtk1-prelude1.ly"),
    ("Minuet in G", "Bach", "ftp/BachJS/BWVAnh114/anna-magdalena-04", "anna-magdalena-04.ly"),
    ("Invention No. 1", "Bach", "ftp/BachJS/BWV772/bach-invention-01", "bach-invention-01.ly"),
    ("Air on the G String", "Bach", "ftp/BachJS/BWV1068/bach-air/bach-air-lys", "bach-air-score.ly"),
    ("Toccata and Fugue in D minor", "Bach", "ftp/BachJS/BWV565/ToccataFugue", "ToccataFugue.ly"),
    ("Clair de Lune", "Debussy", "ftp/DebussyC/L75/debussy_Ste_Bergamesq_Clair", "debussy_Ste_Bergamesq_Clair.ly"),
    ("Arabesque No. 1", "Debussy", "ftp/DebussyC/L66/debussy_Arabesque_1", "debussy_Arabesque_1.ly"),
    ("Gymnopedie No. 1", "Satie", "ftp/SatieE/gymnopedie_1", "gymnopedie_1.ly"),
    ("Nocturne Op. 9 No. 2", "Chopin", "ftp/ChopinFF/O9/chopin_nocturne_op9_n2", "chopin_nocturne_op9_n2.ly"),
    ("Prelude Op. 28 No. 4", "Chopin", "ftp/ChopinFF/O28/Chop-28-4", "Chop-28-4.ly"),
    ("Minute Waltz (Op. 64 No. 1)", "Chopin", "ftp/ChopinFF/O64/chopin_valse_op64_no1/chopin_valse_op64_no1-lys", "chopin_valse_op64_no1.ly"),
    ("Spring (Four Seasons)", "Vivaldi", "ftp/VivaldiA/O8/spring/spring-lys", "spring-score.ly"),
    ("In the Hall of the Mountain King", "Grieg", "ftp/GriegE/O46/Dans_l_antre_du_roi_de_la_montagne", "Dans_l_antre_du_roi_de_la_montagne.ly"),
    ("Canon in D", "Pachelbel", "ftp/PachelbelJ/CanonInD", "CanonInD.ly"),
    ("Traumerei", "Schumann", "ftp/SchumannR/O15/SchumannOp15No07", "SchumannOp15No07.ly"),
    ("Lullaby", "Brahms", "ftp/BrahmsJ/LullabyBrahms-C", "LullabyBrahms-C.ly"),
    ("The Entertainer", "Joplin", "ftp/JoplinS/entertainer", "entertainer.ly"),
    ("Maple Leaf Rag", "Joplin", "ftp/JoplinS/maple", "maple.ly"),
]


def log(*a):
    print(*a, flush=True)


def tree():
    path = WORK / "tree.json"
    return [x["path"] for x in json.loads(path.read_text())["tree"] if x["type"] == "blob"]


def download(folder, files):
    dest = WORK / "src" / folder.replace("/", "_")
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for f in files:
        rel = f[len(folder) + 1:]
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(RAW + urllib.request.quote(f), timeout=60) as r:
            target.write_bytes(r.read())
    return dest


def compile_midi(dest, main):
    for ly in dest.rglob("*.ly"):  # update old syntax to LilyPond 2.24
        subprocess.run([str(LILY / "python.exe"), str(LILY / "convert-ly.py"), "-e", "-q", ly.name],
                       cwd=ly.parent, capture_output=True)
    # make sure a MIDI file is produced: add an empty \midi block to every \score that lacks one
    src = (dest / main).read_text(encoding="utf-8", errors="replace")
    if "\\midi" not in src:
        src = re.sub(r"\\layout\s*\{", r"\\midi { } \\layout {", src)
        (dest / main).write_text(src, encoding="utf-8")
    r = subprocess.run([str(LILY / "lilypond.exe"), "-dno-print-pages", "-dmidi-extension=mid", "-s", main],
                       cwd=dest, capture_output=True, text=True, errors="replace")
    mids = sorted(dest.glob("*.mid"), key=lambda p: p.stat().st_size, reverse=True)
    if not mids:
        raise RuntimeError("no MIDI produced: " + (r.stderr or r.stdout)[-400:])
    return mids[0]


def melody(mid_path):
    """Top line of the highest-sounding track: at each onset keep the highest note."""
    mf = mido.MidiFile(mid_path)
    tpb = mf.ticks_per_beat
    tracks = []
    for tr in mf.tracks:
        t, notes = 0, []
        for msg in tr:
            t += msg.time
            if msg.type == "note_on" and msg.velocity > 0 and msg.channel != 9:
                notes.append((t, msg.note))
        if len(notes) >= 16:
            tracks.append(notes)
    if not tracks:
        raise RuntimeError("no notes")
    # melody track = highest average pitch (piano right hand, violin I, solo violin)
    top = max(tracks, key=lambda ns: sum(n for _, n in ns) / len(ns))
    by_onset = {}
    for t, n in top:
        k = round(t / tpb * 16)  # 64th-note grid (fast runs, e.g. the Toccata, need it)
        by_onset[k] = max(by_onset.get(k, 0), n)
    keys = sorted(by_onset)
    return [by_onset[k] for k in keys], [round(k / 16, 4) for k in keys]


def license_of(dest):
    for ly in dest.rglob("*.ly"):
        m = re.search(r'(?:license|copyright)\s*=\s*"([^"]+)"', ly.read_text(encoding="utf-8", errors="replace"))
        if m:
            return m.group(1)
    return "see Mutopia"


def main():
    paths = tree()
    songs, failed = [], []
    only = set(sys.argv[1:])
    for title, composer, folder, main_ly in PIECES:
        if only and title not in only:
            continue
        files = [p for p in paths if p.startswith(folder + "/") and (p.endswith(".ly") or p.endswith(".ily"))]
        try:
            dest = download(folder, files)
            mid = compile_midi(dest, main_ly)
            notes, beats = melody(mid)
            songs.append({"title": title, "composer": composer, "notes": notes, "beats": beats,
                          "source": "https://www.mutopiaproject.org (" + folder[4:] + ")",
                          "license": license_of(dest)})
            log(f"ok    {composer:<10} {title:<45} {len(notes):>5} notes")
        except Exception as e:  # keep going; report at the end
            failed.append((title, str(e)[:200]))
            log(f"FAIL  {composer:<10} {title:<45} {e}"[:300])
    if only and OUT.exists():  # merge with what we already have
        old = [s for s in json.loads(OUT.read_text(encoding="utf-8")) if s["title"] not in {s["title"] for s in songs}]
        songs = old + songs
    order = {t: i for i, (t, *_rest) in enumerate(PIECES)}
    songs.sort(key=lambda s: order.get(s["title"], 999))
    OUT.write_text(json.dumps(songs, separators=(",", ":")), encoding="utf-8")
    log(f"\n{len(songs)} songs written to {OUT} ({OUT.stat().st_size // 1024} KB); {len(failed)} failed")


if __name__ == "__main__":
    main()
