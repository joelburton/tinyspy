// cs-unmet

import { useEffect } from 'react'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import type { GTile } from '../types'

/** Empty id set — the resting value of the head-shake, so a board with
 *  nothing shaking hands the same object down every render. */
const NO_IDS: ReadonlySet<string> = new Set()

/**
 * The marks on the tiles that just got decided: the attention flash on each,
 * then a head-shake on the ones that came back wrong.
 *
 * **The flash.** psychicnum's coop board is SHARED, so a teammate's guess colors
 * a tile anywhere on it while you are reading somewhere else: change in place,
 * announcing nothing. It is gated on the CAUSE (`moveCount`, the recorded
 * guesses) rather than on the board differing, because the board also changes
 * when nothing was played: asking to see the solution turns every unfound
 * secret green at once. Quiet while a past turn is open: that board's guess is
 * already ringed, and a live guess landing behind the viewer is not something
 * to point at. A restart cannot reach here — it remounts the surface, so this
 * seeds fresh and says nothing. See `useMoveAttention`.
 *
 * **The shake** waits for the flash to finish rather than riding it: it is a
 * remark about the tile's own color, and that color is under the yellow until
 * the flash is done. The red is the half that survives reduced motion, and a
 * correct guess never shakes.
 *
 * Both marks are HELD across renders — the flash for its fade, the shake for
 * its beat — and a blob can rebuild every tile in between, so what is held is
 * tile IDS; the sets handed back are the live tiles those ids name, looked up
 * on the way out. The wait is keyed on the ids as a string rather than on the
 * array that holds them: `tiles` is a fresh array every render, so an effect
 * that depended on it would cancel its own timer whenever anything re-rendered.
 */
export function useDecidedTileMarks({
  tiles,
  moveCount,
  isViewingHistory,
}: {
  tiles: readonly GTile[]
  moveCount: number
  isViewingHistory: boolean
}): {
  flashingTiles: ReadonlySet<GTile>
  shakingTiles: ReadonlySet<GTile>
} {
  const decided = tiles.filter((t) => t.correct !== null)
  const flashingIds = useMoveAttention({
    content: decided,
    contentKey: decided.map((t) => t.id).sort().join(','),
    moveCount,
    quiet: isViewingHistory,
    changed: (before, now) => {
      const had = new Set(before.map((t) => t.id))
      return new Set(now.map((t) => t.id).filter((id) => !had.has(id)))
    },
  })

  const [shakeMark, shakeWrongTiles] = useMark<{ ids: ReadonlySet<string> }>(VERDICT_SHAKE_MS)
  const wrongIdsKey = decided
    .filter((t) => flashingIds.has(t.id) && t.correct === false)
    .map((t) => t.id)
    .sort()
    .join(',')
  useEffect(function shakeAfterFlash() {
    if (wrongIdsKey === '') return
    const timer = setTimeout(
      () => shakeWrongTiles({ ids: new Set(wrongIdsKey.split(',')) }),
      ATTENTION_FADE_MS,
    )
    return () => clearTimeout(timer)
  }, [wrongIdsKey, shakeWrongTiles])

  // The live tiles the held ids name; an id a new blob no longer has (a
  // Restart) names nothing and is dropped.
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  const tilesOf = (ids: ReadonlySet<string>): ReadonlySet<GTile> =>
    new Set([...ids].flatMap((id) => tileById.get(id) ?? []))
  return {
    flashingTiles: tilesOf(flashingIds),
    shakingTiles: tilesOf(shakeMark?.value.ids ?? NO_IDS),
  }
}
