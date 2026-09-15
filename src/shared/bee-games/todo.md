# bee-games — todo

## Bugs

## Soon

- **The below-board reserve is a hand-tuned constant.**
  `foundWordsPlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 5rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

  This sheet is spellingbee's and wordwheel's both, so one number answers for
  two boards whose content differs.

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
