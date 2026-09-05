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

## Someday

## Maybe
