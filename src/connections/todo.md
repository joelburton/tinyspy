# connections — todo

## Bugs

## Soon

## Someday

## Maybe

- **`useGame.ts`'s `as GameRow | undefined` is a cast standing in for a
  compiler flag.** The twin of stackdown's, where the reasoning is filed
  (`src/stackdown/todo.md`): `data[0]` types as present because
  `noUncheckedIndexedAccess` is off, so the `| undefined` is written by hand
  to give the following `if (!row)` something to narrow. Correct today.
- **"Next puzzle" should give the next date we HAVE a puzzle for, not just the
  next date** (Joel, 2026-08-25), quoted as said because it is not certain
  which behavior he means. `connections.next_puzzle_for_club` already skips
  gaps — it selects from `connections.puzzles`, so a date with no row cannot
  come back. The case he is probably describing is the OVERRIDE: type a date
  the archive lacks and the field says there is no puzzle for it and stops,
  where it could offer the next date that has one. Confirm which before
  building. Raised in the `forms` area while converting
  `<SetupNextPuzzleSection>`, and deliberately not done there.
- **Per-tile rise-and-fade animations on a category match.** A rejected guess
  shakes (the shared verdict mark); the match-resolved animation does not
  exist — the arriving band's attention flash is the nearest thing, and it is
  deliberately for the OTHER players. Pass 3 (tile-feedback) is where this is
  weighed.

## Won't do
