// cs-unmet

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
import { moveCursor, planBackspace, type GridCursor } from '@/common/board-cursor/gridCursor'
import { useBoardCursorKeys } from '@/common/board-cursor/useBoardCursorKeys'
import { DUMP_COUNT, GRID, clamp, deriveHand, idx, setChar, tilesExtent } from '../lib/board'
import type { GEditingBoard, GEditingBoardInput } from '../reactTypes'
import type { GCell } from '../types'
import { useBoardZoom } from './useBoardZoom'
import { useBoardAutosave } from './useBoardAutosave'
import { useBoardDrag } from './useBoardDrag'
import { useHandOrder } from './useHandOrder'

/** The board cursor is always present during play (you can type the moment
 *  the board loads). It starts dead center — Bananagrams builds outward from
 *  the middle — and goes back there after a zoom-to-fit. */
const CENTER_CURSOR: GridCursor = {
  x: Math.floor(GRID / 2),
  y: Math.floor(GRID / 2),
  dir: 'h',
}

/** One empty set for "no red cells": a fresh `new Set()` each render would be
 *  a new reference and defeat memoization downstream. */
const NO_CELLS: ReadonlySet<number> = new Set()

/** How long the "you don't hold that tile" box shows. */
const HAND_ERROR_MS = 180

/**
 * The **editing board**: my board as it is on screen, the hand derived from it,
 * and everything that changes them — the drag, the keyboard cursor, Peel and
 * Check words — with the zoom and the autosave beside them. `<EditingBoard>`
 * holds it, and the two views (`<Board>`, `<HandBox>`) draw from it.
 *
 * One editing board spans both columns, because the hand's tiles drop onto the
 * board and the dump slot takes a tile dragged off it
 * (docs/games/bananagrams.md).
 *
 * The board is seeded once from the server's copy and owned here after; the
 * hand is never stored — it is the tiles I hold less the letters on the board
 * (`deriveHand`), so every move writes the board alone and the hand follows. A
 * peel or a dump grows my tiles upstream, and the hand grows the same way.
 */
