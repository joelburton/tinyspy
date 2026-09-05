# turn-log — todo

## Bugs

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
