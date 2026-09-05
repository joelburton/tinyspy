# boggle — todo

## Bugs

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

## Someday

## Maybe
