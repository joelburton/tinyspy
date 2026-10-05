# wordiply — todo

## Bugs

## Soon

## Someday

## Maybe

- **Reveal best solution names one longest word of possibly several.**
  `wordiply.try_base` stores up to three words at the maximum length
  (`order by word limit 3`, alphabetical, no reason given for three), and the
  page reads only `gd.puzzle.longestWords[0]` — for the reveal and the
  printout. When words tie for longest, a player who found another of them is
  shown a "best solution" that is not theirs. Three ways out:
  - **Keep up to three, and reveal them all.** The game's `author-solution`
    (docs/win-lose.md) becomes those three. The cap is still arbitrary: a
    fourth tied word would go unshown.
  - **Keep one, and reveal it.** Matches what is shown today, but treats one
    of several equal words as the answer.
  - **No `author-solution` at all.** The reveal shows every word at
    `maxWordLen`, filtered from the `legalWords` the puzzle already carries,
    so no pick and no cap. `longest_words` would then have no reader.

- **A composite score for compete's ranking.** The winner is the
  lexicographic comparator (length score → letter count → the earlier last
  word), so the letter count only matters on an exact length-score tie: in
  practice only the marquee word counts, which flattens a five-guess game. The
  replacement: normalize the letter count to 0–100 against its ceiling (5 ×
  `max_word_len`) and rank on `w·length% + (1−w)·volume%`, one weight deciding
  how many extra letters outweigh one letter of marquee (at `w = 0.6` on a
  max-16 board, about a dozen). One number that IS the ranking is also easier
  to read than a comparator. The comparator lives in `_finish_compete` alone,
  so it is a one-place change with `winner_test` re-pinned. (The winner is
  already this app's invention — Guardian's Wordiply crowns nobody — so the
  metric is ours.)
- **A coop target.** Spending the five guesses ends coop as a win, whatever
  the score. A `target_score` (on the composite above, if it lands) would make
  reaching it the win and arm the timer, the spellingbee pattern; spending the
  guesses below it would then be a LOSS (`docs/win-lose.md` → Where a coop
  loss comes from) — the point of the feature, and a bigger change than arming
  the timer.

## Won't do

- **Coop's words never say "Won"** (Joel, 2026-10-04). The five words spent is
  a win — `won`, drawn in the win's color — but the pill reads `Ended: 71%, 8
  letters` and the club card `Ended (out of guesses) · …`: the team did as well
  as it did, and the score says how well. Only compete says "Won".
- **No confetti on a coop win** (Joel, 2026-10-04). A race won is celebrated;
  the coop table's five words spent is not.
- **No help line in the info column** (2026-10-04). The starter above the board
  already says what every word must contain.
- **No mobile status bar** (2026-10-04). The board and the keyboard fill a
  phone, as wordle's do, and a bar would take its height from the board.
- **No frontend copy of the compete ranking** (Joel, 2026-10-04: "a"). The
  parity reference `compareCompetitors` had no reader and had drifted from
  `_finish_compete`'s last tiebreak; the ranking is the server's, `winner_test`
  pins it, and the page reads it.
