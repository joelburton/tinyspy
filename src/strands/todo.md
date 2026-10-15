# strands — todo

## Bugs

## Soon

- **The player-facing text, in the new words.** Code, comments and docs speak
  puzzle word / theme word / spangram / hint word (docs/games/strands.md →
  Naming the words, 2026-10-05); what a player reads was left for Joel's
  wording:
  - the hint tooltip "Reveal the tiles of one theme word" — it may ring the
    spangram, so it says less than the truth;
  - SetupForm: "Theme words always count, however short" (the spangram does
    too) and "How many valid non-theme words buy one hint";
  - Help: "belongs to exactly one hidden word" and "rings the letters of one
    hidden word"; and "The clue at the top of the info column is the theme" —
    the code calls it the puzzle's title (2026-10-05);
  - the manifest's `shortDescription`: "Find the hidden words that fill the
    board";
  - "valid word" for a hint word: the pill (`WORD — valid word`), the history
    banner, and the tooltip "Find N more valid words".

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 8.25rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

## Someday

## Maybe

- **Coop hints owned per player?** Today the coop hint bar is one pool
  copied onto every player's row in lock-step. Storing what each player
  earned (Moth 2, Joel 1, the bar their sum) would allow "in coop you spend
  only your own points" and, following from it, "only the spender sees the
  hint" — it would be mean for Moth to spend her points and Joel to
  unscramble the word first. Needs a decision on the feature before the data
  changes.

## Won't do

- **A `MobileStatusBar`.** Not for strands (2026-10-05, Joel took the BoardCol
  pass's recommendation: "commit and do it"): the pill slot already says the
  prompt and the verdict on a phone.
- **The pill reading `res.outcome`.** Overtaken 2026-10-05 by the conversion:
  the move envelopes carry no outcome, and `lib/answer.ts`'s `answerMessage`
  is what the pill and the log bar both read (plans/seat-view.md → How a game
  converts, step 9).
