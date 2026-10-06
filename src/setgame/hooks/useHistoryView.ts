// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeHistorySnapshot } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to see the table as it stood just after that turn.
 * Built on the shared `useHistoryViewer`, whose exits need no wiring: any click
 * that is not another `#N`, and any key.
 *
 * The table is one shared board in both modes, so any row opens, whoever
 * played it; the snapshot is the row's own `boardAfter` (`lib/history.ts`).
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const {
    historyId,
    historyN,
    showHistory,
    exitHistory,
  } = useHistoryViewer<number>()
  const snapshot = historyId === null ? null : makeHistorySnapshot(gd.events,
    historyId,
    historyN)

  return {
    isViewing: snapshot !== null,
    viewedEventId: snapshot === null ? null : historyId,
    show: showHistory,
    exit: exitHistory,
    tiles: snapshot?.tiles ?? null,
    litTiles: snapshot?.litTiles ?? [],
    label: snapshot?.label ?? null,
  }
}
