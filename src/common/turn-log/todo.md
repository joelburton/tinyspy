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

- **A compete game at terminal should be able to show another player's board.**
  Today the `#N` handle dies whenever the log on show is not the sequence the
  board replays, and `boardIsShown` is one flag over two unrelated conditions:

  - **coop with a single player picked** — the board is SHARED, so every row in
    the filtered list is a real event in the history the board replays. The
    handle could work; it dies only because the snapshot builders index by
    position in the shown list rather than by the row's own id. Every one of the
    seven games already HAS a stable id on the row (`connections.id`,
    `letterboxed.id`, `psychicnum.id`, `strands.id`, and `seq` in stackdown,
    waffle, wordle) — positional keying is a choice those builders made, not a
    shortage. Resolving the id against the unfiltered log at the seam is the
    whole fix.
  - **compete with an opponent picked** — the board on screen is YOURS, so their
    turn has nothing to replay on. Mid-game their rows are RLS-hidden anyway
    ("Hidden until game ends."). **At terminal the rows are all there**, with
    their feedback colors, and each game's snapshot builder is pure — so what is
    missing is the decision that a compete log's `#N` may replay SOMEONE ELSE's
    board, and the UI to say whose board you are looking at while it does.
    Joel, 2026-09-16, wants this: reading moth's finished wordle as six rows of
    text where the game can draw it as a board is the gap.

  **setgame is the existence proof that this is reachable**, and its own comment
  says why: it offers the viewer on every row whatever the filter, because its
  snapshot is the `board_after` stored on the event rather than a fold over one
  player's sequence — "any row can be opened without knowing whose board it
  belonged to". **wordiply is the other odd one**: a turn log with no viewer at
  all, so its rows have no `#N`. Joel: *"setgame and wordiply shouldn't need to
  be different around this stuff"* — one feature, the same everywhere, rather
  than three behaviors a player has to learn per game.

  Fixing the first half also reframes **F-20** (`boardIsShown`'s name is vague
  partly because it covers two unrelated conditions), and the second half may
  retire the flag entirely.



## Someday

## Maybe
