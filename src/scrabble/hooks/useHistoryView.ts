// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeCellId } from '../lib/board'
import { makeEventText } from '../lib/eventText'
import { historyBoard } from '../lib/play'
import type { GGameData, GHistoryTarget, GHistoryView, GSharedMovePayload } from '../types'

/**
 * What the board viewer has open, and the board it draws. Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key.
 *
 * It shows two things on one chrome: a past turn — the log's `#N` click,
 * drawn as the board just after it — and, in coop, a teammate's shown move,
 * drawn as their staged tiles over my live board. The board is one shared
 * board in both modes, so any row opens, whoever played it; a past board is
 * the words laid down in order (`historyBoard`), since no row keeps one.
 */
export function useHistoryView(gd: GGameData): GHistoryView {
  const {
    historyId: target,
    historyN,
    historyIdRef: targetRef,
    showHistory,
    exitHistory,
  } = useHistoryViewer<GHistoryTarget>()

  // A turn's id is a log row's, and the log keeps every row.
  const viewedEvent = target?.kind === 'turn'
    ? gd.events.find((e) => e.id === target.id)!
    : null
  // The sharer is a seated player: a shown move comes from the table.
  const peerMove = target?.kind === 'peerPreview'
    ? {
      sharer: gd.playersById[target.sharerId]!,
      placements: target.placements,
      words: target.words,
      score: target.score,
    }
    : null

  /** The banner's words for the viewed turn: "#1 moth: +10 APPLE", "#5 moth
   *  passed". `n` is the `#N` the log printed beside the row. */
  function makeLabel(): string | null {
    if (viewedEvent === null) return null
    const prefix = `${historyN === null ? '' : `#${historyN} `}${viewedEvent.by.username}`
    const text = makeEventText(viewedEvent)
    return viewedEvent.kind === 'word' ? `${prefix}: ${text}` : `${prefix} ${text}`
  }

  function makeLitCellIds(): string[] {
    if (peerMove !== null) return peerMove.placements.map((p) => makeCellId(p.x, p.y))
    if (viewedEvent?.placements) return viewedEvent.placements.map((t) => t.id)
    return []
  }

  /** Open a teammate's shown move — unless a real move has landed on my board
   *  since they staged it, when it no longer fits. No `#N`: it is no log row. */
  function showPeerMove(payload: GSharedMovePayload) {
    if (payload.baseVersion !== gd.version) return
    showHistory({
      kind: 'peerPreview',
      placements: payload.placements,
      sharerId: payload.sharerId,
      words: payload.words,
      score: payload.score,
    }, null)
  }

  return {
    isViewing: target !== null,
    targetRef,
    viewedEventId: viewedEvent === null ? null : viewedEvent.id,
    peerMove,
    show: (id, n) => showHistory({ kind: 'turn', id }, n),
    showPeerMove,
    exit: exitHistory,
    cells: viewedEvent === null ? null : historyBoard(gd.events, viewedEvent.id),
    litCellIds: makeLitCellIds(),
    label: makeLabel(),
  }
}
