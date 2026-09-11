# keyboard — todo

## Bugs

## Soon

- **`useTabRing` has no test at all**, and its on-screen test is false for a
  `position: fixed` element. It is the mechanism `plans/tab-rings.md` was
  written to produce. (Noted in a read since deleted; re-derive rather than
  trust.)
- **`keyboardHandoff.ts` has a scheduled successor.** `handOffKeyboardOnTab`
  is the "ring transition" row of `plans/tab-rings.md`, and both its callers
  (`ChatBody`, `GameScratchpadCompanion`) are floating panels, so the
  conversion is `floating-panels/todo.md`'s. Recorded here so nobody "tidies"
  a file that audits clean and has a replacement coming.
- **The Tab swallow is `useTabRing([])` in several spellings.** `useSwallowTab`,
  the Tab clause in `useCaptureKeys`, and inline swallows in strands' and
  setgame's PlayAreas all say "an empty ring". Converting them is
  `plans/tab-rings.md`'s, per surface; the smallest step that closes this
  folder's own scaffolding is the `useSwallowTab` callers becoming
  `useTabRing([])` and the hook going, and `useGlobalKeyHandler` with it once
  `useCaptureKeys`' clause follows. Two facts the conversion must keep: the
  swallow declines inside a field or a floating panel today (the ring's
  transitional guard covers the same cases for every current caller), and
  `useCaptureKeys` swallows only while the entry is live (a page ring would
  swallow at terminal too, which is the ring rule and the intended direction).

## Someday

## Maybe

- **Three DOM markers this folder reads are string contracts with no home.**
  `[data-floating-panel]` (set by `FloatingPanel`; read by the dispatcher,
  `useGlobalKeyHandler`, `useTabRing`, `useFocusTrap`, `usePanelEscape`),
  `[data-chat-input]` (set by `ChatBody`; read by `act-open-chat`), and
  `data-game-input` (set by `CluePanel`; read by `isNonGameField`). Each is
  typed by hand at every site, so a rename is a silent break at the readers.
  The cheapest guard is a test that greps the setter and the readers for the
  same literal, the way the sprint's other vocabularies are held.
