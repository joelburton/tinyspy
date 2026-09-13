# wordle — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **`Board` should take an `Outcome` and map it to its two colors itself.**
  Today the seven-value outcome is narrowed at the call site in `BoardCol`
  (`warning` → amber, everything else red), which is total but is narrowing
  done in the wrong place. The rest of the verdict-mark state — a nonce and a
  tone as two states written together — stays per game on purpose
  (docs/ui.md → "The verdict mark's state is per game").
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `wordle.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

## Someday

- `PlayArea.tsx` returns its own `<p>Loading game…</p>` while the read is
  pending, where `src/common/loading`'s `<Loading>` is the word every page
  shows for that moment. Swap it in, or say why this surface's is different.

## Maybe
