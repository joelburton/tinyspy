// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeHistorySnapshot } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to see that round's table. Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key. The snapshot is the round itself
 * (`lib/history.ts`), keyed by its number.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const snapshot = historyId === null ? null : makeHistorySnapshot(gd.rounds, historyId, gd.nRounds)

  return {
    isViewing: snapshot !== null,
    viewedNum: snapshot === null ? null : historyId,
    show: showHistory,
    exit: exitHistory,
    round: snapshot?.round ?? null,
    label: snapshot?.label ?? null,
  }
}
