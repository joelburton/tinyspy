# grid-and-drag

Press a lettered tile, then tap it or drag it onto a grid: the pointer handling
behind bananagrams' and scrabble's boards, and the ghost tile that follows the
pointer while one is carried.

## Intro to area

In bananagrams and scrabble you build words by carrying tiles. A tile comes off
the rack or hand onto a grid cell, a placed tile moves to another cell or goes
back, a rack tile moves along the rack, and in bananagrams a tile can go into
the dump. The same press can also be a tap, which means something else again:
move the keyboard cursor, or mark a rack tile for exchange. `useDragGesture`
turns the pointer's press, moves and release into one of two answers, a drop
at a point or a tap. The game decides what either one means.

It is built on pointer events rather than the browser's own drag-and-drop,
because what these games need is what the built-in drag does badly. Where a
drop lands is read by position: which cell is under the pointer, where along
the rack, whether it is over the dump. The tile that follows the pointer has to
look like the tile that was lifted, tilted as if picked up. And the cell under
the pointer lights while you carry it. Waffle drags too, and uses the
browser's own drag, because its drag is a mouse shortcut for a move you can
also make by tapping two tiles. That is the line: the built-in drag where a
drag is a mouse shortcut for a tap move between two things of the same kind;
this hook where a drop means different things depending on where it lands, or
a tap means something else.

A drag is a mouse affordance ([docs/mobile.md](../../../docs/mobile.md)), so a
finger taps here but never drags.

What stays in each game is the meaning: its `onDrop` and `onTap`, the zones it
reads besides the grid (the rack, the hand, the dump), the ghost's look, and
the keyboard cursor, which is `shared/board-cursor`'s.

## Details

```
shared/grid-and-drag/
 ├── useDragGesture.ts   useDragGesture · cellAtPoint · DRAGGING_CLASS
 │    └── dragging.css   the body rule while a tile is carried
 └── dragGhost.module.css  .ghost, composed with each game's own
bananagrams/hooks/usePlayerBoard.ts   runs the hook; BoardArena renders drag and hover, HandCard drag
bananagrams/components/PlayerBoard.tsx  renders the ghost
scrabble/components/BoardCol.tsx       runs the hook and renders the ghost; Board and Rack forward pointer-downs
```

- **The grid contract.** A cell is an element carrying `data-cell`, with its
  column and row in `data-x` and `data-y` (x is the column, per
  [docs/code-conventions.md → Grid coordinates](../../../docs/code-conventions.md#grid-coordinates)).
  `cellAtPoint` reads it, both for `hover` and for a game's `onDrop` asking
  where a drop landed. Anything else a drop can land on is the game's own
  `data-zone`, read with `elementFromPoint` in the game.
- **Tap or drag.** A press becomes a drag once it travels more than 4 px and
  has a letter to carry. A press with no letter only ever taps: an empty cell,
  a tile the game won't let move (scrabble's committed tiles), or a finger.
- **Only the primary button** arms a press, and `start` prevents the default,
  so a press never begins a text selection.
- **A canceled pointer** (`pointercancel`, which comes with no `pointerup`)
  ends a drag with neither a drop nor a tap, and clears the ghost and the body
  class.
- **The options are read fresh.** The window listeners bind once and read the
  latest options through a ref, so a game may pass new closures every render.
  bananagrams relies on it: whether a dump is allowed reads the current bunch.
- **`DRAGGING_CLASS`** is on the body for the length of a drag. `dragging.css`
  turns off text selection and shows the closed hand over the body and
  everything in it. The `*` is needed because every cell and tile sets a
  cursor of its own, and a cursor on the body alone shows only where nothing
  does.
- **The ghost.** `dragGhost.module.css` holds what every ghost shares: fixed
  to the viewport and centered on the pointer, tilted, a centered bold letter,
  deaf to the pointer so it never hides the drop target, and on `--z-ghost`.
  The game's rule adds the look of the tile it lifted. A ghost renders outside
  the board root, because a board is a stacking context and a ghost inside it
  could not follow the pointer onto the rack or hand.
- **Each pointer move re-renders the hook's owner**, since `drag` and `hover`
  are state. Nothing has been slow enough to measure.
