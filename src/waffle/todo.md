# waffle — todo

## Bugs

## Soon
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `waffle.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

## Someday

- `SolutionReveal` sets monospace twice, so the revealed grid's letters line
  up in a column. The alignment need is real; whether monospace is how to
  meet it is not obvious now that the app font's digits are tabular and its
  width dial can hold a column. Decide with the setup forms' mono question
  (`src/common/setup-form/todo.md`), not piecemeal.

## Maybe
