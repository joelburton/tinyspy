# letterboxed — todo

## Bugs

- Two `font-weight: 650` (`Board.module.css`, `PlayArea.module.css`). A
  weight must be a multiple of 100 (docs/ui.md → The non-color
  vocabularies); both are bugs to fix, not values to keep.

## Soon

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

## Someday

## Maybe
