# actions — todo

## Bugs

- **`act-open-menu` answers `active` with no menu to open.** `AppActionsHost`
  binds it unconditionally, so on a page with no registered menu (a game
  paused, where its menu is gone) `?` sits in the key list and does nothing.
  `pageMenuStore` is a slot with no subscription, so `describe` cannot ask
  whether one is registered; give it one, then answer `hidden`.

## Soon

- **Write down the ruling that lets a play-only action answer `disabled`
  rather than `hidden`.** `doc.md` says hidden is "not here at this moment",
  yet psychicnum, letterboxed, connections, stackdown, scrabble and
  codenamesduet answer `disabled` for Hint, Spoiler and Reveal outside their
  moment, on purpose: the menu row is the legend that teaches the glyph, and
  the terminal-row slot keeps its shape. Either the doc states that exception
  and its reason, or the games conform.

## Someday

- **`docs/keyboard-shortcuts.md` is hand-kept** and can drift from the registry
  and the bindings. Generating its per-game tables from `ACTIONS` plus a walk
  of the bindings, or guarding it against them, is the refinement that would
  end the drift.
- **The key rides inside the tooltip string** ("New game · +"). A styled key cap
  would read better, and needs `TooltipHost` to take more than text.
- **The key list is one flat loop.** Grouping it — this game's commands, then
  the universal ones — is worth doing once every key is registered and the list
  is long enough to want it.

## Maybe

- **`digit` is an unused pattern.** It costs a line and no game types numbers
  today; psychicnum's guesses are words.
