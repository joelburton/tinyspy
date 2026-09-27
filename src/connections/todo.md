# connections — todo

## Bugs

- **The e2e "connections: Restart un-reveals a spent hint" fails every
  run** (`e2e/restart-resets.e2e.ts`). It counts hint buttons named
  `/Reveal/i`, and the link has read "Show hint" since the game-cards
  rulings, so it finds none.

## Soon

## Someday

## Maybe

- **Should compete charge for the hint, or ban it?** Today a compete player
  can take one word of any category they pick, free, and it hands over
  progress toward the win. The hint lives only in the player's browser, so
  charging for it would first need it recorded with the game.

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
