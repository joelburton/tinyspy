// cs-unmet

import { useMemo } from 'react'
import { makeEndingMessage, type EndingLabel } from '@/common/ending/endingLabel'
import type { EndingMessage } from '@/common/ending/endingMessage'
import type { GGameData } from '../types'

/**
 * My ending's message — the pill under the board and the info column's line —
 * from my ending label (`gd.me.endingLabel`), or null while I still play. One
 * message for both endings: the game's once it has ended, mine while I have
 * ended and the others play on; `endedBy` says which, so the pill takes the
 * right kind.
 *
 * It keeps its identity for as long as the label's words do, which is what
 * lets the effect that shows it show it once. `gd.me` is rebuilt on every
 * reload, so the memo keys on the label as a string, not on the object.
 */
export function useGetEndingMessage(gd: GGameData): {
  endingMessage: EndingMessage | null
  endedBy: 'game' | 'player' | null
} {
  const labelKey = JSON.stringify(gd.me.endingLabel)
  return useMemo(() => {
    const myEndingLabel = JSON.parse(labelKey) as EndingLabel | null
    return {
      endingMessage: myEndingLabel && makeEndingMessage(myEndingLabel, gd.mode),
      endedBy: myEndingLabel?.endedBy ?? null,
    }
  }, [labelKey, gd.mode])
}
