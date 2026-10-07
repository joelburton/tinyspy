// cs-unmet

import { useMemo } from 'react'
import { makeEndingMessage } from '@/common/ending/endingLabel'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { makeEndingLabel } from '../lib/endingLabel'
import type { GGameData } from '../types'

/**
 * My ending's message — the pill under the board and the info column's line —
 * from my ending label, or null while I still play. One message for both
 * endings: the game's once it has ended, mine while I have ended and the
 * others play on; `endedBy` says which, so the pill takes the right kind.
 *
 * It keeps its identity for as long as the label's words do, which is what
 * lets the effect that shows it show it once. The memo keys on those strings,
 * not on `gd.me`, which is rebuilt on every reload.
 */
export function useGetEndingMessage(gd: GGameData): {
  endingMessage: EndingMessage | null
  endedBy: 'game' | 'player' | null
} {
  const myEndingLabel = makeEndingLabel(
    gd.me, {
      mode: gd.mode,
      ended: gd.ended,
      reason: gd.ending?.reason ?? null,
    })
  const labelType = myEndingLabel?.labelType ?? null
  const word = myEndingLabel?.word ?? null
  const long = myEndingLabel?.long ?? null
  const pill = myEndingLabel?.pill ?? null
  const outcome = myEndingLabel?.outcome ?? null
  const endedBy = myEndingLabel?.endedBy ?? null
  return useMemo(
    () => ({
      endingMessage:
        labelType === null
          ? null
          : makeEndingMessage(
            {
              labelType,
              word: word!,
              long: long!,
              pill: pill!,
              outcome: outcome!,
              endedBy: endedBy!,
            },
            gd.mode,
          ),
      endedBy,
    }),
    [labelType, word, long, pill, outcome, endedBy, gd.mode],
  )
}
