// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { replayTurn } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that turn's board (the starter, and that
 * turn's word below it). Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key, which the viewer consumes so it does not also type
 * on the board. The replay is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const {
    historyId,
    historyN,
    showHistory,
    exitHistory,
  } = useHistoryViewer<number>()
  const replayed =
    historyId === null
      ? null
      : replayTurn({ word: gd.puzzle.starter, colors: gd.puzzle.colors },
        gd.events, historyId, historyN)
  const author = replayed?.author ?? null
  const isSomeoneElsesBoard = gd.compete && author !== null && author !== gd.me

  return {
    isViewing: historyId !== null,
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    rows: replayed?.rows ?? null,
    litRowIdx: replayed?.litRowIdx ?? -1,
    label: replayed?.label ?? null,
    actor: isSomeoneElsesBoard ? author : undefined,
  }
}
