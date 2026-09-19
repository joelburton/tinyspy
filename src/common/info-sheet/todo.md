# info-sheet — todo

## Bugs

## Soon

- **Emerge a shared `<InfoCol>` component.** Every game has its own
  `InfoCol.tsx`, and each opens with the same skeleton: `.infoCol` → `.noShrinkRow` → state line → `<OpponentStrip>` when
  compete → action row → help → `<SetupDisclosure>` → event log.
  [docs/playarea.md](../../../docs/playarea.md) → Info-column readouts calls
  that order "enforced on every standard game", which today means documented and
  obeyed by hand — and it records codenamesduet having drifted out of it once. A
  shared component would make the order structural and, more to the point here,
  would build on the column's own stylesheet, `infoCol.module.css`, which landed
  2026-09-18.

  Joel's steer, 2026-09-14: a game extending the shared look should do it
  through CSS Modules' `composes:`, so the game's own module names what it takes
  from the shared one and the **component** never knows its style comes from two
  places. *"not having the component itself know which parts of its style comes
  from one module vs another is a real win."* The repo uses `composes` nowhere
  today; see [docs/deferred.md](../../../docs/deferred.md) → Common /
  architecture.

  The CSS split is done and did not need this; this needs the slots named and
  decided first (what is a slot, what is free-form, what a game that wants none
  of one does).

## Someday

## Maybe

## Won't do

- **`infoPanel.headerRow` should be `.heading-with-controls`** (2026-09-18). It
  stays hand-written. The two are the same five declarations, but the pattern is
  a GLOBAL class written as a string and its readers are pages (`ClubPage`,
  `HomePage`), while the event log and the word list are shared components — and
  a component in `common/` reaching for a global class couples its look to
  `core-css`'s cascade instead of to a module it imports. What the pattern adds
  beyond the five is `> :first-child { min-width: 0 }`, which neither of these
  headings needs: the event log's is one word, and the word list's wraps between
  its tallies on purpose. The reason now lives on `.headerRow` itself, and
  `patterns/heading.css` plus `docs/ui.md` no longer claim these two rows as
  instances of the pattern — they did, and were wrong.
