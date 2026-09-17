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

- **`TurnLog.module.css` is read by eleven games' `GameTurnLog.tsx`**, which
  makes it the repo's clearest case of a component-named stylesheet that is not
  one component's. Joel, 2026-09-14: a `Foo.module.css` should be about the look
  of `Foo`, changeable without worrying about anyone else. Two ways out, both in
  [docs/deferred.md](../../../docs/deferred.md) → Common / architecture: rename
  it `turnLog.module.css` (the repo's existing lowercase-means-shared
  convention), or let each game's own module `composes:` from it so a game's
  `.tsx` imports only its own stylesheet. Decide here when the area opens; the
  convention itself is the cross-cutting half.

- **`TurnLog.tsx` exports more than one component**, so "the filename is the
  component" is false in it: `TurnLog`, `TurnLogBar`, `TurnLogNumber`. The
  three look like a real family rather than an accident, which is why this
  wants a look rather than a mechanical split. (The same question is open in
  setgame for `Card.tsx` and in `members` for `ActorMention.tsx`. `game-page`
  had it too, in `PlayAreaMountLog.tsx`, and answered it by finding one of the
  two components no longer earned its keep — worth trying before a split.)

## Someday

## Maybe
