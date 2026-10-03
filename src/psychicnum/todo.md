# psychicnum — todo

## Bugs

## Soon

- **`GTileWord` and `WordTile` do not communicate their difference** (Joel,
  2026-10-01). The type is the text written on a tile (`types.ts`);
  the component draws one tile (`components/WordTile.tsx`). Two names built
  from the same two words, in opposite orders, for two different things.
  Finesse better names, with Joel, before the next game makes its tile
  component.

- **The `reason` names the act that ended the game.** When some compete
  players have spent their budgets and the last one still in concedes,
  `_maybe_finish_compete` writes `'exhausted'`; it writes `'conceded'` only
  when every player conceded. Ruled: the last player out conceding is
  `'conceded'`, even when everyone else spent their budget
  (docs/win-lose.md → `resource-exhausted`). Other games that end when
  every player is out may do the same; check them when this is worked.

## Someday

## Maybe

- **Should compete charge for the hint and the spoiler, or ban them?** Today
  a compete player can take a clue to one of their unfound secrets, or the
  secret itself (`request_spoiler`; `_unfound_secret` scopes to the caller),
  free, and the spoiled word is still guessable — so asking and then guessing
  is a shortcut to the win. Both hand over progress. A charge could be a
  guess from the budget, or a spoiled secret not counting toward the win.

## Won't do

- **Anti-spam on guessing** (2026-06-14). The audience is friends (CLAUDE.md →
  Trust model), so nobody is spamming anybody; and the guess budget — 3, 5, 7
  or 9, checked in SQL — caps what a spammer could spend anyway.
- **A livelier `.infoState` readout** (2026-08-02). The info column's state line
  ("1/3 found · 4/7 guesses used", drawn by `StateLine`) is plain on purpose; it
  does not need spellingbee's rank-ladder treatment.
