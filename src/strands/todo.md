# strands — todo

## Bugs

- `HintBar.tsx` reads `styles.hint` and the module defines only
  `.hintReady`, so the Hint button's base class resolves to `undefined` and
  `cls()` drops it. Found by `cssClasses.test.ts`, whose `MEMBER_PENDING`
  holds it until then.
- The under-board clue pill in `PlayArea.tsx` passes `variant: 'outline'`, a
  property the feedback message type does not have; it is silently dropped
  and the rendering is unaffected (the pill derives outline from the mode).
  Delete the property. It believed a docstring on the pill component that is
  itself wrong (`src/common/feedback/todo.md`).

## Soon

## Someday

## Maybe
