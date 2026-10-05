// cs-unmet

import { useCallback, useState } from 'react'

/**
 * The in-progress word's mutations — a small local reducer action set.
 * The word is **private to the player building it** in both modes:
 * selections are never broadcast, so teammates can try words
 * independently rather than taking turns on one shared word. What's
 * shared is the completed result — every submission (found word, bad
 * word, hint/word request) is a `stackdown.events` row, and an accepted
 * word's tiles leave the shared coop board.
 *
 *   - append  — a tile was picked up onto the end of the word.
 *   - retract — a tile in the word was clicked, returning it AND every
 *     tile after it to the board (slice to `index`).
 *   - clear   — the word was emptied, tiles RETURNED to the board (an
 *     invalid submit, or an abandoned word).
 *   - commit  — an ACCEPTED word: the word is emptied but its tiles
 *     STAY off the board. Carries the tile ids so they're held removed
 *     optimistically (`pendingRemoved`) until the blob that has them
 *     cleared arrives — without this the submitter's grid would briefly
 *     flash the tiles back on between the clear and the new blob.
 *     `clear` and `commit` differ only in this hold.
 */
type WordEvent =
  | { type: 'append'; tileId: number }
  | { type: 'retract'; index: number }
  | { type: 'clear' }
  | { type: 'commit'; tileIds: number[] }

/**
 * The word this player is building, tile by tile — the board column's live
 * state, which nothing else reads. `appendTile` returns the resulting word so
 * the caller can fire the submit when it reaches five letters.
 */
export function useCurrentWord(): {
  currentWord: number[]
  pendingRemoved: number[]
  appendTile: (tileId: number) => number[] | null
  retractTo: (index: number) => void
  clearWord: () => void
  commitWord: (tileIds: number[]) => void
} {
  const [currentWord, setCurrentWord] = useState<number[]>([])
  // Optimistic removed tiles: an accepted word's tiles are held here from the
  // instant the server says "accepted" until the blob with them cleared
  // arrives — so the tiles don't blink back onto the board during the
  // round-trip.
  const [pendingRemoved, setPendingRemoved] = useState<number[]>([])

  // Apply a word event to the local in-progress word. Idempotent (append
  // skips a tile already in the word, retract/clear are slice/empty,
  // commit's pendingRemoved is deduped into a Set downstream) — handy
  // since the PlayArea can re-fire on rapid clicks.
  const applyWordEvent = useCallback((event: WordEvent) => {
    if (event.type === 'commit') {
      setPendingRemoved((prev) => [...prev, ...event.tileIds])
      setCurrentWord((prev) => (prev.length === 0 ? prev : []))
      return
    }
    setCurrentWord((prev) => {
      if (event.type === 'clear') return prev.length === 0 ? prev : []
      if (event.type === 'retract') {
        return event.index >= prev.length ? prev : prev.slice(0, event.index)
      }
      // append
      if (prev.includes(event.tileId) || prev.length >= 5) return prev
      return [...prev, event.tileId]
    })
  }, [])

  // Local tile click: pick the tile up onto the end of the word. Returns
  // the resulting word so the PlayArea can submit when it hits five.
  // Returns null when the word is already full or the tile's already in
  // it (the click is a no-op).
  const appendTile = useCallback(
    (tileId: number): number[] | null => {
      if (currentWord.length >= 5 || currentWord.includes(tileId)) return null
      applyWordEvent({ type: 'append', tileId })
      return [...currentWord, tileId]
    },
    [applyWordEvent, currentWord],
  )

  // Local click on a tile already in the word: return it AND every tile
  // after it to the board (the word is an order, so you can't pull one
  // from the middle without invalidating the rest).
  const retractTo = useCallback(
    (index: number) => applyWordEvent({ type: 'retract', index }),
    [applyWordEvent],
  )

  const clearWord = useCallback(
    () => applyWordEvent({ type: 'clear' }),
    [applyWordEvent],
  )

  // Commit an ACCEPTED word: empty it and hold its tiles removed
  // optimistically. (Teammates never had these tiles selected, so they just
  // see them leave the board with the next blob — no flash to guard against.)
  const commitWord = useCallback(
    (tileIds: number[]) => applyWordEvent({ type: 'commit', tileIds }),
    [applyWordEvent],
  )

  return { currentWord, pendingRemoved, appendTile, retractTo, clearWord, commitWord }
}
