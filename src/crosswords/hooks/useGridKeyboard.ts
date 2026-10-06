// cs-unmet

import { useBindAction, type ActionState, type Action } from '@/common/actions/useBindAction'
import {
  advanceAfterFill,
  jumpClue,
  jumpWordEdge,
  moveCursor,
  retreatForBackspace,
  listWordCells,
} from '../lib/cursor'
import type { GArrowKey, GCursor, GGridKeysOptions, GPuzzleCell } from '../types'

/** What the caller gets back: the rebus action, which is also a menu row. The
 *  rest are keys with no control of their own — nothing on screen "is" the
 *  left arrow. */
type GridKeys = {
  actRebus: Action
}

/**
 * The crossword grid's keys, as the actions they are — the port of
 * crossplay's PuzzleView keyboard.
 *
 * A letter fills the cell under the cursor and moves on; ⌫ clears it and
 * retreats; Space steps forward and ⇧Space peeks at the fill; the arrows move
 * and ⇧ + an arrow jumps to the word's edge; Tab walks the clues; ⇧↵ opens the
 * rebus overlay; `#` jumps to a clue number; `|` and `_` cycle a cryptic
 * word-break mark on a cell's right / bottom edge.
 *
 * **Nothing here reads the window.** Each key is an action, so the gates
 * belong to the one dispatcher: a modified chord
 * never matches a pattern key, a keystroke aimed at chat never reaches an
 * action, and a floating panel with focus stops every one of them.
 *
 * Contrast `common/board-cursor/useBoardCursorKeys`, which is the same idea for
 * the tile-placement games: a cursor, letters and a submit. This one is
 * crosswords' own because the grid is the game — the two-step ⌫, the given cells
 * you slide off, the clue walk and the edge marks have no sibling.
 */
export function useGridKeyboard({
  enabled,
  isBoardInteractive,
  suspended,
  grid,
  cursor,
  pencil,
  setCursor,
  fillAt,
  isGiven,
  setCell,
  onRebus,
  onNumberJump,
  onPeek,
  peeking,
  clearPeek,
  onMark,
}: GGridKeysOptions): GridKeys {
  const ready = grid !== null && cursor !== null && enabled && !suspended
  /** Walking the grid: alive once the game has ended too, since reading back
   *  a solved puzzle is part of the post-game. */
  const nav = (): ActionState => (ready ? 'active' : 'disabled')
  /** Changing the grid: everything `nav` allows, minus the frozen board. */
  const write = (): ActionState => (ready && isBoardInteractive ? 'active' : 'disabled')

  /** Every body below is written against a loaded board. */
  const onBoard =
    (fn: (grid: GPuzzleCell[][], cursor: GCursor, key: string) => void) =>
    (key?: string) => {
      if (!grid || !cursor) return
      fn(grid, cursor, key ?? '')
    }

  // While a peek is up, ANY key puts it away — a watcher, so the same press
  // still does whatever else it does. Which is why ⇧Space below can simply
  // open one: the watcher has already cleared the last.
  useBindAction('act-drop-peek', {
    describe: () => (peeking ? 'active' : 'hidden'),
    run: clearPeek,
  })

  useBindAction('act-move-cursor', {
    describe: nav,
    run: onBoard((g, c, key) => setCursor(moveCursor(g, c, key as GArrowKey))),
  })

  useBindAction('act-jump-word-edge', {
    describe: nav,
    run: onBoard((g, c, key) => setCursor(jumpWordEdge(g, c, key as GArrowKey))),
  })

  // Space steps on with the same word-edge stop a filled letter takes.
  useBindAction('act-advance-cell', {
    describe: nav,
    run: onBoard((g, c) => setCursor(advanceAfterFill(g, c))),
  })

  // ⇧Space peeks. The cursor only ever sits on a fillable cell, so there is
  // nothing to guard against.
  useBindAction('act-peek-cell', {
    describe: nav,
    run: () => {
      if (cursor) onPeek(cursor.row, cursor.col)
    },
  })

  useBindAction('act-next-clue', {
    describe: nav,
    run: onBoard((g, c) => setCursor(jumpClue(g, c, 1))),
  })

  useBindAction('act-previous-clue', {
    describe: nav,
    run: onBoard((g, c) => setCursor(jumpClue(g, c, -1))),
  })

  useBindAction('act-jump-to-number', {
    describe: nav,
    run: onBoard(() => onNumberJump()),
  })

  // A letter fills and advances. A given cell is the author's and immutable, so
  // the cursor slides off it without writing.
  useBindAction('act-fill-cell', {
    describe: write,
    run: onBoard((g, c, key) => {
      if (!isGiven(c.row, c.col)) setCell(c.row, c.col, key.toUpperCase(), pencil)
      setCursor(advanceAfterFill(g, c))
    }),
  })

  // ⌫ in two steps: clear where you are, and only then retreat — so a solver
  // fixing the last letter doesn't lose the one before it as well.
  useBindAction('act-clear-cell', {
    describe: write,
    run: onBoard((g, c) => {
      if (isGiven(c.row, c.col)) {
        setCursor(retreatForBackspace(g, c))
        return
      }
      if (fillAt(c.row, c.col) != null) {
        setCell(c.row, c.col, null, false)
        return
      }
      // Empty already — retreat and clear the cell we land on.
      const prev = retreatForBackspace(g, c)
      if ((prev.row !== c.row || prev.col !== c.col) && !isGiven(prev.row, prev.col)) {
        setCell(prev.row, prev.col, null, false)
      }
      setCursor(prev)
    }),
  })

  // ⇧⌫ blanks the whole current word, then drops the cursor on its first
  // editable cell so the solver can re-type straight away.
  useBindAction('act-clear-word', {
    describe: write,
    run: onBoard((g, c) => {
      const word = listWordCells(g, c.row, c.col, c.dir)
      for (const p of word) {
        if (!isGiven(p.row, p.col) && fillAt(p.row, p.col) != null) {
          setCell(p.row, p.col, null, false)
        }
      }
      const first = word.find((p) => !isGiven(p.row, p.col))
      if (first) setCursor({ ...c, row: first.row, col: first.col })
    }),
  })

  const actRebus = useBindAction('act-rebus', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onRebus(c.row, c.col)
    }),
  })

  // Marks live on fillable cells only, and the cursor does not move — you are
  // annotating a boundary, not filling one.
  useBindAction('act-mark-right-edge', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onMark(c.row, c.col, 'right')
    }),
  })

  useBindAction('act-mark-bottom-edge', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onMark(c.row, c.col, 'bottom')
    }),
  })

  return { actRebus }
}
