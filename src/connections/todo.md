# connections — todo

## Bugs

- **`boardEvents` is worked out in `BoardCol`, from `gd` alone.** The rows
  of the board I play — every row in coop, my own in compete — filtered from
  `gd.events` in the component, for the foreign-guess mark and the attention
  count. A value that reads only `gd` belongs in `gd`, decided once in
  `makeGameData`. The candidate home is the player's board, as
  `p.board.events`: the rows that built that seat's board, beside the two
  things they produce. Left as is on purpose (2026-10-02), to decide once the
  same split shows up in more games than this one.

## Soon

## Someday

## Maybe

- **Should compete charge for the hint, or ban it?** Today a compete player
  can take one word of any category they pick, free, and it hands over
  progress toward the win. The hint lives only in the player's browser, so
  charging for it would first need it recorded with the game.

## Won't do

- **A mobile status bar over the board** (ruled 2026-10-03 at the InfoCol
  pass, Joel: *"it does not [need] a mobile status bar"*). The state line
  lives in `InfoCol`, off-canvas on a phone, where psychicnum and most other
  games mount `MobileStatusBar` with theirs in `BoardCol`; connections shows
  "Mistakes ■■□□" under the board in both modes, and that is the readout a
  phone needs.
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
