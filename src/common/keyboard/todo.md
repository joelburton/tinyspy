# keyboard — todo

## Bugs

## Soon

- **`useGameHasKeyboard.ts` has no test**, which was invisible in `game-page/`
  and is conspicuous here, where every other unit has one. It moved in from the
  game-page area on 2026-09-14 and arrived stamped `cs-audited-game-page`; the
  test is this folder's to write, not that area's.

- **A ring nested inside another loses when the two mount in the SAME commit.**
  The stack is ordered by mount and the innermost is the last on it, but React
  fires a child's effect BEFORE its parent's — so the OUTER ring is pushed last
  and answers Tab. Measured 2026-09-11 (a parent `useTabRing([])` around a child
  `useTabRing([ref])`: the parent consumed the key and the child's stop never
  took focus). Nothing hits it today, because every nested ring in the app opens
  a commit later than the surface under it — a floating panel is opened, and
  codenamesduet's clue form renders only after its PlayArea's loading pass. The
  fix, if it is ever wanted: a `within` ring knows an element, so innermost could
  be decided by DOM containment rather than by mount order.

## Someday

## Maybe

- **Three DOM markers this folder reads are string contracts with no home.**
  `[data-floating-panel]` (set by `FloatingPanel`; read by the dispatcher,
  `useTabRing`, `usePanelEscape`),
  `[data-chat-input]` (set by `ChatBody`; read by `act-open-chat`), and
  `data-game-input` (set by `CluePanel`; read by `isNonGameField`). Each is
  typed by hand at every site, so a rename is a silent break at the readers.
  The cheapest guard is a test that greps the setter and the readers for the
  same literal, the way the sprint's other vocabularies are held.

## Won't do
