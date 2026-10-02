// cs-unmet

import { useEffect } from 'react'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import type { TileResults, TileWord } from '../lib/tileResults'

/** Empty word set — the resting value of the head-shake, so a board with
 *  nothing shaking hands the same object down every render. */
const NO_WORDS: ReadonlySet<TileWord> = new Set()

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
 * correct guess never shakes. The wait is keyed on the WORDS rather than on
 * the set that holds them: `results` is a fresh Map every render, so an effect
 * that depended on it would cancel its own timer whenever anything re-rendered.
 */
export function useDecidedTileMarks({
  results,
  moveCount,
  isViewingHistory,
}: {
  results: TileResults
  moveCount: number
  isViewingHistory: boolean
}): {
  flashing: ReadonlySet<TileWord>
  shaking: ReadonlySet<TileWord>
} {
  const flashingTiles = useMoveAttention({
    content: results,
    contentKey: [...results.keys()].sort().join(','),
    moveCount,
    quiet: isViewingHistory,
    changed: (before, now) =>
      new Set([...now.keys()].filter((w) => !before.has(w))),
  })

  const [shakeMark, shakeWrongWords] =
    useMark<{ words: ReadonlySet<TileWord> }>(VERDICT_SHAKE_MS)
  const wrongWordsKey = [...flashingTiles]
    .filter((w) => results.get(w) === false)
    .sort()
    .join(',')
  useEffect(function shakeAfterFlash() {
    if (wrongWordsKey === '') return
    const timer = setTimeout(
      () => shakeWrongWords({ words: new Set(wrongWordsKey.split(',')) }),
      ATTENTION_FADE_MS,
    )
    return () => clearTimeout(timer)
  }, [wrongWordsKey, shakeWrongWords])

  return {
    flashing: flashingTiles,
    shaking: shakeMark?.value.words ?? NO_WORDS,
  }
}
