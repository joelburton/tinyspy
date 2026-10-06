// cs-unmet

import { useMark } from '@/common/board-marks/useMark'
import { useChangeCause } from '@/common/board-marks/useChangeCause'
import {
  ATTENTION_FLASH_MS,
  WORD_ANSWER_MS,
} from '@/common/board-marks/feedbackTiming'
import type { GTile } from '../types'

/** No tiles — the resting value of both marks. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * What a claim looks like on the table, for everyone at it, the claimer too.
 *
 * A claim substitutes tiles IN PLACE, so nothing about the change announces
 * itself — over a real connection the table simply DIFFERS a moment later.
 * Two beats, each at the shared length for its kind of mark:
 *
 *   1. **The found set**, ringed in the won color, held on screen for
 *      `WORD_ANSWER_MS` — the answer's beat. A ring and not a fill: a fill
 *      would hide the colored symbols, which are the whole of a tile. The
 *      table shown is the one from before the claim, so the set can be seen
 *      where it was.
 *   2. **The tiles the claim dealt**, in the shared attention flash
 *      (`ATTENTION_FLASH_MS`) once the hold ends and the live table is shown.
 *      Only tiles NEW to the table: the three a short table moves from its end
 *      into the holes were already on it, and do not flash.
 *
 * Everyone holds for the same beat after the claim lands, which is what keeps
 * the claimer from seeing their replacements early — a real edge in compete.
 *
 * Only a CLAIM causes either: the cause is read off the log
 * (`useChangeCause`, the newest claim's id), so a table no claim changed is
 * simply shown. Quiet while a past turn is open — a claim landing behind the
 * viewer is not news on a table they are not looking at.
 *
 *   tiles         the table to draw: the one before the claim while the found
 *                 set is held, else the live one
 *   foundTileIds  the found set, ringed, while it is held
 *   newTileIds    the tiles the claim dealt, flashing
 */
export function useClaimMarks({
  liveTiles,
  lastClaim,
  quiet,
}: {
  liveTiles: GTile[]
  // The newest claim in the log, or null before the first.
  lastClaim: { id: number; tiles: GTile[] } | null
  quiet: boolean
}): {
  tiles: GTile[]
  foundTileIds: ReadonlySet<string>
  newTileIds: ReadonlySet<string>
} {
  const [held, holdFoundSet] = useMark<{
    before: GTile[];
    foundTileIds: ReadonlySet<string>
  }>(WORD_ANSWER_MS)
  const [dealt, flashDealt] = useMark<{ tileIds: ReadonlySet<string> }>(
    ATTENTION_FLASH_MS)

  const cause = useChangeCause(liveTiles,
    liveTiles.map((t) => t.id).join(','),
    lastClaim?.id ?? 0,
    true)
  if (cause?.byMove && !quiet && lastClaim !== null) {
    const beforeIds = new Set(cause.before.map((t) => t.id))
    const newTileIds = new Set(liveTiles.filter((t) => !beforeIds.has(t.id)).map(
      (t) => t.id))
    // Raised during render, so the held table lands in the same commit as the
    // change it holds back.
    holdFoundSet(
      {
        before: cause.before,
        foundTileIds: new Set(lastClaim.tiles.map((t) => t.id)),
      },
      { onEnd: () => flashDealt({ tileIds: newTileIds }) },
    )
  }

  return {
    tiles: held?.value.before ?? liveTiles,
    foundTileIds: held?.value.foundTileIds ?? NO_TILES,
    newTileIds: held === null ? (dealt?.value.tileIds ?? NO_TILES) : NO_TILES,
  }
}
