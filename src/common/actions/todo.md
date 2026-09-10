# actions — todo

## Bugs

## Soon

- **Every race should be able to stop the whole table, and most cannot.**
  `offersEndForAll` is bananagrams-only: the other races have no whole-table
  stop, so a group that has simply lost interest can only close the game by
  every player conceding it. Each schema defines `end_game`, but a race wiring
  it up needs its own decision about what the terminal says (nobody won, and
  that is not the same as everyone losing), so this is per-game SQL rather than
  a sweep.

  **The FE is already built for it.** When a game gains one it passes
  `offersEndForAll`, and its Concede grows the second answer — no registry
  change, no new component, no per-game branch.

## Someday

- **The key rides inside the tooltip string** ("New game · +"). A styled key cap
  would read better, and needs `TooltipHost` to take more than text.
- **The key list is one flat loop.** Grouping it — this game's commands, then
  the universal ones — is worth doing once every key is registered and the list
  is long enough to want it.

## Maybe

- **`digit` is an unused pattern.** It costs a line and no game types numbers
  today; psychicnum's guesses are words.
