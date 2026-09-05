# grid-and-drag — todo

## Bugs

## Soon

- **The two drag ghosts disagree** — bananagrams at `z-index: 1000`, scrabble
  at 100, and `dragGhost.module.css` says the split is unintended. Both are
  `position: fixed`, so they are two tiers apart against everything else:
  scrabble's paints BELOW an open dialog, bananagrams's above. Nobody drags
  mid-dialog, which is why it has never shown. Neither takes `--z-ghost` until
  they agree; both sit on the z-index guard's pending list until then.

## Someday

## Maybe
