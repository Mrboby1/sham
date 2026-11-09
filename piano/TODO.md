# Piano Notes: to-do list

Sham's requests in the order they were asked. New requests are added at the bottom of "To do".
Live app: https://mrboby1.github.io/sham/piano/

## To do

1. **Song recognition** (paused on 2026-11-08, "save for later"): recognise the piece being played,
   show its name and continue it. The code is kept in `melody.js`.
2. **Find the classical piece Sham played** and add it to the library. This needs its notes
   ("Copy the notes I played" button) or its name.
3. **Add the 5 pieces that failed to convert**: Chopin Nocturne Op. 9 No. 2, Chopin Minute Waltz,
   Vivaldi Spring, Schumann Traumerei, Joplin Maple Leaf Rag.
4. **Repeats**: play repeated sections twice, as written in the score (now they are played once).
5. **Left hand in play-along**: the left-hand part in red, with its own fingering, so both hands
   can be practised.
6. **Check the fingering on real playing**: Sham reports anything that feels awkward and I fix it.
7. **Falling notes** ("piano keys" view): bars drop onto the keys showing which key comes next and
   how long to hold it, coloured and numbered by finger. *(done 2026-11-08, first version)*
8. **Projector "AR" mode**: project the app onto the real piano so the keys to play light up on the
   physical keyboard. This needs a projector and a full-screen mode that can be lined up with the real keys.
9. **Smooth falling notes at tempo**: notes flow down continuously at the piece's speed, with a
   speed % control and play/pause, and wait when the next note reaches the keys. *(done 2026-11-08)*
10. **Remove the black bar over the keys**: the hand's palm bar hid the tops of the keys. Take it out,
    keep everything else. *(done 2026-11-09)*
11. **Clear "play this key now"**: the key to play now is filled with its finger's colour, with no
    black frame, so it is obvious which exact key it is. *(done 2026-11-09)*
12. **Play-along must move on when the right key is played**: with the pedal or legato, ringing
    notes hid the new one, and a key struck twice in a row wasn't heard the second time. Now each of
    the next keys is followed on its own and a fresh strike of the right key moves on, while wrong
    notes are still ignored. *(done 2026-11-09)*
13. **News "closest to reality" website** (separate project, not the piano app): read news on the same
    story from many sources with different points of view, extract what they agree on (the most likely
    version of reality), and from that write a thesis of what may come next.

## Done

- 88-key keyboard, listening through the mic, note names (C D E / Do Re Mi), grand staff
- Widescreen layout with all 88 keys always on screen
- Classical library: 17 complete pieces + 12 traditional tunes + "Record my own"
- Lock onto a piece, clear with the lowest key (A0)
- "Tune to my piano" (room noise + this piano's tuning)
- Songs tab and play-following: only the right note moves on, wrong notes are ignored
- Left-hand notes shown in red
- 4 next keys numbered (finger or play order)
- Finger numbers for every note, worked out per piece
- Floating hand over the keyboard, a colour per finger, black frame on the key to play now
