# turn-log — todo

## Bugs

- **Every `near` in the repo wants checking; most of them mean `warning`.**
  Ruled 2026-09-15: `near` means *this was almost right* — connections' one-away
  guess is the case it exists for. A hint, a spoiler, a word the dictionary does
  not know: none of those is a near-miss, and the word for them is `warning`
  ("not a verdict on your play", which [docs/outcomes.md](../../../docs/outcomes.md)
  defines to cover exactly this and which is the amber the Hint button already
  wears). Every one of them was unsayable in a log until `TurnOutcome` was
  deleted, so games took the nearest word that compiled.

  Where they are, as of the ruling:

  - **stackdown** — `hint` / `reveal` rows;
  - **letterboxed** — `hint` / `spoiler` rows;
  - **setgame** — any non-claim event (its comment cites stackdown as
    precedent, so the three move together);
  - **psychicnum** — a reveal row;
  - **strands** — `hint_word`, and it is the odd one out: it puts a SPENT hint
    on `neutral` and argues in its docstring that a hint is banked progress
    being spent rather than progress made. Settle that with the others, because
    the two readings cannot both be right.
  - **connections** keeps its `near` everywhere — one-away is what the word is
    for, and its pill, its log, its PDF and its board all say it.

  wordiply's dictionary miss moved to `warning` when its row flash landed
  (2026-09-15), which is the worked example.

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
