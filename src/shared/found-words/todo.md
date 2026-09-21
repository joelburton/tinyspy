# found-words — todo

## Bugs

## Soon

- **The below-board reserve is a hand-tuned constant.**
  `foundWordsPlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 5rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, the
  gap above it. Nothing checks that it matches what is actually there.

  This sheet is boggle's, spellingbee's and wordwheel's, so one number now
  answers for THREE boards whose content differs. It was two numbers for three
  boards until 2026-09-21, when the family's scaffolding was split out of
  `bee-games` and boggle's identical copy was deleted; the duplication is gone
  and the guess is not.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column. `e2e/board-geometry.e2e.ts` now pins the
  below-board row and the mobile status block for all three games, so a change
  to this number is at least VISIBLE; it still cannot say the number is right.

## Someday

- **`.loading` and `.empty` go when the three games take the loader shape.**
  `foundWordsPlayArea.module.css` styles two early-return divs that
  [docs/playarea.md → The shape of a game's PlayArea.tsx](../../../docs/playarea.md#the-shape-of-a-games-playareatsx)
  replaces with `<Loading>` and `<NoSuchGamePage>`. Each game deletes its own
  two divs as its area opens; the rule they share is this folder's, and nobody
  else can delete it. Do it when the last of boggle, spellingbee and wordwheel
  has converted — `grep -rn "surface.loading\|surface.empty" src/` comes back
  empty at that point, and the file loses four lines.

## Maybe

## Won't do
