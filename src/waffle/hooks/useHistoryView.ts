// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { replaySwap } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that swap's board (the deal with its
 * author's swaps up to it applied, its two tiles ringed history-blue). Built
 * on the shared `useHistoryViewer`, whose exits need no wiring: any click that
 * is not another `#N`, and any key. The replay is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, historyN, showHistory, exitHistory } = useHistoryViewer<number>()
  const replayed =
    historyId === null
      ? null
      : replaySwap(gd.puzzle.dealtTiles, gd.events, historyId, historyN, gd.compete)
  const isSomeoneElsesBoard = gd.compete && replayed !== null && replayed.author !== gd.me

  return {
    isViewing: replayed !== null,
    viewedEventId: replayed === null ? null : historyId,
    show: showHistory,
    exit: exitHistory,
    tiles: replayed?.tiles ?? null,
    litTileIds: replayed?.litTileIds ?? new Set(),
    label: replayed?.label ?? null,
    actor: isSomeoneElsesBoard ? replayed.author : undefined,
  }
}
