// cs-unmet

import { useEffect } from 'react'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useMark } from '@/common/board-marks/useMark'
import {
  ATTENTION_FADE_MS,
  VERDICT_SHAKE_MS,
} from '@/common/board-marks/feedbackTiming'
import type { GTile } from '../types'

/** Empty id set — the resting value of the head-shake, so a board with
 *  nothing shaking hands the same object down every render. */
const NO_IDS: ReadonlySet<string> = new Set()


/** What a tile shows, as one comparable string: its `as` and who it points at. */
function revealKey(t: GTile) {
  return t.revealed === null
    ? '-'
    : `${t.revealed.as}${[...t.revealed.arrows].map((p) => p.id).sort().join('+')}`
}

/**
 * The marks on the tiles a guess just turned over: the attention flash on each,
 * then a head-shake on the ones that came back a bystander or the assassin.
 *
 * **The flash** — mine included: the answer arrives in the tile I am watching,
 * and my partner's lands anywhere. Gated on the CAUSE (`moveCount`, the
 * recorded guesses) rather than on the board differing, so the history viewer
 * and my partner's key being shown never flash. Quiet while a
 * past turn is open. See `useMoveAttention`.
 *
 * **The shake** waits for the flash to finish rather than riding it: it is a
 * remark about the tile's own color, and that color is under the flash until
 * it is done. An agent never shakes.
 *
 * Both marks are HELD across renders, and a blob rebuilds every tile in
 * between, so what is held is tile IDS; the sets handed back are the live
 * tiles those ids name. The wait is keyed on the ids as a string: `tiles` is a
 * fresh array every render, so an effect that depended on it would cancel its
 * own timer whenever anything re-rendered.
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
  const flashingIds = useMoveAttention({
    content: tiles,
    contentKey: tiles.map(revealKey).join(','),
    moveCount,
    quiet: isViewingHistory,
    changed: (before, now) =>
      new Set(now.filter((t, i) => revealKey(t) !==
        revealKey(before[i] ?? t)).map((t) => t.id)),
  })

  const [shakeMark, shakeWrongTiles] = useMark<{ ids: ReadonlySet<string> }>(
    VERDICT_SHAKE_MS)
  const wrongIdsKey = tiles
    .filter((t) => flashingIds.has(t.id) && t.revealed?.as !== 'G')
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

  // The live tiles the held ids name.
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  const tilesOf = (ids: ReadonlySet<string>): ReadonlySet<GTile> =>
    new Set([...ids].flatMap((id) => tileById.get(id) ?? []))
  return {
    flashingTiles: tilesOf(flashingIds),
    shakingTiles: tilesOf(shakeMark?.value.ids ?? NO_IDS),
  }
}
