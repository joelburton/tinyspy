# terminal — todo

## Bugs

## Soon

- **`TerminalActionRow` and `LocalTerminalRow` take their look from another
  folder's stylesheet** — `game-page/PlayArea.module.css`, for `.infoActions`,
  `.terminalActions` and `.outcome`. Raised from setup-form's audit
  (Joel, 2026-09-14): *"it feels wrong for someone else to import CSS that is
  named for one component."* The file is not in fact component-named — there is
  no `common/game-page/PlayArea.tsx`, and it holds the play surface's shell, the
  four info-column readout kinds and the tile chrome — but this folder should
  argue its own case when it opens. Both files here wear a readout kind plus the
  terminal swap, which is the family's most-entangled reader: the swap exists
  because these two replace the play buttons. Decide whether that makes them
  part of the readout family (leave it), or whether the terminal's own chrome
  belongs here. Same question in `info-sheet` and `word-entry`.

- `CelebrationBlockingModal`'s `.title` is an `<h2>` at `1.5rem` — h1's size,
  where h2 is `1.25rem`. May be earned; should be a decision.
- `CelebrationBlockingModal`'s `.button:focus-visible` re-declares the shared
  ring. Nothing about that dialog should change a button's ring.

## Someday

## Maybe
