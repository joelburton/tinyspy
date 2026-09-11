# keyboard — todo

## Bugs

## Soon

- **`keyboardHandoff.ts` has a scheduled successor.** `handOffKeyboardOnTab`
  is the "ring transition" row of `plans/tab-rings.md`, and both its callers
  (`ChatBody`, `GameScratchpadCompanion`) are floating panels, so the
  conversion is `floating-panels/todo.md`'s. Recorded here so nobody "tidies"
  a file that audits clean and has a replacement coming.
## Someday

## Maybe

- **Three DOM markers this folder reads are string contracts with no home.**
  `[data-floating-panel]` (set by `FloatingPanel`; read by the dispatcher,
  `useTabRing`, `useFocusTrap`, `usePanelEscape`),
  `[data-chat-input]` (set by `ChatBody`; read by `act-open-chat`), and
  `data-game-input` (set by `CluePanel`; read by `isNonGameField`). Each is
  typed by hand at every site, so a rename is a silent break at the readers.
  The cheapest guard is a test that greps the setter and the readers for the
  same literal, the way the sprint's other vocabularies are held.
