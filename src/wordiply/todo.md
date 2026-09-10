# wordiply — todo

## Bugs

## Soon

- **Adopt the shared leaderboard read — the common side is already
  widened.** The manifest's status line and `PlayArea.tsx` each write
  `(s.leaderboard as LeaderRow[] | undefined) ?? []` by hand; each becomes
  `readLeaderboard<LeaderRow>(…)`, which also catches the field being present
  and not an array. **The real question is the row, not the read**:
  `LeaderRow` is declared twice, in `manifest.ts` and `PlayArea.tsx`, and the
  PlayArea copy carries `letter_count?`, which the manifest copy has never
  heard of. One of them is wrong about what the server writes, and adopting
  the helper is the moment that becomes visible.
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `wordiply.end_game` writes the neutral terminal
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
