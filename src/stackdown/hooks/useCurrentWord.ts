// cs-unmet

import { useCallback, useState } from 'react'

/**
 * The word this player is building, tile by tile — private to them in both
 * modes: selections are never broadcast, so teammates try words independently
 * rather than taking turns on one shared word. What's shared is the result,
 * when it reaches the server.
 *
 * Two things are read off my stack as the blob has it (`onBoardIds`) rather
 * than kept in step by hand:
 *
 *   - **A word a teammate's clear has taken a tile from is empty.** Their
 *     accepted word may claim a tile I was still building with — I can't see
 *     their picks — and a word with a tile no longer on the board can't be
 *     played.
 *   - **An accepted word's tiles stay off the board** (`pendingRemoved`) from
 *     the moment the server says "accepted" until the blob that has them
 *     cleared arrives, so they don't blink back on in between. A held tile
 *     drops out of the hold as soon as the blob has it gone.
 *
 * `appendTile` returns the resulting word, or null when the click is a no-op
 * (the word is full, or the tile is already in it).
 */
export function useCurrentWord(onBoardIds: ReadonlySet<string>): {
  // The word's tiles, in pick order.
  tileIds: string[]
  pendingRemoved: string[]
  appendTile: (tileId: string) => string[] | null
  retractTo: (index: number) => void
  clearWord: () => void
  commitWord: (tileIds: string[]) => void
} {
  const [picked, setPicked] = useState<string[]>([])
  const [held, setHeld] = useState<string[]>([])

  /** The word as it stands on the board now: empty once any tile has left it. */
  const wordOn = useCallback(
    (ids: string[]) => (ids.every((id) => onBoardIds.has(id)) ? ids : []),
    [onBoardIds],
  )
  const word = wordOn(picked)
  const pendingRemoved = held.filter((id) => onBoardIds.has(id))

  // Pick a tile up onto the end of the word.
  const appendTile = useCallback(
    (tileId: string): string[] | null => {
      if (word.length >= 5 || word.includes(tileId)) return null
      setPicked((prev) => {
        const now = wordOn(prev)
        return now.length >= 5 || now.includes(tileId) ? now : [...now, tileId]
      })
      return [...word, tileId]
    },
    [word, wordOn],
  )

  // Return a slot's tile AND every tile after it: the word is an order, so
  // one can't come out of the middle and leave the rest standing.
  const retractTo = useCallback(
    (index: number) => setPicked((prev) => wordOn(prev).slice(0, index)),
    [wordOn],
  )

  // Empty the word, its tiles RETURNED to the board.
  const clearWord = useCallback(() => setPicked([]), [])

  // An ACCEPTED word: empty it, but hold its tiles off the board until the
  // blob has them gone.
  const commitWord = useCallback(
    (tileIds: string[]) => {
      setHeld((prev) => [...prev.filter((id) => onBoardIds.has(id)), ...tileIds])
      setPicked([])
    },
    [onBoardIds],
  )

  return { tileIds: word, pendingRemoved, appendTile, retractTo, clearWord, commitWord }
}
