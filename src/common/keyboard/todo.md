# keyboard — todo

## Bugs

## Soon

- **`useGameHasKeyboard.ts` has no test**, which was invisible in `game-page/`
  and is conspicuous here, where every other unit has one. It moved in from the
  game-page area on 2026-09-14 and arrived stamped `cs-audited-game-page`; the
  test is this folder's to write, not that area's.

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
