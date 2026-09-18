# info-sheet — todo

## Bugs

- **Judge `Exclude<Outcome, 'error'>` on the action row's outcome.** Ruled
  2026-09-15: any outcome is a valid outcome, and `error` is a full member of
  the list — a game may answer with it, and if one did it would take an error
  pill and an error bar in the event log like any other word. So excluding it
  here needs a reason of its own, and the one written down (that `error` is not
  an outcome at all) is not true. Either the row has a reason no game can hand
  it that word, and it says so, or the exclusion goes.
  ([docs/outcomes.md](../../../docs/outcomes.md) → A narrower Outcome type.)

## Soon

- **Emerge a shared `<InfoCol>` component.** Every game has its own
  `InfoCol.tsx` (fourteen of them, 196-348 lines) and each opens with the same
  skeleton: `.infoCol` → `.noShrinkRow` → state line → `<OpponentStrip>` when
  compete → action row → help → `<SetupDisclosure>` → event log.
  [docs/playarea.md](../../../docs/playarea.md) → Info-column readouts calls
  that order "enforced on every standard game", which today means documented and
  obeyed by hand — and it records codenamesduet having drifted out of it once. A
  shared component would make the order structural and, more to the point here,
  would give the info column a real matched stylesheet: today its shared classes
  live in `game-page/playArea.module.css` (see that folder's todo), which is the
  wrong file for them.

  Joel's steer, 2026-09-14: a game extending the shared look should do it
  through CSS Modules' `composes:`, so the game's own module names what it takes
  from the shared one and the **component** never knows its style comes from two
  places. *"not having the component itself know which parts of its style comes
  from one module vs another is a real win."* The repo uses `composes` nowhere
  today; see [docs/deferred.md](../../../docs/deferred.md) → Common /
  architecture.

  Bigger than the CSS split and shouldn't block it: it needs the slots named and
  decided first (what is a slot, what is free-form, what a game that wants none
  of one does).

- **`TurnStatusLine` takes `.infoState` from another folder's stylesheet** —
  `game-page/playArea.module.css`, one of the four info-column readout kinds.
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
  event log and the word list both wear it for a heading with a picker on the
  right, which is exactly the shared pattern (`core-css/patterns/heading.css`).
  Convert, and let the shared row's `min-width: 0` rule decide who yields.

## Maybe
