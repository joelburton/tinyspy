# terminal — todo

## Bugs

- **A Stop drops a win that already stands.** docs/win-lose.md → `stopped`
  says a Stop keeps the win of a game already `decided` (`decided-stands`):
  in a wordle race I have beaten moth and she plays on, and a Stop then
  leaves me `won`. `common._stop` calls `common._end_game` with no
  rankings, so every player comes out `neutral` except a conceder, who is
  `lost`. Make the SQL keep the win; the front end reads whatever outcome
  the database writes and needs no change.

## Soon

## Someday

## Maybe

- **A dramatic loss moment, only where a game authors a dramatic event.**
  codenamesduet's assassin has a culprit and a moment; attrition losses (out of
  swaps, out of guesses) have neither and keep the red pill. The shape would be
  an inverted celebration: a dark backdrop, the culprit as the centerpiece, a
  low sting for the jingle. `useCelebration` is win-only. (This folder's
  doc.md rules out loss dialogs in general; this is the narrow exception to
  weigh.)

## Won't do
