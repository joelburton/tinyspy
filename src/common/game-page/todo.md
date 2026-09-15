# game-page — todo

## Bugs

## Soon

- **`game-page/playArea.module.css` is five concerns in one file.** Renamed to
  lowercase 2026-09-16 (docs/deferred.md → Common / architecture: a sheet read
  by others is not a component's), which was the half of this that was provably
  right — **subdividing it is still open.** 45 rules: the two-column shell (`.layout`,
  `.boardCol`, `.infoCol`, `.mobileFill`, `.responsiveInfoCol`, `.hugRectWidth`,
  `.floatingShuffle`) — which is the file's real subject; the info-column
  readouts (`.steadyRows`, `.infoState`, `.infoHelp`, `.infoActions`,
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

- ~~**The info column's action box does not reserve its height.**~~ **Closed
  2026-09-15: it will not.** Joel: *"while we have a general principle of
  'don't shrink/grow things in the infoCol', we do that at the item level (ie,
  we make it so that the action buttons are always one line, if the
  opponentstrip would grow based on your last move, we'd reserve 2 lines for
  it, etc)."* So the don't-move rule is kept row by row, and a height on the
  stack is the container-level reservation it refuses. The `min-height: 6rem`
  that was doing that is gone.

  The wrapper itself stays, and is now `.steadyRows` rather than
  `.actionSlot` — it holds every row of the column except the turn log / word
  list, of which the action row is one, and what they share is that they keep
  their height while the log absorbs the slack. It earns its place because
  flex shrinking is negotiated between siblings: with it, `.infoCol` has two
  children and "the log gives" is structural; without it the rule would be
  `.infoCol > * { flex-shrink: 0 }` against `TurnLog`'s `flex: 1` at equal
  specificity, decided by module import order.

  **What this leaves owed, per game:** the row-level reservations the
  principle asks for. `SetupDisclosure` also adds `margin: 0.3rem 0 0` of its
  own on top of the column gap, so the setup row sits 1.3rem below its
  neighbor where every other pair is 1rem — the one inconsistency in the
  column's spacing.

- ~~**A contract-slot guard, per MOUNT POINT.**~~ **Closed 2026-09-15, no
  change.** The shared `.hugRectWidth` reads `--cols` / `--max-tile-width` /
  `--grid-gap` and no `common/` file sets them, so a game that wears the class
  and forgets one gets an invalid `width` that the browser drops — the board
  then sizes itself. Joel: *"wouldn't it break the layout in any obvious
  way?"* It would, immediately, in the board being edited, and only when a new
  board first wears the class. The rule already names what a game owes it
  ("Each game supplies --cols / --max-tile-width / --grid-gap"). A guard would
  also be unsound: psychicnum fills `--cols` from an inline `style` on the
  parent element, so a CSS-only check reports it broken on day one.

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
