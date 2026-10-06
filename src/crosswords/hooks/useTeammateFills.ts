// cs-unmet

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GBoard, GPlayer } from '../types'

/** How long a teammate's fill flashes in their color (crossplay's). */
const FLASH_MS = 5000

/** One flashing cell: the writer's color, and the board that started it. */
type Flash = { color: string; batch: number }

/**
 * The cells a teammate just filled, each with their color, so the grid can
 * flash them — found by comparing each board the blob brings with the one
 * before it. A cell flashes when its fill changed to a letter and its writer
 * is not me: a teammate's keystroke or reveal. My own writes never flash, a
 * Restart blanks cells and blanks do not flash, a letter typed over the same
 * letter changes nothing, and in compete no cell has a writer.
 *
 * The flash is read off the same board as the letter, so the two cannot
 * disagree.
 *
 * @param board  the board as the blob has it (`gd.me.board`), never with my
 *               pending writes over it
 * @param me     who I am, whose fills do not flash
 */
export function useTeammateFills(board: GBoard, me: GPlayer): Map<string, string> {
  const [seenBoard, setSeenBoard] = useState(board)
  const [flashes, setFlashes] = useState<Map<string, Flash>>(() => new Map())
  // Each board that started flashes is a batch; its cells go out together.
  const [batch, setBatch] = useState(0)

  // A new board: compare it with the last one seen, during render (React's
  // "store information from previous renders"), so the flash is drawn with the
  // letter in one paint.
  if (board !== seenBoard) {
    const filled = board.cells.filter((cell) => {
      const writer = cell.writer
      return cell.fill !== null
        && cell.fill !== seenBoard.cellsById[cell.id]?.fill
        && writer !== null
        && writer.id !== me.id
    })
    setSeenBoard(board)
    if (filled.length > 0) {
      // A cell filled again joins the new batch, so its flash starts over.
      const next = new Map(flashes)
      for (const cell of filled) next.set(cell.id, { color: cell.writer!.color, batch: batch + 1 })
      setFlashes(next)
      setBatch(batch + 1)
    }
  }

  // A batch's cells stop flashing together, unless a later batch took them.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (batch === 0) return
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setFlashes((prev) => new Map([...prev].filter(([, f]) => f.batch !== batch)))
    }, FLASH_MS)
    timers.current.add(timer)
  }, [batch])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) clearTimeout(t)
    }
  }, [])

  return useMemo(() => new Map([...flashes].map(([id, f]) => [id, f.color])), [flashes])
}
