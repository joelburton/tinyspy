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
- ~~**"Next puzzle" should give the next date we HAVE a puzzle for, not just
  the next date** (Joel, 2026-08-25).~~ **Settled 2026-09-19, no change:**
  *"if the user chooses a specific date, we either load that exact date puzzle
  or show a validation error — which sounds like the behavior we already
  have."* It is: `next_puzzle_for_club` selects from `connections.puzzles`, so
  a dateless gap can never come back, and `puzzle_for_date` either returns
  that date's puzzle or refuses into the field (PN303, "No puzzle for
  2026-03-04. Try another date.").
- **Per-tile rise-and-fade animations on a category match.** A rejected guess
  shakes (the shared verdict mark); the match-resolved animation does not
  exist — the arriving band's attention flash is the nearest thing, and it is
  deliberately for the OTHER players. Pass 3 (tile-feedback) is where this is
  weighed.

## Won't do
