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
    Focus (Sham, 2026-11-09): political events that move money. The news is only the means; the goal
    is to predict what comes next as accurately as possible.
    *(first version live 2026-11-09: https://mrboby1.github.io/sham/news/. Code in sham/news; lead.sham
    updates it every morning, see news/DAILY.md)*
14. **Michael Burry's Palantir short**: how relevant is it today, is it too late to join, is it a
    wrong bet? *(answered in Telegram 2026-11-09)*
15. **Signal: direct market calls** per asset, e.g. "European defence stocks ▼", with how likely and by when. *(done 2026-11-09)*
16. **Signal: trade ideas**: who suffers most directly from each event, and put ideas with an entry
    price, a price target and a stop. Each is scored afterwards on real prices. *(done 2026-11-09)*
17. **Opening a trading account** with the least paperwork. *(answered in Telegram 2026-11-09:
    an Israeli broker app for simple stock trading; Interactive Brokers for puts)*
18. **Add Bach's Toccata and Fugue in D minor** (BWV 565) to the songs. *(done 2026-11-09)*
19. **Add the chords of "Moody Wind" by Anthony Lazaro**: a chord-by-chord song (Songs → Anthony Lazaro):
    the whole chord lights up, right hand + left-hand root, and it moves on when the chord is heard. *(done 2026-11-09)*
20. **"Moody Wind" as notes (the melody), not chords** (Sham, 2026-11-09). No sheet music or MIDI of the
    melody exists online (only chord charts). Needs an audio of the melody from Sham (a voice note of it
    played or sung, or the song file) to transcribe, or Sham records it with "Record my own".
21. **6 facts about the Egyptian revolution** (2011). *(answered in Telegram 2026-11-09)*
22. **Add "הילדה הכי יפה בגן" ("The prettiest girl in the kindergarten", Yehudit Ravitz)** (Sham, 2026-11-10).
    A protected song: it can't go in the public library on the site, only into Sham's own songs.
    Plan: Sham plays it in "Record my own", or sends a voice note that I turn into notes and add to Sham's
    songs with a private link (needs a small "add this song" link feature; the same route serves #20).
    *(Private songs built 2026-11-10: private.json is encrypted and only opens on a phone that used the
    key link once. Waiting for the notes: the sheet music is sold on pianostudio.co.il, ₪22.70.)*
23. **Block the site for everyone but Sham** (Sham, 2026-11-10). *(dropped by Sham the same minute;
    the private songs above do the job for protected songs)*
24. **"Recognise the sound": an ear-training tab** (Sham, 2026-11-10). A deck of cards, turned over one by
    one; each card is one of three games: (1) play the note shown on the staff, (2) the app plays a note
    and you play it back, (3) the app plays a short melody and you repeat it. A separate tab on the site.
   *(done 2026-11-10, first version: the "Ear" tab, ear.html. 12 cards per deck, Easy/Medium/Hard, the
   three games can be switched on and off, answers by mic or by tapping the keys)*
25. **Ear tab: "how do I know which octave the note is?"** (Sham, 2026-11-10). Read cards on Easy and
    Medium accept the note in any octave and then name the exact key; Hard still asks for the exact key.
    Middle Do (Do4) is marked on the keys, and each card says where its clef sits relative to middle Do.
    *(done 2026-11-10)*
26. **"Play back" cards: say if what I played is too high or too low** (Sham, 2026-11-10). Since any
    octave counts, it's measured from the nearest octave of the right note, e.g. "Too high: go down 2 half-steps".
    *(done 2026-11-10)*
27. **Louder sound on the website** (Sham, 2026-11-10). *(done 2026-11-10: notes about 3x louder on the
    Piano tab and 2.5x on the Ear tab, with a soft limiter so chords don't crackle)*
28. **Ear tab, round 2** (Sham, 2026-11-10): (a) the deck never ends, no 12-card limit; (b) a usable
    sideways/wide layout; (c) high/low shown only as a ▲ or ▼ arrow (which way to go); (d) the Piano/Ear
    tabs always on screen. *(done 2026-11-10: the Ear page fits one screen with no scrolling. Sideways, all
    settings sit in one top row and the card gets the full width. On the Piano page the header with the
    tabs sticks to the top while scrolling.)*
29. **Can't reach the Ear tab from the Piano page held upright** (Sham, 2026-11-10): the "Tuned to your
    piano" badge squeezed the tabs until "Ear" was cut off. *(done 2026-11-10: the tabs keep their full
    size and the badge moves to its own line)*
30. **"Improve the site as you see fit"** (Sham, 2026-11-10, while away): beginner exercises, beginner
    songs, separate difficulty levels for songs and exercises; "remember I have both hands".
    Restore point before the changes: git tag `restore-2026-11-10` in the publish repo.
    *(done 2026-11-10: the Songs list has Songs / Exercises and All / Beginner / Middle / Advanced, with a
    coloured dot per level. 20 exercises (five-finger positions, hands separately and together, first
    chords, scales, arpeggio, Hanon, chromatic) and 14 easy songs with rhythm, 3 of them for both hands; 9 exercises are for both hands.
    Play-along now follows both hands: notes played together are one step, and the hand picture turns
    into a left hand for the left hand's notes. Source: tools/make_lessons.js -> lessons.json)*
31. **Michael Burry buying Alibaba (and JD.com?), Chinese tech; and shorting NVDA** (Sham, 2026-11-10):
    check the facts, what to do right now, and the risk. *(answered in Telegram 2026-11-10: Burry sold all his
    Alibaba in Q2 and moved it into JD; don't short NVDA stock right after a 10% scandal drop with earnings
    next week; at most a small put spread, and JD only after its Nov 12 earnings or in halves)*
32. **GameStop calls?** (Sham, 2026-11-10): Ryan Cohen owns about 9% and runs it alone; about $9B cash including
    4,710 bitcoin; if US stocks crash, GameStop's cash lets it profit. Do calls make sense, and how long could it take?
    *(answered in Telegram 2026-11-10: about half of the "cash" is now $4.9B of eBay shares plus bitcoin, which fall
    in a crash; calls lose in a crash and expire before a 2-5 year payoff; shares or small Jan 2028 calls instead)*
33. **Big market moves expected tomorrow (Nov 11)?** (Sham, 2026-11-10): any reason for a big jump somewhere.
    *(answered in Telegram 2026-11-10: nothing scheduled (Veterans Day, bonds closed, small earnings); the jump
    risks are headlines: a US-Iran ceasefire or news on the Nvidia/Huang investigation; JD Thursday, NVDA next week)*
34. **NVDA calls two weeks out?** (Sham, 2026-11-10).
    *(answered in Telegram 2026-11-10: earnings Nov 17 after the close fall inside the 2 weeks; calls are expensive
    (panic + earnings) and lose that extra price after earnings; if at all, a Nov 27 call spread 170/190, about 1% of the account)*

## Done

- 88-key keyboard, listening through the mic, note names (C D E / Do Re Mi), grand staff
- Widescreen layout with all 88 keys always on screen
- Classical library: 18 complete pieces + 12 traditional tunes + "Record my own"
- Lock onto a piece, clear with the lowest key (A0)
- "Tune to my piano" (room noise + this piano's tuning)
- Songs tab and play-following: only the right note moves on, wrong notes are ignored
- Left-hand notes shown in red
- 4 next keys numbered (finger or play order)
- Finger numbers for every note, worked out per piece
- Floating hand over the keyboard, a colour per finger, black frame on the key to play now
