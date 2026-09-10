# actions — todo

## Bugs

## Soon

- **Two actions that can be on screen together must not share a chord**, and
  nothing checks it. End and Concede share `⌥⌫` legitimately (never both
  active), as do Shuffle and Rotate, so the check has to know what can be live
  at once — which is a runtime fact. A development-time warning from the
  dispatcher when two active bindings match one keystroke is the cheap version.
- **A game file may not catch a registered chord by hand.** The only way to bind
  shuffle is to bind the action; a handler matching `⌥Z` in a game's own code
  defeats that. A grep-based guard over the literals the registry owns is the
  shape, if it stays short.

## Someday

- **The key rides inside the tooltip string** ("New game · +"). A styled key cap
  would read better, and needs `TooltipHost` to take more than text.
- **The key list is one flat loop.** Grouping it — this game's commands, then
  the universal ones — is worth doing once every key is registered and the list
  is long enough to want it.

## Maybe

- **`digit` is an unused pattern.** It costs a line and no game types numbers
  today; psychicnum's guesses are words.
