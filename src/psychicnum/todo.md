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
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `psychicnum.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

## Someday

## Maybe
