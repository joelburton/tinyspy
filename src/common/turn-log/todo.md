# turn-log — todo

## Bugs

- **`near` means *this was almost right*** — connections' one-away guess is the
  case it exists for, and this folder's outcome bar is what paints the word. A
  hint, a spoiler, a word the dictionary does not know: none is a near-miss.
  Ruled 2026-09-15; the vocabulary itself lives in
  [docs/outcomes.md](../../../docs/outcomes.md).

  **Where games get this wrong is the `outcome-fix` area's**
  ([plan §3](../../../plans/app-audit.md) row 40), not a list to work from here.
  Joel, 2026-09-16: *"i don't want this to be anything like a search-and-place of
  'near' to 'warning'"* — the fix is that a move's outcome is determined once and
  every consumer reads it, and the wrong `near`s are deliberately left in place as
  the proof that the area worked. The row also carries the correction this entry
  used to get wrong: **strands is not one of them** — its `near` is `hint_word`, a
  valid non-theme word that EARNS hint progress, and its spent hint is a different
  row kind sitting correctly on `neutral`.

## Soon

- **A compete game at terminal should be able to show another player's board, and
  the viewer should work the same in every game.** Promoted to an area of its own
  on 2026-09-16 — `history-always-available`, [plan §3](../../../plans/app-audit.md)
  row 39 — because one decision governs seven games' snapshot builders, the
  picker's flag, setgame's and wordiply's odd-one-out behavior, and a UI question
  nobody has answered (whose board am I looking at?). The row holds the whole
  reading; nothing to repeat here.

## Someday

## Maybe
