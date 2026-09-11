# game-page — todo

## Bugs

- `act-back-to-club` answers `active` before `clubHandle` has loaded, and
  `requestBackToClub` then returns silently. `act-new-game-from-setup` beside
  it already answers `hidden` for that moment; this one should answer
  `disabled`.

## Soon

- **A contract-slot guard, per MOUNT POINT.** Common CSS reads custom
  properties a game fills in and no file declares (`--cols`, `--grid-gap`,
  `--max-tile-width`, the bee games' `--board-units-*`, `--rank-text`, …;
  the list is in docs/code-conventions.md → Known gotchas). A game that
  mounts the reader and forgets one gets a silently dead declaration, and the
  phantom-token guard passes it because each slot IS defined in *some* game.
  The check has to be "every game mounting this component defines the slots
  it reads", and this folder owns the mount points.
- `PlayAreaMountLog.tsx` exports two components (`PlayAreaSlotLog`,
  `PlayAreaReadyLog`), so "the filename is the component" is false here. Split
  or justify.
- **`GamePage` should build the play surface itself, and drop `children`.**
  Today the hole in the middle of the shell is filled by the caller: `children`
  is a render-prop, and `App.tsx` passes in the two mount logs, the error
  boundary, the Suspense and `<manifest.PlayArea {...ctx} />` — five levels of
  plumbing that are identical for every game and live in the routing file.
  Nothing in there needs the route: `PlayArea` comes off the `manifest` App
  hands down on the line above, and `App` is `GamePage`'s only caller, so the
  render-prop's flexibility is unused. Building it here collapses the route to
  `<GamePage key={gameId} gameId session manifest />`, drops two of App's three
  imports out of this folder, and lets `PlayAreaErrorBoundary` stop explaining
  where it is mounted from. Behavior is unchanged — the same wrappers in the
  same order, under `PauseBoundary` as now.
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
