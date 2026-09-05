# wordwheel — todo

## Bugs

## Soon

- **Two hand-written Fisher–Yates shuffles, one per side** — `shuffled` in
  `components/BoardCol.tsx` and `shuffled` in
  `supabase/functions/wordwheel-build-board/index.ts`. Both become
  `src/common/utils/shuffle.ts`: the component calls `shuffle(items)` (the
  default rng is `Math.random` and a copy comes back, so behavior is
  unchanged), and the edge function imports the util by relative path with an
  explicit `.ts`, the way `scrabble-ai-move` imports `mulberry32`.
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).

## Someday

## Maybe
