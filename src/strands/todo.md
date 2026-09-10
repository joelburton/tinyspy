# strands — todo

## Bugs

- `HintBar.tsx` reads `styles.hint` and the module defines only
  `.hintReady`, so the Hint button's base class resolves to `undefined` and
  `cls()` drops it. Found by `cssClasses.test.ts`, whose `MEMBER_PENDING`
  holds it until then.
- The under-board clue pill in `PlayArea.tsx` passes `variant: 'outline'`, a
  property the feedback message type does not have; it is silently dropped
  and the rendering is unaffected (the pill derives outline from the mode).
  Delete the property. It believed a docstring on the pill component that is
  itself wrong (`src/common/feedback/todo.md`).

## Soon
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `strands.end_game` writes the neutral terminal
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
