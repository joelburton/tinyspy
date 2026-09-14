# info-sheet — todo

## Bugs

## Soon

- **`TurnStatusLine` takes `.infoState` from another folder's stylesheet** —
  `game-page/PlayArea.module.css`, one of the four info-column readout kinds.
  Raised from setup-form's audit (Joel, 2026-09-14): *"it feels wrong for
  someone else to import CSS that is named for one component."* The file is not
  in fact component-named — there is no `common/game-page/PlayArea.tsx` — but
  this folder should argue its own case when it opens, and it has the sharpest
  version of the question: `docs/common-folders.md`'s folder table already gives
  info-sheet *"the chrome its panels share"*, while the readout kinds
  (`.infoState` / `.infoHelp` / `.infoActions`) live in
  `game-page`. Either the table's claim is wrong or the family is in the wrong
  folder. Same question in `terminal` and `word-entry`.

## Someday

- **`infoPanel.headerRow` is `.heading-with-controls` written by hand.** The
  turn log and the word list both wear it for a heading with a picker on the
  right, which is exactly the shared pattern (`core-css/patterns/heading.css`).
  Convert, and let the shared row's `min-width: 0` rule decide who yields.

## Maybe
