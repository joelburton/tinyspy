# psychicnum — todo

## Bugs

## Soon

- **This is the control game for the app audit**: the deliberately minimal
  toy, opened first so that what it settles is about the SHAPE of a game
  area rather than about the game. Being first, it also answers what was
  punted to "the first game area": the two `CelebrationBlockingModal` items
  in `src/common/terminal/todo.md` (its title at h1's size, its re-declared
  focus ring).
- **`shuffled` in `components/BoardCol.tsx` is a hand-written Fisher–Yates**,
  the same function `spellingbee` and `wordwheel` also carry. It becomes
  `shuffle(items)` from `src/common/utils/shuffle.ts` — the default rng is
  `Math.random` and a copy comes back, so behavior is unchanged.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

## Maybe
