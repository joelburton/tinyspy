// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { replayTurn } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that turn's board (the tiles decided up to
 * that turn, with that turn's guessed tile ringed history-blue). Built on the
 * shared `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key, which the viewer consumes so it does not also play
 * on the board. The replay is `lib/history.ts`'s.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const replayed =
    historyId === null
      ? null
      : replayTurn(gd.events, gd.puzzle.words, historyId, gd.compete)
  const author = replayed?.author ?? null
  const isSomeoneElsesBoard = gd.compete && author !== null && author !== gd.me
  return {
    isViewing: historyId !== null,
    viewedEventId: historyId,
    show: showHistory,
    exit: exitHistory,
    tiles: replayed?.tiles ?? null,
    litWord: replayed?.litWord ?? null,
    label: replayed?.label ?? null,
    actor: isSomeoneElsesBoard ? author : undefined,
  }
}
