# crosswords — todo

## Bugs

## Soon

- **`CrosswordsNumberJumpBlockingModal` is a blocking modal not built as
  one** — a hand-rolled `position: fixed` box with its own scrim, riding the
  popover tier, so a menu can open over it. `<BlockingModal>` is what it
  wants: the shell brings the backdrop, the focus trap, immovability and
  content-fit height. Left for this game's own audit because the conversion
  MOVES ITS TIER, and a behavior change to a game's modal should be seen by
  the area that owns the game.
- The setup chooser is drifted on three values — `6px` where `--radius-md`
  is the vocabulary, and its own hover and rule colors. Unintended, per Joel.
- **The control bar picks a font size off the ramp.** `Controls.module.css`'s
  `.btn` writes `font-size: 0.9rem`, where the ramp's small step is `0.85rem` —
  a difference of 0.8px at the browser's default root, so it reads as a guess
  rather than a choice. The bar is a documented exemption from the shared
  button (its ON state is a game color), so the size is this game's to keep or
  collapse; the point is only that nothing yet says which.

## Someday

## Maybe
