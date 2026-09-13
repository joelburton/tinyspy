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
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **The manual-end terminal is hand-written and reads differently from every
  other game.** `PlayArea.tsx` returns `{ pillText: 'Ended', infoColText:
  'Ended', outcome: 'neutral' }` where thirteen games call the shared
  `gameEndedTerminalMessage(mode)` (`Game ended` / `Game ended — no winner`,
  info-column line `Game over`). Beyond the drift, `pillText` and
  `infoColText` are the same string, which is the one thing the terminal
  message type exists to separate, and no comment says why. Almost certainly
  `return gameEndedTerminalMessage(mode)`; if the divergence is wanted it
  needs a comment instead.
- **Two raw `<button>`s take focus on click**, where every `StandardButton`
  suppresses it: the AI suggestion rows (`InfoCol.tsx`) and the history banner's
  ✕ (`BoardCol.tsx`). The suggestion row is the one that lingers — clicking it
  stages the move and the list stays up, so the row keeps focus and the next
  Enter re-activates it natively. Nothing on a play surface should hold focus
  (Joel, 2026-09-10); the fix belongs with this game's tab ring rather than to
  a special case in the key dispatcher.
- **`shuffle` in `lib/policy.ts` is a hand-written Fisher–Yates** —
  `src/common/utils/shuffle.ts` is the same function with the rng optional,
  so the local one goes and its one seeded call site (the self-play bag)
  passes its `rng` exactly as it does today. Import it the way this file already imports
  `mulberry32` (the alias with an explicit `.ts`, because Deno loads
  `policy.ts` too).
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **The info column picks a font size off the ramp, twice.**
  `InfoCol.module.css` writes `font-size: 0.9rem` on its heading and on
  `.suggestRow`, where the ramp's small step is `0.85rem` — 0.8px apart at the
  browser's default root, so it reads as a guess rather than a choice. The
  suggest row is a list row that IS the control rather than a general button,
  so the shared button's `small` treatment does not reach it; this is only
  about which size it means to be.
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `scrabble.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

## Someday

- **The AI suggest-a-move box is a `SelectionList` site that did not fit.**
  Five frameless text lines pinned to `5 × 1.35rem`, whose own comment says a
  growable height would shift the setup disclosure and the Moves log below
  it — so the frame, the surface and the row padding would arrive as a
  visible redesign, roughly doubling the box. Three options are written up
  in `docs/games/scrabble.md` → Deferred: leave it bespoke, give
  `<SelectionList>` a frameless compact form, or redesign the box and redo
  the height arithmetic.
- `PlayArea.tsx` returns its own `<p className={styles.loading}>Loading
  game…</p>` while the read is pending, where `src/common/loading`'s
  `<Loading>` is the word every page shows for that moment. Swap it in, or
  say why this surface's is different — it is the one with a class of its own.

## Maybe
