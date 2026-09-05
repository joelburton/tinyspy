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

## Someday

## Maybe
