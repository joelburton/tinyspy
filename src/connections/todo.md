# connections — todo

## Bugs

## Soon

## Someday

## Maybe

- **Per-tile rise-and-fade animations on a category match.** A rejected guess
  shakes (the shared verdict mark); the match-resolved animation does not
  exist — the arriving band's attention flash is the nearest thing, and it is
  deliberately for the OTHER players. Pass 3 (tile-feedback) is where this is
  weighed.

## Won't do

- **"Next puzzle" giving the next date we HAVE a puzzle for** (Joel,
  2026-08-25; ruled 2026-09-19): *"if the user chooses a specific date, we
  either load that exact date puzzle or show a validation error — which sounds
  like the behavior we already have."* It is, on both halves.
  `next_puzzle_for_club` selects from `connections.puzzles`, so a dateless gap
  can never come back; `puzzle_for_date` either returns that date's puzzle or
  refuses into the field it was typed in (PN303, "No puzzle for 2026-03-04.
  Try another date."). A date the player chose is never quietly swapped for a
  different one.
