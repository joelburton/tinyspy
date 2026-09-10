# connections — todo

## Bugs

## Soon

- **`shuffleTiles` in `lib/localOrder.ts` is a hand-written Fisher–Yates** —
  `shuffle(tiles)` from `src/common/utils/shuffle.ts` is the same function,
  so the export goes and `components/BoardCol.tsx` calls the util directly.
  Its three cases in `lib/localOrder.test.ts` (a permutation, the input
  untouched, an empty array) are pinned beside the util now and go with it;
  `reconcileLocalOrder` is untouched either way.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `connections.end_game` writes the neutral terminal
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
