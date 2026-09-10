// cs-unmet

import { useBoundAction, type ActionState, type BoundAction } from '@/common/actions/useBoundAction'
import {
  advanceAfterFill,
  jumpClue,
  jumpWordEdge,
  moveCursor,
  retreatForBackspace,
  wordCells,
  type ArrowKey,
  type Cursor,
} from '../lib/cursor'
import type { Cell, MarkSide } from '../lib/types'

/** The live play state the grid's keys act on. PlayArea passes it fresh every
 *  render — there is no ref, because a binding is asked what it does at the
 *  moment the key is pressed. */
export type GridKeysOptions = {
  /** May the board be worked at all? False while the game is paused or this
   *  player has conceded mid-race — every key below goes disabled, which also
   *  leaves the keystroke for whoever else wants it. */
  enabled: boolean
  /** The board is frozen (terminal) but still navigable: the movement keys work
   *  so the solver can walk the revealed grid, while anything that would WRITE
   *  (letters, ⌫, rebus, edge marks) is disabled. */
  readOnly: boolean
  /**
   * One of crosswords' OWN overlays has the keyboard — the rebus box or the
   * number-jump popup. Both are focused inputs, so the dispatcher's field gate
   * already stops the letters; what it does not stop is Tab, the one key an
   * action may claim from inside a field. Without this, tabbing out of the
   * number-jump popup would walk the clue underneath it.
   */
  suspended: boolean
  /** Null until the puzzle loads; every key is disabled until then. */
  grid: Cell[][] | null
  cursor: Cursor | null
  pencil: boolean
  setCursor: (c: Cursor) => void
  /** Current fill at a cell (null if empty); ⌫'s two-step needs it. */
  fillAt: (row: number, col: number) => string | null
  isGiven: (row: number, col: number) => boolean
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => void
  /** Open the rebus (multi-char) overlay over a cell. */
  onRebus: (row: number, col: number) => void
  /** Open the jump-to-clue-number popup. */
  onNumberJump: () => void
  /** Show a read-only zoom-peek of the current cell's fill. */
  onPeek: (row: number, col: number) => void
  /** Put the peek away — every other key here drops it, so it can't linger over
   *  a cursor that has moved on. */
  clearPeek: () => void
  /** Cycle the cryptic edge mark on one side of a cell. The consumer reads the
   *  current mark and advances it. */
  onMark: (row: number, col: number, side: MarkSide) => void
}

/** What the caller gets back: the rebus binding, which is also a menu row. The
 *  other twelve are keys with no control of their own — nothing on screen "is"
 *  the left arrow. */
export type GridKeys = {
  actRebus: BoundAction
}

/**
 * The crossword grid's keys, as the thirteen actions they are — the port of
 * crossplay's PuzzleView keyboard.
 *
 * A letter fills the cell under the cursor and moves on; ⌫ clears it and
 * retreats; Space steps forward and ⇧Space peeks at the fill; the arrows move
 * and ⇧ + an arrow jumps to the word's edge; Tab walks the clues; ⇧↵ opens the
 * rebus overlay; `#` jumps to a clue number; `|` and `_` cycle a cryptic
 * word-break mark on a cell's right / bottom edge.
 *
 * **Nothing here reads the window.** Each key is a bound action, so the gates
 * this hook used to spell out belong to the one dispatcher: a modified chord
 * never matches a pattern key, a keystroke aimed at chat never reaches an
 * action, and a floating panel with focus stops every one of them.
 *
 * Contrast `shared/board-cursor/useBoardCursorKeys`, which is the same idea for
 * the tile-placement games: a cursor, letters and a commit. This one is
 * crosswords' own because the grid is the game — the two-step ⌫, the given cells
 * you slide off, the clue walk and the edge marks have no sibling.
 */
export function useGridKeyboard({
  enabled,
  readOnly,
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
  clearPeek,
  onMark,
}: GridKeysOptions): GridKeys {
  const ready = grid !== null && cursor !== null && enabled && !suspended
  /** Walking the grid: alive at terminal too, since reading back a solved
   *  puzzle is part of the post-game. */
  const nav = (): ActionState => (ready ? 'active' : 'disabled')
  /** Changing the grid: everything `nav` allows, minus the frozen board. */
  const write = (): ActionState => (ready && !readOnly ? 'active' : 'disabled')

  /** Every body below is written against a loaded board, and every one of them
   *  drops the peek first — the zoom box describes the cell you were on. */
  const onBoard =
    (fn: (grid: Cell[][], cursor: Cursor, key: string) => void) =>
    (key?: string) => {
      if (!grid || !cursor) return
      clearPeek()
      fn(grid, cursor, key ?? '')
    }

  useBoundAction('act-move-cursor', {
    describe: nav,
    run: onBoard((g, c, key) => setCursor(moveCursor(g, c, key as ArrowKey))),
  })

  useBoundAction('act-jump-word-edge', {
    describe: nav,
    run: onBoard((g, c, key) => setCursor(jumpWordEdge(g, c, key as ArrowKey))),
  })

  // Space steps on with the same word-edge stop a filled letter takes.
  useBoundAction('act-advance-cell', {
    describe: nav,
    run: onBoard((g, c) => setCursor(advanceAfterFill(g, c))),
  })

  // ⇧Space peeks, and is the one key that does NOT clear the peek — it is the
  // one that opens it. The cursor only ever sits on a fillable cell, so there
  // is nothing to guard against.
  useBoundAction('act-peek-cell', {
    describe: nav,
    run: () => {
      if (cursor) onPeek(cursor.row, cursor.col)
    },
  })

  useBoundAction('act-next-clue', {
    describe: nav,
    run: onBoard((g, c) => setCursor(jumpClue(g, c, 1))),
  })

  useBoundAction('act-previous-clue', {
    describe: nav,
    run: onBoard((g, c) => setCursor(jumpClue(g, c, -1))),
  })

  useBoundAction('act-jump-to-number', {
    describe: nav,
    run: onBoard(() => onNumberJump()),
  })

  // A letter fills and advances. A given cell is the author's and immutable, so
  // the cursor slides off it without writing.
  useBoundAction('act-fill-cell', {
    describe: write,
    run: onBoard((g, c, key) => {
      if (!isGiven(c.row, c.col)) setCell(c.row, c.col, key.toUpperCase(), pencil)
      setCursor(advanceAfterFill(g, c))
    }),
  })

  // ⌫ in two steps: clear where you are, and only then retreat — so a solver
  // fixing the last letter doesn't lose the one before it as well.
  useBoundAction('act-clear-cell', {
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
  useBoundAction('act-clear-word', {
    describe: write,
    run: onBoard((g, c) => {
      const word = wordCells(g, c.row, c.col, c.dir)
      for (const p of word) {
        if (!isGiven(p.row, p.col) && fillAt(p.row, p.col) != null) {
          setCell(p.row, p.col, null, false)
        }
      }
      const first = word.find((p) => !isGiven(p.row, p.col))
      if (first) setCursor({ ...c, row: first.row, col: first.col })
    }),
  })

  const actRebus = useBoundAction('act-rebus', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onRebus(c.row, c.col)
    }),
  })

  // Marks live on fillable cells only, and the cursor does not move — you are
  // annotating a boundary, not filling one.
  useBoundAction('act-mark-right-edge', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onMark(c.row, c.col, 'right')
    }),
  })

  useBoundAction('act-mark-bottom-edge', {
    describe: write,
    run: onBoard((_g, c) => {
      if (!isGiven(c.row, c.col)) onMark(c.row, c.col, 'bottom')
    }),
  })

  return { actRebus }
}
