# turn-log — todo

## Bugs

- **Delete `TurnOutcome`; a turn-log row takes an `Outcome`.** There is no
  difference between the two (Joel) — any outcome can be a turn's outcome — so
  the hand-cut four in `TurnLog.tsx` (`'won' | 'lost' | 'near' | 'neutral'`) is
  a second name for a list that already exists, and a narrower one. It is also
  load-bearing in the wrong direction: see the next item.

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

- `<TurnLog>`'s `headerAction` is optional in name only — every call site
  passes it, so the bare-`<h3>` arm is dead. Make it required.
- **Two files here export more than one component**, so "the filename is the
  component" is false in them: `TurnLog.tsx` (`TurnLog`, `TurnLogBar`,
  `TurnLogNumber`) and `ActorMention.tsx` (`ActorTag`, `ActorDot`).
  `TurnLog`'s three look like a real family rather than an accident, which is
  why this wants a look rather than a mechanical split. (The same question is
  open in `game-page` for `PlayAreaMountLog.tsx` and in setgame for
  `Card.tsx`.)

## Someday

## Maybe
