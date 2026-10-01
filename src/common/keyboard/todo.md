# keyboard — todo

## Bugs

## Soon

- **Help's key list tracks what is pressable this moment, and Help isn't for
  that.** Help is read once, to learn a game's keys; nobody keeps it open and
  watches the list change. Yet `offeredComponentKeyGroupsStore.ts` adds and
  withdraws component key groups as components mount, unmount and flip
  `live`, so the list is a live picture of the page. Help should list the keys a game has, not the ones
  answering right now.

## Someday

## Maybe

- **Three DOM markers this folder reads are string contracts with no home.**
  `[data-floating-panel]` (set by `FloatingPanel`; read by the dispatcher,
  `useTabRing`, `usePanelEscape`),
  `[data-chat-input]` (set by `ChatBody`; read by `act-open-chat`), and
  `data-game-input` (set by `ClueStrip`; read by `isNonGameField`). Each is
  typed by hand at every site, so a rename is a silent break at the readers.
  The cheapest guard is a test that greps the setter and the readers for the
  same literal, the way the sprint's other vocabularies are held.

## Won't do
