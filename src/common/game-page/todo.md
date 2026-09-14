# game-page — todo

## Bugs

## Soon

- **`game-page/playArea.module.css` is five concerns in one file.** Renamed to
  lowercase 2026-09-16 (docs/deferred.md → Common / architecture: a sheet read
  by others is not a component's), which was the half of this that was provably
  right — **subdividing it is still open.** 45 rules: the two-column shell (`.layout`,
  `.boardCol`, `.infoCol`, `.mobileFill`, `.responsiveInfoCol`, `.hugRectWidth`,
  `.floatingShuffle`) — which is the file's real subject; the info-column
  readouts (`.actionSlot`, `.infoState`, `.infoHelp`, `.infoActions`,
  `.terminalActions`, `.outcome_*`, `.terminalExtra`); the below-board feedback
  slot (`.localFeedback`, `.moveAreaOrLocalFeedback`); the tile chrome (`.tile`,
  `.tileFace`, `.tileWord` + states); and the board-wide state marks
  (`.dimInFlight`, `.dimNotYourTurn`, `.gameOverFrame`,
  `.verdict*`, `.attentionFlash`, `.yourTurnFlash` + keyframes), which are
  [plans/tile-feedback.md](../../../plans/tile-feedback.md)'s subject. Joel,
  2026-09-14: *"it's also wrong for stuff about info-col shared css to be in
  PlayArea.module.css, it would be much better in a shared InfoCol.module.css."*
  A concern that had its own file would have made setup-form's `.infoSetup`
  misfiling (F-setup-form-10) impossible to write. There is no
  `common/game-page/PlayArea.tsx` — the sheet was named for the play surface,
  not for a component here, which is what made it a magnet; the rename removed
  that invitation without moving a rule.

  **The cost to weigh when this is picked up**, which the item used to
  understate by claiming the split "needs no component to change": every game
  writes `shared.infoCol` off one import, so moving a class to another sheet is
  a rename at each call site — **19 `.tsx` files** for the info-column classes
  alone — and a missed one is an unstyled element, not a build error.
  `composes:` would let the declarations split while consumers keep one import;
  the repo uses it nowhere yet, which is the open decision in docs/deferred.md's
  third bullet under the same heading.

  Joel, 2026-09-16: *"let's do 1 now, and continue to have an issue to subdivide
  it later. once we're at the point of being able to audit our first game, we'll
  be a in a better place."* The consumers ARE the games, so the split wants a
  game's own CSS pass open beside it.

- **The info column's action box does not reserve its height.** Narrowed
  2026-09-16: the `over ?` split is gone (every state is one `<InfoActionsRow>`
  now), and the container is `.actionSlot`, which has `min-height: 6rem` — a
  floor, not a reserved box. So what is left is the HELP line, play-only in
  eight games: it and its 1rem gap leave at terminal, which under 6rem the floor
  absorbs and over 6rem it does not. **Measure before deciding** — read
  `.actionSlot`'s height in both states in a game with a long help line
  (stackdown, letterboxed) and a short one (waffle). Then either reserve the
  slot or amend docs/ui.md, whose Terminal-results paragraph claims the row
  "never adds or removes a flow element".
- **A contract-slot guard, per MOUNT POINT.** Common CSS reads custom
  properties a game fills in and no file declares (`--cols`, `--grid-gap`,
  `--max-tile-width`, the bee games' `--board-units-*`, `--rank-text`, …;
  the list is in docs/code-conventions.md → Known gotchas). A game that
  mounts the reader and forgets one gets a silently dead declaration, and the
  phantom-token guard passes it because each slot IS defined in *some* game.
  The check has to be "every game mounting this component defines the slots
  it reads", and this folder owns the mount points.
- `PlayAreaErrorBoundary.tsx`'s docstring says the boundary sees a chunk
  failure only when the stale-chunk path declined to reload. It also catches
  one ON the reload path: Vite's preload helper returns instead of throwing
  when the error is default-prevented, so the failed import resolves to
  nothing, the manifest's `.then((m) => ({ default: m.PlayArea }))` throws on
  `undefined`, and the card paints for the frame before the reload lands.

## Someday

- Whether Help's "Got it" button belongs on a companion at all — a companion
  is the family that closes by its ✕, having nothing to answer.
- The global feedback slot `GamePage.tsx` holds inline is `feedback`'s
  concern; whatever that redesign decides about slot ownership lands as a
  change this folder applies.
- **The game page is the one page not wearing `.pageHeaderAndMainArea`.**
  Its wrapper is its own `.frame` — a flex column with the same 1rem gap and
  no height bound, because the play surface bounds itself off
  `--game-chrome-height` instead. Whether it should take the shared pattern
  (`core-css/patterns/page.css`) and let the bound come from there is a
  layout decision for this folder; a header or padding change moves both
  numbers by hand today.

## Maybe
