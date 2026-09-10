# spellingbee — todo

## Bugs

## Soon

- **Two hand-written Fisher–Yates shuffles, one per side** — `shuffled` in
  `components/BoardCol.tsx` and `shuffled` in
  `supabase/functions/spellingbee-build-board/index.ts`. Both become
  `src/common/utils/shuffle.ts`: the component calls `shuffle(items)` (the
  default rng is `Math.random` and a copy comes back, so behavior is
  unchanged), and the edge function imports the util by relative path with an
  explicit `.ts`, the way `scrabble-ai-move` imports `mulberry32`. The
  component's copy is `wordwheel`'s character for character.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `spellingbee.end_game` writes the neutral terminal
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
