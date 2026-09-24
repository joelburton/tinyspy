# board-cursor

Arrows move a cursor over a board — the key handling every board-cursor game reuses, and the axis-cursor math the letter-grid games use. `useBoardCursorKeys` binds four actions: `act-move-cursor`, `act-place-tile`, `act-remove-tile`, and the game's own commit.

## Details

- **Crosswords keeps its own cursor.** Its cursor is GRID-AWARE: it skips
  blocked cells and can jump to a word's edge, so movement there is a function
  of the puzzle, not just of a bound. That is the difference between a
  crossword and a rack game. It keeps its own `moveCursor` in
  `crosswords/lib/cursor.ts`; parameterizing `gridCursor` over "does the grid
  have holes" would make a framework out of a few lines of arithmetic.
