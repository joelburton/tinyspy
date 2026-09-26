# psychicnum — todo

## Bugs

## Soon

- **Doc and comments that say what the code does not.**
  - `doc.md`, under `psychicnum.request_spoiler(target_game)`: "in coop
    teammates see that a spoiler was taken, never which word." The header
    line leaves the word out, but the event log shows the spoiled word to
    every teammate (coop's `events` rows are all readable, and
    `GameEventLog` draws a spoiler row's word).
  - `doc.md` → Schema: compete's status `guesses_used` is the SUM of every
    player's count. `submit_guess` writes the sum mid-game, but the
    `'exhausted'` ending writes the budget itself (`initial_guesses`) and
    `submit_timeout` writes the average (`sum / count`). Nothing shows
    compete's count, so nothing on screen is wrong.
  - `psychicnum.sql`, `submit_guess`: "The FE gates on myConceded" — the
    name is `isConceded`.
  - `psychicnum.sql`, `end_game`'s header: "the post-terminal number reveal"
    — what is revealed is the three secret words.

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
