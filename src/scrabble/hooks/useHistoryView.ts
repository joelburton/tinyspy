// cs-unmet

import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { makeCellId } from '../lib/board'
import { makeEventText } from '../lib/eventText'
import { findSpentSlots, historyBoard, tilesUsed } from '../lib/play'
import type {
  GGameData,
  GHistoryTarget,
  GHistoryView,
  GMovePreviewRaw,
} from '../types'

/**
 * What the board viewer has open, and the board it draws. Built on the shared
 * `useHistoryViewer`, whose exits need no wiring: any click that is not
 * another `#N`, and any key.
 *
 * It shows two things on one chrome: a past turn — the log's `#N` click,
 * drawn as the board just after it with the rack it was played from — and, in
 * coop, a teammate's preview, drawn as their staged tiles over my live board.
 * The board is one shared board in both modes, so any row opens, whoever
 * played it; a past board is the words laid down in order (`historyBoard`),
 * since no row keeps one. A row does keep its rack, which a rival's row
 * shows only once the race is over.
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
  const viewedEvent =
    target?.kind === 'turn'
      ? gd.events.find((e) => e.id === target.id)!
      : null
  // The one previewing is a seated player: a preview comes from the table.
  const preview = target?.kind === 'preview'
    ? {
      by: gd.playersById[target.byId]!,
      tiles: new Map(target.placements.map((p) => {
        const id = makeCellId(p.x, p.y)
        return [id, { id, letter: p.letter, blank: p.blank }]
      })),
      words: target.words,
      score: target.score,
    }
    : null

  /** The banner's words for the viewed turn: "#1 moth: +10 APPLE", "#5 moth
   *  passed". `n` is the `#N` the log printed beside the row. */
  function makeLabel(): string | null {
    if (viewedEvent === null) return null
    const prefix = `${historyN === null
      ? ''
      : `#${historyN} `}${viewedEvent.by.username}`
    const text = makeEventText(viewedEvent)
    return viewedEvent.kind === 'word'
      ? `${prefix}: ${text}`
      : `${prefix} ${text}`
  }

  /** The rack the viewed turn was played from, with the tiles that went to
   *  the board or back to the bag marked spent. */
  function makePastRack(): GHistoryView['rack'] {
    if (viewedEvent === null) return null
    // A rival's mid-race, or a row older than the racks: an empty rack.
    if (viewedEvent.rack === null) return { tiles: [], spentSlots: new Set() }
    const spent = viewedEvent.kind === 'word'
      ? tilesUsed(viewedEvent.placements!)
      : viewedEvent.exchanged ?? []
    return {
      tiles: viewedEvent.rack,
      spentSlots: findSpentSlots(viewedEvent.rack, spent),
    }
  }

  function makeLitCellIds(): string[] {
    if (preview !== null) return [...preview.tiles.keys()]
    if (viewedEvent?.placements) return viewedEvent.placements.map((t) => t.id)
    return []
  }

  /** Open a teammate's preview — unless a real move has landed on my board
   *  since they staged it, when it no longer fits. No `#N`: it is no log row. */
  function openPreview(payload: GMovePreviewRaw) {
    if (payload.baseVersion !== gd.version) return
    showHistory({
      kind: 'preview',
      placements: payload.placements,
      byId: payload.byId,
      words: payload.words,
      score: payload.score,
    }, null)
  }

  return {
    isViewing: target !== null,
    targetRef,
    viewedEventId: viewedEvent === null ? null : viewedEvent.id,
    preview,
    show: (id, n) => showHistory({ kind: 'turn', id }, n),
    openPreview,
    exit: exitHistory,
    cells:
      viewedEvent === null ? null : historyBoard(gd.events, viewedEvent.id),
    rack: makePastRack(),
    litCellIds: makeLitCellIds(),
    label: makeLabel(),
  }
}
