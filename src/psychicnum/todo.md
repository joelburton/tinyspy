# psychicnum — todo

## Bugs

## Soon

## Someday

## Maybe

- **Compete's hint and spoiler are free, and the spoiler hands over progress.**
  `request_spoiler` gives a compete player one of their own unfound secrets
  (`_unfound_secret` scopes to the caller) at no cost, and the spoiled word is
  still guessable — so asking and then guessing is a legal shortcut to the win.
  That breaks the priced-hint rule (`docs/win-lose.md` → The invariants): a
  hint in compete must be banned, earned, scored, or only self-informative.
  Harmless among friends, but undecided rather than chosen. The options: ban
  both in compete, as setgame and letterboxed do; price them (a spoiled secret
  does not count toward the win, or costs a guess); or rule it fine and move
  this to Won't do.

## Won't do

- **Anti-spam on guessing** (2026-06-14). The audience is friends (CLAUDE.md →
  Trust model), so nobody is spamming anybody; and the guess budget — 3, 5, 7
  or 9, checked in SQL — caps what a spammer could spend anyway.
- **A livelier `.infoState` readout** (2026-08-02). The info column's state line
  ("1/3 found · 4/7 guesses used", drawn by `StateLine`) is plain on purpose; it
  does not need spellingbee's rank-ladder treatment.
