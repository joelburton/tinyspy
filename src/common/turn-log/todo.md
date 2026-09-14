# turn-log — todo

## Bugs

- **Delete `TurnOutcome`; a turn-log row takes an `Outcome`.** There is no
  difference between the two (Joel) — any outcome can be a turn's outcome — so
  the hand-cut four in `TurnLog.tsx` (`'won' | 'lost' | 'near' | 'neutral'`) is
  a second name for a list that already exists, and a narrower one. It is also
  load-bearing in the wrong direction: see the next item. `TurnLog.module.css`
  has bar classes for the same four and needs the other three, so the type and
  the stylesheet move together.

- **A hint row is logged as `near`, and `near` is the wrong word for it.**
  `near` means the guess was close; asking for a hint is not a guess at all.
  The right word is `warning` — "not a verdict on your play", which
  [docs/outcomes.md](../../../docs/outcomes.md) defines to cover hints, and
  which is the amber the Hint button already wears. `warning` was unsayable
  while `TurnOutcome` existed, so three games took the nearest word that
  compiled: **stackdown** (`hint` / `reveal` rows), **letterboxed** (`hint` /
  `spoiler` rows) and **setgame** (any non-claim event). Each cites the last
  one as precedent, so they move together. strands is the odd one out and puts
  a spent hint on `neutral`, arguing in its docstring that a hint is banked
  progress being spent rather than progress made — settle that at the same
  time, because the two readings can't both be right.

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

- `<TurnLog>`'s `headerAction` is optional in name only — every call site
  passes it, so the bare-`<h3>` arm is dead. Make it required.
- **`TurnLog.tsx` exports more than one component**, so "the filename is the
  component" is false in it: `TurnLog`, `TurnLogBar`, `TurnLogNumber`. The
  three look like a real family rather than an accident, which is why this
  wants a look rather than a mechanical split. (The same question is open in
  setgame for `Card.tsx` and in `members` for `ActorMention.tsx`. `game-page`
  had it too, in `PlayAreaMountLog.tsx`, and answered it by finding one of the
  two components no longer earned its keep — worth trying before a split.)

## Someday

## Maybe
