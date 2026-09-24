# board-cursor

Arrows move a cursor over a board — the key handling every board-cursor game reuses, and the axis-cursor math the letter-grid games use. `useBoardCursorKeys` binds five actions: `act-move-cursor`, `act-place-tile`, `act-remove-tile`, `act-toggle-tile`, and the game's own commit.

## Intro to area

In bananagrams and scrabble you can build words from the keyboard as well as
by dragging tiles. A cursor sits on one cell of the grid, pointing across or
down. Type a letter and a tile for it goes there and the cursor moves on;
Backspace takes one back; the commit's key makes the move. It is a
crossword's cursor, laid over a board of loose tiles.

The folder is the part of that the games share, in three pieces.
`useBoardCursorKeys` binds the keys as actions and hands each press to the
game. `gridCursor.ts` is the cursor's math: where an arrow moves it, and which
cell a Backspace empties. `gridCursor.module.css` is the ring drawn on the
cell, heavy on the two edges the letters will run between, so the direction
reads at a glance.

What stays in each game is what a key means there: where a placed tile comes
from, which tiles may be removed, where the cursor goes after a placement,
and what the commit is. The pointer side of the same boards is
`shared/grid-and-drag`'s.

## Details

```
common/board-cursor/
 ├── useBoardCursorKeys.ts    the five bound actions; the game's callbacks
 ├── gridCursor.ts            moveCursor · stepBack · planBackspace
 ├── gridCursor.module.css    the ring: .cursor + .cursorH / .cursorV
 ├── useSelectionCursor.ts    a selection cursor's show/hide rules
 ├── stepCell.ts              where an arrow takes a selection cursor on a board
 └── useBoardSelectionCursor.ts   the two above plus useBoardCursorKeys: a board's selection cursor
bananagrams/hooks/usePlayerBoard.ts     runs the hook and the math; BoardArena renders the ring
scrabble/components/BoardCol.tsx        runs the hook and the math; Board renders the ring
common/lists/SelectionList.tsx          runs useSelectionCursor over its rows
```

- **The keys are actions.** The arrows and the letters are pattern actions,
  so the dispatcher's gates come with them: a modified chord never matches, a
  keystroke aimed at a focused field never arrives, and a disabled action
  still keeps its key from the browser (Space never scrolls the page).
  `enabled` disables them all; `canCommit` disables only the commit, and the
  same answer grays the commit's button, which is the binding the hook
  returns.
- **A board takes only the keys it has.** `onLetter`, `onBackspace` and
  `onToggle` (Space) are each optional, and an action with no callback answers
  HIDDEN rather than disabled: Help does not list it, and its keystroke goes
  on to the browser, where a disabled one would be swallowed. A letter-grid
  game passes the first two; a game that picks pieces passes `onToggle`, and
  never with `act-peel`, whose keys include Space.
- **The commit brings its own keys.** `commit` names the action, and the
  registry says which keys it carries: `act-submit` Enter, `act-peel` Enter
  and Space.
- **Backspace is crosswords' two-step rule.** A removable tile under the
  cursor goes and the cursor stays; on an empty cell the cursor steps back,
  passing over locked tiles as typing passes over them going forward, and the
  tile it lands on goes. The game reports each cell as `removable`, `locked`
  or `empty`; `planBackspace` answers which cell, and the game removes it.
- **The ring is a positioned child of the cell.** Its `z-index` is local,
  inside the board's stacking context. The game's own `.cursor` carries only
  `border-radius`, to match its cell. Its color is `--mark-gridCursor-color`
  (per theme) and its heavy edges `--mark-gridCursor-heavy-width` (in
  `base.css`: a width is not a theme decision).
- **Crosswords keeps its own cursor.** Its cursor is GRID-AWARE: it skips
  blocked cells and can jump to a word's edge, so movement there is a function
  of the puzzle, not just of a bound. That is the difference between a
  crossword and a rack game. It keeps its own `moveCursor` in
  `crosswords/lib/cursor.ts`; parameterizing `gridCursor` over "does the grid
  have holes" would make a framework out of a few lines of arithmetic.
- **Not `useCaptureKeys`.** That hook (`common/keyboard`) takes typed entry
  into a word with no cursor; this is the board-cursor sibling, not a
  superset.
- **The selection cursor is being built here.**
  [plans/keyboard-nav-plan.md](../../../plans/keyboard-nav-plan.md) builds a
  board's selection cursor, `useBoardSelectionCursor`, from
  `useSelectionCursor`, `stepCell` and `useBoardCursorKeys` (through
  `onToggle`). On a board Space acts on the cursor and is inert while it is
  hidden; Enter commits the selection, which is always drawn, so it is not. `<SelectionList>` already runs
  `useSelectionCursor`, which is why the folder is in `common/`. The ring and
  `gridCursor` are outside that plan.
