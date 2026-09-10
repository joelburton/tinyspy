# setgame — todo

## Bugs

- `PlayArea.module.css` `.breakdown` and its three children
  (`breakdownLabel` / `-List` / `-Count`) are read by nothing — the
  per-player breakdown they styled was replaced. `cssClasses.test.ts` holds
  them in `DEAD_CLASS_PENDING`.

## Soon

- **Adopt the shared leaderboard read — the common side is already
  widened.** The manifest's status line and `PlayArea.tsx` each write
  `(s.leaderboard as LeaderRow[] | undefined) ?? []` by hand; each becomes
  `readLeaderboard<LeaderRow>(…)`, which also catches the field being present
  and not an array. `LeaderRow` is declared twice, in `manifest.ts` and
  `PlayArea.tsx`, and setgame is the closest of the four games to having one
  row: the copies carry the same four columns and differ only in whether
  `user_id` is optional. Collapse to one declaration while both sites are
  open, rather than keeping a copy per file that agrees today by luck.
- `Card.tsx` exports two components (`Card`, `CardDefs`), so "the filename
  is the component" is false here. Split or justify.
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `setgame.end_game` writes the neutral terminal
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
