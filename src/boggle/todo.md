# boggle — todo

## Bugs

- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **Adopt the two shared found-words modules — the common side is already
  widened.** Boggle is the third member of the found-words family that the
  original extraction stopped one game short of. Two call-site changes, both
  deletions: `lib/displayRows.ts` (and its test) goes, replaced by the shared
  `foundWordsDisplayRows` — the same algorithm line for line, differing only
  in that boggle omits `isPangram`, which the shared row type already makes
  optional; and the two inline `(status?.leaderboard as LeaderRow[] …) ?? []`
  casts in `PlayArea.tsx` become `readLeaderboard<LeaderRow>(status)`. **The
  note that said boggle "must NOT use" the shared rows was false** — its own
  tests dedup a word to the earliest finder exactly as the shared one does; a
  false justification is worse than none because it survives by being cited.
  **Deliberately NOT `makeFoundWordsGame`**: boggle reads `games` where the
  hive games read a `games_state` view, with different columns and a
  different header type, and sharing it would mean parameterizing the table,
  the select and the row mapping — a hook turned into a framework. Joel:
  *"i prefer clarity and not over-generalizing."* Revisit only if a fourth
  game turns up.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `boggle.end_game` writes the neutral terminal
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
