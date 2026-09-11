# letterboxed — todo

## Bugs

- Two `font-weight: 650` (`Board.module.css`, `PlayArea.module.css`). A
  weight must be a multiple of 100 (docs/ui.md → The non-color
  vocabularies); both are bugs to fix, not values to keep.
- **`↓` half-works.** `<EntryRow>` mounts `useArrowHistory`, so
  `act-clear-entry` is live here, but `handleChange` rejects `''` once the
  chain carries a seed letter, so `↓` clears only an empty chain. Either the
  binding is not offered here or clearing returns the entry to the seed.
  (The permanently gray `↑` row beside it is the shared hook's —
  `src/common/word-entry/todo.md`.)
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **`shuffle` in `supabase/functions/letterboxed-build-board/board.ts` is a
  hand-written Fisher–Yates** — `src/common/utils/shuffle.ts` is the same
  function with the rng optional, so the local one goes, its three seeded
  call sites pass their `rnd` unchanged, and the edge function imports the
  util by relative path with an explicit `.ts`, the way `scrabble-ai-move`
  imports `mulberry32`. The exported `shuffle` also has its own case in
  `board_test.ts` (permutes without mutating), which is pinned beside the
  util now and goes with it.
- **Adopt the shared leaderboard read — the common side is already
  widened.** Two call sites write the same defensive cast by hand,
  `(s.leaderboard as LeaderRow[] | undefined) ?? []`: the manifest's
  club-page status line and `PlayArea.tsx`. Each becomes
  `readLeaderboard<LeaderRow>(…)`, which also catches the field being present
  and not an array. **The real question is the row, not the read**:
  `LeaderRow` is declared twice, in `manifest.ts` and `PlayArea.tsx`, and the
  two disagree — the manifest copy has `user_id?` optional and no `won`,
  while the PlayArea copy requires `user_id` and carries `won?` with a
  docstring about co-winners on a timeout. One of them is wrong about what
  the server writes, and adopting the helper is the moment that becomes
  visible.
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `letterboxed.end_game` writes the neutral terminal
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
