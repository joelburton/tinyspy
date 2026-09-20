# connections — todo

## Bugs

## Soon

## Someday

## Maybe

## Won't do

- **Per-tile rise-and-fade animations on a category match** (ruled 2026-09-19
  at the tile-feedback pass, Joel: *"close the todo"*). Four tiles collapsing
  into a band already carries the attention flash, which says where to look;
  an arrival animation would say what happened, and the band — a full-width
  row naming the category — says that itself.
- **"Next puzzle" giving the next date we HAVE a puzzle for** (Joel,
  2026-08-25; ruled 2026-09-19): *"if the user chooses a specific date, we
  either load that exact date puzzle or show a validation error — which sounds
  like the behavior we already have."* It is, on both halves.
  `next_puzzle_for_club` selects from `connections.puzzles`, so a dateless gap
  can never come back; `puzzle_for_date` either returns that date's puzzle or
  refuses into the field it was typed in (PN303, "No puzzle for 2026-03-04.
  Try another date."). A date the player chose is never quietly swapped for a
  different one.
