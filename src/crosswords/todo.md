# crosswords — todo

## Bugs

- **Picture clues don't appear.** The NYT daily for 2026-09-06
  (<https://www.nytimes.com/crosswords/game/daily/2026/09/06>) has clues whose
  content is an image, and the board shows nothing for them — so those entries
  are unsolvable from the app. Investigate whether we can show them: what the
  source format carries for such a clue, whether the importer drops it or never
  had it, and whether the image can be stored with the puzzle rather than
  hot-linked.

## Soon

- **Link a from-site puzzle back to its source.** For puzzles imported from a
  publisher (NYT, Guardian, …) it would be nice to offer a link to the puzzle
  on that site. The importer already keeps `author` and `copyright` from the
  source format; whether a canonical URL is available per publisher, or has to
  be composed from the puzzle's date and slug, is the thing to find out.
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
