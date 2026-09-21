# board-marks — todo

## Bugs

## Soon

- **scrabble's three marks have no spec.** Its green, yellow and red all
  converted to `useMark` with the rest (2026-09-20), and each was planted: make
  the mark never draw and scrabble's whole suite stays green. The other nine
  games' marks each got one; these did not, because reaching them needs a
  staged-and-committed move and no scrabble spec has ever staged one. That
  harness is the work, not the assertions. For scrabble's own area.

## Someday

## Maybe

## Won't do
