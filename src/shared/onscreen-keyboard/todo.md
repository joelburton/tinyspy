# onscreen-keyboard — todo

## Bugs

## Soon

- **Stop HIDING the keyboard at terminal; dim it instead.** Reversed 2026-08-17
  after losing a real game to FAVOR. `gameOver` sets `visibility: hidden`, which
  reserves the space but takes the keyboard away — and **the keyboard is where
  the alphabet's state lives**: black letters untried, white ones tried, each
  tried one carrying its color. It is a summary of the game you just played, and
  hiding it removes that summary at exactly the moment you want to study it.

  Only what the PROP does changes, so both games that pass it move together.
  The treatment is the open part: it has to read as inactive without dulling the
  very letter colors it exists to show — the same tension the board's game-over
  mark had, and the reason that one ended up a frame rather than a dim. The
  general rule is `plans/tile-feedback.md` → *"An input surface that is also a
  READOUT stays visible when the game ends"*: ask whether an input surface is
  *only* an input. A rack you can no longer play says nothing once the game is
  over; a keyboard that has been recording your guesses for six turns is a
  record.

  Moved here 2026-09-22 from `docs/games/wordle.md` → Deferred, by the sorting
  key in `docs/deferred.md` → Where an item goes: the file you would edit is
  this folder's stylesheet, not a game's.

## Someday

## Maybe

## Won't do
