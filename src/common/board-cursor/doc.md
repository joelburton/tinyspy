# board-cursor

Arrows move a cursor over a board — the key handling every board-cursor game reuses, the axis-cursor math the letter-grid games use, and the selection cursor the picking boards and `<SelectionList>` use. `useBoardCursorKeys` binds five actions: `act-move-cursor`, `act-place-tile`, `act-remove-tile`, `act-toggle-tile`, and the game's own commit.

## Intro to area

Two kinds of cursor live here, and they answer different questions.

In bananagrams and scrabble you can build words from the keyboard as well as
by dragging tiles. A cursor sits on one cell of the grid, pointing across or
down. Type a letter and a tile for it goes there and the cursor moves on;
Backspace takes one back; the commit's key makes the move. It is a
crossword's cursor, laid over a board of loose tiles — a GEOGRAPHIC cursor,
which the player needs to read the board, so it always shows.
`gridCursor.ts` is its math: where an arrow moves it, and which cell a
Backspace empties. `gridCursor.module.css` is its ring, heavy on the two edges
the letters will run between, so the direction reads at a glance.

In psychicnum you pick a word from the keyboard as well as by clicking one.
Arrows move a ring over the tiles, Space picks the word under it, Enter
guesses. That is a SELECTION cursor — an alternative to clicking, so it stays
hidden until an arrow asks for it. `useSelectionCursor` holds its show/hide
rules, which `<SelectionList>` keeps too; `stepCell` says where an arrow takes
it over a board's cells; `useBoardSelectionCursor` puts those together with
the keys.

Both kinds take their keys from `useBoardCursorKeys`, which binds them as
actions and hands each press to the game. What stays in each game is what a
key means there: where a placed tile comes from, which tiles may be removed,
what a pick is, and what the commit is. The pointer side of the letter-grid
boards is `shared/grid-and-drag`'s.

## Details

```
common/board-cursor/
 ├── useBoardCursorKeys.ts    the five bound actions; the game's callbacks
 ├── gridCursor.ts            moveCursor · stepBack · planBackspace
 ├── gridCursor.module.css    the ring: .cursor + .cursorH / .cursorV
 ├── useSelectionCursor.ts    a selection cursor's show/hide rules
 ├── stepCell.ts              where an arrow takes a selection cursor on a board
 ├── useBoardSelectionCursor.ts   the two above plus useBoardCursorKeys: a board's selection cursor
 └── reachability.fixture.ts  for a test: the cells a cursor can never reach on a board's shape
bananagrams/hooks/usePlayerBoard.ts     runs the hook and the math; BoardArena renders the ring
scrabble/components/BoardCol.tsx        runs the hook and the math; Board renders the ring
psychicnum/components/BoardCol.tsx      runs useBoardSelectionCursor; Board renders the ring
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
- **The letter-grid ring is a positioned child of the cell.** Its `z-index` is local,
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
- **A selection cursor's rules are one hook, for boards and lists alike.**
  `useSelectionCursor`: hidden until a movement key asks; a relative key's
  first press only shows it; an absolute key (Home, End) shows it and moves;
  a click moves it and hides it. `<SelectionList>` runs it, which is why the
  folder is in `common/` (common never imports shared).
- **On a board, Space acts on the cursor and Enter does not.** Space picks the
  piece under the cursor, so it is inert while the cursor is hidden. Enter
  commits the selection, which is always drawn (the picked border), so it
  commits with the cursor hidden — a click then Enter makes the move. It is
  also the Submit button's action, and an action cannot be off for its key and
  on for its button.
- **Arrows move by shape, never by state.** `stepCell` goes to the next cell
  that EXISTS in the arrow's direction, passing over a hole, and stays put at
  an edge or a short last row. A decided piece still exists: the cursor rests
  on it and Space does nothing there, so the same press always goes the same
  place. Every board's shape carries a reachability test
  (`reachability.fixture.ts`).
- **The selection ring is the game's to draw**, as `outline:
  var(--chrome-cursor-ring)` on the piece `cursor` names, outside it
  ([tile-feedback.md](../../../plans/tile-feedback.md) → Position).