export function useEditingBoard({
  gameId,
  initialBoard,
  tiles,
  isBoardInteractive,
  onPeel,
  onCheckBoard,
  onDump,
  nBunchTiles,
  nBagTiles,
  reportBoardRef,
}: GEditingBoardInput): GEditingBoard {
  // ─── The board and the hand ────────────────────────────
  const [board, setBoard] = useState(initialBoard)
  const [cursor, setCursor] = useState<GridCursor>(CENTER_CURSOR)
  const derivedHand = deriveHand(tiles, board)
  const { displayedHand, actShuffle } = useHandOrder(derivedHand)

  // Refs mirror state for the handlers registered once (the pointer's and the
  // keyboard's), synced in an effect and never written during render.
  const boardRef = useRef(board)
  const tilesRef = useRef(tiles)
  const cursorRef = useRef(cursor)
  const isBoardInteractiveRef = useRef(isBoardInteractive)
  useEffect(function syncRefs() {
    boardRef.current = board
    tilesRef.current = tiles
    cursorRef.current = cursor
    isBoardInteractiveRef.current = isBoardInteractive
    reportBoardRef.current = board
  }, [board, tiles, cursor, isBoardInteractive, reportBoardRef])

  const { save } = useBoardAutosave({ gameId, board, boardRef })
  const zoom = useBoardZoom({ boardRef, cursor })

  // The cells a blocked peel or a check painted red, with the board they were
  // judged on: an edit changes `board`, they stop matching, and they clear
  // themselves with no effect.
  const [invalid, setInvalid] = useState<{
    board: string
    cells: ReadonlySet<number>
  } | null>(null)
  const invalidCells = invalid && invalid.board === board ? invalid.cells : NO_CELLS

  // ─── The moves: every one writes the board; the hand follows ───
  const handToBoard = useCallback((letter: string, x: number, y: number) => {
    setBoard((b) => setChar(b, idx(x, y), letter))
  }, [])
  const boardToBoard = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    setBoard((b) => {
      const letter = b[idx(x1, y1)]
      return setChar(setChar(b, idx(x1, y1), '.'), idx(x2, y2), letter)
    })
  }, [])
  const boardToHand = useCallback((x: number, y: number) => {
    if (boardRef.current[idx(x, y)] === '.') return
    setBoard((b) => setChar(b, idx(x, y), '.'))
  }, [])

  // A dump draws from the bunch, topping up from the bag when it is short.
  const canDump = nBunchTiles + nBagTiles >= DUMP_COUNT

  const putCursorAt = useCallback(
    (cell: GCell) => setCursor({ x: cell.x, y: cell.y, dir: 'h' }),
    [],
  )
  const { drag, hover, dumpHot, onCellPointerDown, onHandPointerDown } = useBoardDrag({
    boardRef,
    isBoardInteractiveRef,
    canDump,
    handToBoard,
    boardToBoard,
    boardToHand,
    onDump,
    onTapCell: putCursorAt,
  })

  // ─── The keyboard ──────────────────────────────────────
  // A brief red box around the hand: "you don't hold that tile". The nonce
  // remounts the box, so a repeated miss replays the flash.
  const [errFlash, setErrFlash] = useState(false)
  const [errNonce, setErrNonce] = useState(0)
  const flashHandError = useCallback(() => {
    setErrFlash(true)
    setErrNonce((n) => n + 1)
  }, [])
  useEffect(function endHandErrorFlash() {
    if (!errFlash) return
    const id = setTimeout(() => setErrFlash(false), HAND_ERROR_MS)
    return () => clearTimeout(id)
  }, [errFlash, errNonce])

  const advance = useCallback((cur: GridCursor) => {
    setCursor({
      x: clamp(cur.x + (cur.dir === 'h' ? 1 : 0)),
      y: clamp(cur.y + (cur.dir === 'v' ? 1 : 0)),
      dir: cur.dir,
    })
  }, [])

  // Peel: the board is saved first, so the server's "every tile placed" check
  // sees what the player sees. A blocked peel hands back its cells, painted
  // against the board they were judged on.
  async function peel() {
    if (!isBoardInteractive || deriveHand(tilesRef.current, boardRef.current).length !== 0) return
    await save()
    const outcome = await onPeel()
    if (outcome && outcome.invalidCells.length > 0) {
      setInvalid({ board: boardRef.current, cells: new Set(outcome.invalidCells) })
    }
  }

  // The shared 2-D cursor keyboard (common/board-cursor): arrows move, a letter
  // places a tile from the hand, Backspace returns one, and the submit is a
  // PEEL, whose action carries Enter and Space. Every cell is editable: typing
  // over a filled cell swaps its tile back to the hand.
  const { actSubmit: actPeel } = useBoardCursorKeys({
    enabled: isBoardInteractive,
    submit: 'act-peel',
    // The same answer grays the button and stops Enter firing a no-op.
    canSubmit: derivedHand.length === 0,
    onSubmit: () => void peel(),
    onArrow: (k) => setCursor(moveCursor(cursorRef.current, k, GRID - 1)),
    onBackspace: () => {
      const { remove, cursor } = planBackspace(
        cursorRef.current,
        GRID - 1,
        (x, y) => (boardRef.current[idx(x, y)] === '.' ? 'empty' : 'removable'),
      )
      if (remove) boardToHand(remove.x, remove.y)
      setCursor(cursor)
    },
    onLetter: (letter: string) => {
      const cur = cursorRef.current
      const i = idx(cur.x, cur.y)
      // A filled cell is cleared first, so its tile is back in the hand when
      // the hand is asked whether it holds the typed letter.
      const freed =
        boardRef.current[i] === '.' ? boardRef.current : setChar(boardRef.current, i, '.')
      if (!deriveHand(tilesRef.current, freed).includes(letter)) {
        flashHandError()
        return
      }
      handToBoard(letter, cur.x, cur.y)
      advance(cur)
    },
  })

  // ─── Check words, and the view control ─────────────────
  // The same legality test a winning peel runs, on demand, after saving the
  // board for the same reason. Its red cells land in the same place a blocked
  // peel's do, so they paint and clear alike.
  async function checkBoard() {
    await save()
    const outcome = await onCheckBoard()
    if (outcome) {
      setInvalid(outcome.invalidCells.length > 0
        ? { board: boardRef.current, cells: new Set(outcome.invalidCells) }
        : null)
    }
  }

  // Always offered while I can act, whatever `setup.word_check` says: that
  // option governs when the server ENFORCES words, not whether I may ask. An
  // inert board has nothing to ask about, so the button goes.
  const actCheckBoard = useBindAction('act-check-board', {
    describe: (asker) => {
      if (!isBoardInteractive) return asker === 'button' ? 'hidden' : 'disabled'
      return 'active'
    },
    run: checkBoard,
  })

  // Zoom to fit: the tiles move to the middle of the grid, the cursor goes
  // back to the center, and the zoom shows them with a margin. A view control,
  // so it stays live at every phase: a finished board is exactly the one you
  // want to see all of.
  function centerAndFit() {
    const ext = tilesExtent(boardRef.current)
    if (!ext) {
      zoom.showBoardCenter()
      return
    }
    const h = ext.maxY - ext.minY + 1
    const w = ext.maxX - ext.minX + 1
    const top = Math.floor((GRID - h) / 2)
    const left = Math.floor((GRID - w) / 2)
    const dy = top - ext.minY
    const dx = left - ext.minX
    setBoard((b) => {
      const moved = new Array<string>(GRID * GRID).fill('.')
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const ch = b[idx(x, y)]
          if (ch !== '.') moved[idx(x + dx, y + dy)] = ch
        }
      }
      return moved.join('')
    })
    setCursor(CENTER_CURSOR)
    zoom.fitBox({ left, top, w, h })
  }
  const actZoomFit = useBindAction('act-zoom-fit', {
    describe: () => 'active',
    run: centerAndFit,
  })

  return {
    scrollRef: zoom.scrollRef,
    board,
    cell: zoom.cell,
    minCell: zoom.minCell,
    cursor,
    hover,
    drag,
    invalidCells,
    onZoom: zoom.onZoom,
    onCellPointerDown,
    displayedHand,
    derivedHand,
    dumpHot,
    canDump,
    errFlash,
    errNonce,
    onHandPointerDown,
    actPeel,
    actShuffle,
    actCheckBoard,
    actZoomFit,
  }
}
