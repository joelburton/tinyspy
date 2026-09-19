# psychicnum — todo

## Bugs

## Soon

- **The printer's "set the border weight on EVERY rect" comment is no longer
  true.** `pdf/printPsychicnumPdf.ts` → `drawBoard` sets the line width on
  every cell because "the marks bump the line width"; the shared marks
  restore it now (`common/pdf/marks.ts`). The comment goes, and the per-cell
  `setLineWidth` can move outside the loop with the saved-and-restored `lw0`
  around it, or stay as a cheap habit — say which.

## Someday

## Maybe

## Won't do

- **Anti-spam on guessing** (2026-06-14). The audience is friends (CLAUDE.md →
  Trust model), so nobody is spamming anybody; and the guess budget — 3, 5, 7
  or 9, checked in SQL — caps what a spammer could spend anyway.
- **A livelier `.infoState` readout** (2026-08-02). The info column's state line
  ("1/3 found · 4/7 guesses used", drawn by `StateLine`) is plain on purpose; it
  does not need spellingbee's rank-ladder treatment.
