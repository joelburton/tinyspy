// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { historyChainAt, historyLabelAt } from '../lib/history'
import type { GGameData, GHistoryView } from '../types'

/**
 * Click an event-log `#N` to replay that move's chain on the board. Built on
 * the shared `useHistoryViewer`, whose exits need no wiring: any click that is
 * not another `#N`, and any key.
 *
 * The chain replayed is the row's own author's: in coop the one shared chain,
 * in compete that racer's — mid-race always mine, since a rival's rows are
 * withheld (`useGame`'s seat rule), and at the end anyone's. The replay is
 * `lib/history.ts`'s fold over that author's rows.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()
  const viewedEvent = historyId === null
    ? undefined
    : gd.events.find((e) => e.id === historyId)
  const author = viewedEvent?.by
  // One player's moves at a time in compete: each racer builds their own chain.
  const authorsEvents = gd.compete && author !== undefined
    ? gd.events.filter((e) => e.by === author)
    : gd.events
  const isViewing = viewedEvent !== undefined

  return {
    isViewing,
    viewedEventId: isViewing ? historyId : null,
    show: showHistory,
    exit: exitHistory,
    words: isViewing ? historyChainAt(authorsEvents, historyId!) : null,
    label: isViewing ? historyLabelAt(authorsEvents, historyId!) : null,
    actor: gd.compete && author !== gd.me ? author : undefined,
  }
}
