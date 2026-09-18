# actions — todo

## Bugs

## Soon

- **Help's key list TEACHES a game's keys; it does not mirror the instant.**
  Joel's ruling, 2026-09-18: *"the help was never meant to be 'exactly right
  now, what keys are available'. when players read the help, they're hoping to
  learn the keys useful for the game. they're not keeping it open to watch it
  change."* Acted on so far only for the ENTRY keys: `useCaptureKeys` and
  `word-entry/useArrowHistory` answer `disabled` at hard-off rather than
  `hidden`, so a finished word game still lists `A–Z`, `⌫`, `↵` and the arrows.
  `hidden` there now means only "this game hasn't got that key"
  (`hasHistory: false`).

  **What is still open is every other action.** A play-only action that leaves
  at terminal — End, Concede, Hint, Reveal — is gone from Help the moment the
  game ends, which is the same thing the ruling objects to. Two shapes:
  per-action (each decides, as the entry keys just did) or per-list (`KeyList`
  stops filtering `hidden` and simply lists every bound action with a key,
  which states the rule once where it belongs). The second is wider — it
  changes Help in all sixteen games — and would want `doc.md`'s sentence about
  `hidden` being "how a play-only action leaves at terminal" rewritten, since
  that would then be true of buttons and the keyboard but not of Help.

- **The never-widen constraint is an invention, and it is asserted in dev.**
  `useBoundAction.ts:233` logs *"a placement may narrow what 'key' says, never
  widen it"* whenever a non-`key` asker draws something the keyboard calls
  hidden, and the `ActionAsker` docstring states it as a rule. Joel proposed the
  ASKER (`04773acd`: *"Joel rejected a hideDisabled prop … and proposed passing
  the caller's category to describe, REQUIRED"*) — he did not propose the
  constraint, which the implementing session added alongside it and wrote up as
  if it came with the mechanism. Joel, 2026-09-18: *"i said we pass the callers
  category. i didn't say 'the menu can't be wider than the key' or any such
  thing."* It may still be right on its merits — a drawn control whose chord
  does nothing is worth catching — but it needs deciding rather than inheriting,
  and it is what a disabled button under a hidden key would run into.

## Someday

- **The key list in Help is one flat loop.** Group it under headings — "General
  keys" for the shell's four, "Crossword keys" (the game's brand) for the
  game's own — so a reader sees which keys are this game's and which every
  page has. The gain is the grouping, not the order.

## Maybe
