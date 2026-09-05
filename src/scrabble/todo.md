# scrabble — todo

## Bugs

- **Nineteen lines across eleven files cite `docs/scrabble-ai.md` and
  `docs/scrabble-ai-strength.md`, which do not exist** — residue of shipped
  plans, several with a section number (`S3`, `S5`, `band rule`) to make it
  worse. `lib/policy.ts` has five; `PlayArea.tsx`, `InfoCol.tsx`,
  `BoardCol.tsx`, `lib/rank.ts` and `lib/setup.ts` two each; `lib/suggest.ts`,
  `manifest.ts`, `SetupForm.tsx` and `InfoCol.module.css` one each. The live
  home is `docs/games/scrabble.md` §11 (the move suggester) and §12 (the AI
  opponent). Redirect the ones that point at content the docstring
  summarizes; delete the ones whose reasoning is already inline.

## Soon

- **The manual-end terminal is hand-written and reads differently from every
  other game.** `PlayArea.tsx` returns `{ verdict: 'Ended', message: 'Ended',
  tone: 'neutral' }` where thirteen games call the shared `endedCopy(mode)`
  (`Game ended` / `Game ended — no winner`, message `Game over`). Beyond the
  drift, `verdict` and `message` are the same string, which is the one thing
  the terminal copy type exists to separate, and no comment says why. Almost
  certainly `return endedCopy(mode)`; if the divergence is wanted it needs a
  comment instead.
- **`ScrabbleBlankPickerBlockingModal`'s overlay is at `z-index: 50`** — a
  full-screen `position: fixed` modal parked BELOW the panel tier, so an open
  chat or menu paints over it, and not on the floating-panel shell (no focus
  trap, no Esc, and a scrim click CANCELS, the opposite of every other
  modal's contract). Long recorded as the ladder's known anomaly; it wants a
  look, not a reflex bump. On the z-index guard's pending list until then.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

- **The AI suggest-a-move box is a `SelectionList` site that did not fit.**
  Five frameless text lines pinned to `5 × 1.35rem`, whose own comment says a
  growable height would shift the setup disclosure and the Moves log below
  it — so the frame, the surface and the row padding would arrive as a
  visible redesign, roughly doubling the box. Three options are written up
  in `docs/games/scrabble.md` → Deferred: leave it bespoke, give
  `<SelectionList>` a frameless compact form, or redesign the box and redo
  the height arithmetic.

## Maybe
