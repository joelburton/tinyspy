# connections — todo

## Bugs

## Soon

- **`shuffleTiles` in `lib/localOrder.ts` is a hand-written Fisher–Yates** —
  `shuffle(tiles)` from `src/common/utils/shuffle.ts` is the same function,
  so the export goes and `components/BoardCol.tsx` calls the util directly.
  Its three cases in `lib/localOrder.test.ts` (a permutation, the input
  untouched, an empty array) are pinned beside the util now and go with it;
  `reconcileLocalOrder` is untouched either way.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

## Maybe
