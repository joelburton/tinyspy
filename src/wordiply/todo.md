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

## Someday

## Maybe
