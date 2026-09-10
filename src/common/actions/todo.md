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
- **`helperButton` is on some action-row buttons and not others, and nobody
  decided which.** `.helperButton` (`common/game-page/PlayArea.module.css`) is
  `flex: 0 0 auto` + `white-space: nowrap` — written for a LABELED button, so a
  flex row can't stretch it or wrap "Concede" onto two lines. It sits on End,
  Concede, Hint and Spoiler; never on Restart, New game or Back to club. The
  split is inherited from the labeled era and the conversion has been copying it
  forward verbatim.

  On an icon-only row it means almost nothing: there is no label to keep on one
  line, and `flex: 0 0 auto` differs from the default only in shrink — which
  never engages in `.infoActions` (it wraps instead). The one place it could
  still bite is `.terminalActions`, which is `flex-wrap: nowrap` with
  `.outcome { flex: 1 }` ahead of the buttons.

  Investigate whether it does anything on the icon-only rows, then sweep: either
  put it on every button in those rows or drop it from them and leave it to the
  games that still draw labels. One decision, applied everywhere — not a choice
  each game's conversion makes again.

## Someday

- **The key rides inside the tooltip string** ("New game · +"). A styled key cap
  would read better, and needs `TooltipHost` to take more than text.
- **The key list is one flat loop.** Grouping it — this game's commands, then
  the universal ones — is worth doing once every key is registered and the list
  is long enough to want it.

## Maybe

- **`digit` is an unused pattern.** It costs a line and no game types numbers
  today; psychicnum's guesses are words.
