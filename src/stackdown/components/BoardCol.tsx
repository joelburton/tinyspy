// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { Mark } from '@/common/board-marks/useMark'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { WordEntryRow } from '@/common/word-entry/WordEntryRow'
import { answerMessage } from '../lib/answer'
import { useWordMove } from '../hooks/useWordMove'
import { useBoardColActions } from '../hooks/useBoardColActions'
import type { GGameData, GHistoryView, GPeerWordMark } from '../types'
import { Board } from './Board'
import { WordEntry } from './WordEntry'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'

/** Empty tile set — reused so a live render passes a stable empty one. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * stackdown's board column — the stacked-tile board plus the below-board region
 * (the five-slot WordEntry, the local-feedback pill, the turn-viewer banner) —
 * and the move, which it builds and sends (`useWordMove`): tile clicks and
 * physical keystrokes become a word, and Submit or Enter sends it.
 *
 * `PlayArea` hands it **the stack to show** — the live one OR a past turn's —
 * and a teammate's word, which this column marks on their tiles. That split is
 * what makes the turn-history viewer a drop-in: viewing a past turn is just
 * "draw this stack", with the input path frozen.
 */
export function BoardCol({
  gd,
  shownOffTileIds,
  historyView,
  localFeedbackSlot,
  peerMark,
}: {
  gd: GGameData
  // The tiles off the stack to show — PlayArea picks it: a past turn's while
  // the history viewer is open, the live one otherwise. The word being built is
  // taken off it here.
  shownOffTileIds: ReadonlySet<string>
  historyView: GHistoryView
  // PlayArea's below-board slot. This column shows its input-engine results
  // into it (no matching tile / an ambiguous letter) and draws it in its own
  // reserved row; a tile click, ⌫ or any key is the player's next move, so
  // it dismisses a gesture-cleared message.
  localFeedbackSlot: FeedbackSlot
  // A teammate's word, marked on their tiles (coop): the attention flash, then
  // the answer's color.
  peerMark: Mark<GPeerWordMark> | null
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // Live, or a past turn's (PlayArea picks); everything that would write to the
  // board answers to it.

  // The board responds to me: the move is mine, on the live board (any key
  // over a past turn leaves history instead). stackdown does not draft
  // off-turn, so submitting asks what picking asks.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  // The marks a live board wears are all empty while a past turn is open: that
  // board is a record, and nothing is happening on it.
  //
  // A teammate's accepted word is HELD on the board for the length of its
  // mark: the tiles the server has already taken stay drawn, and inert, until
  // the answer has been read. Otherwise the news and the change are one event —
  // the tiles you are being told about are already gone by the time you look.
  const heldTileIds = useMemo(
    () => (!historyView.isViewing && peerMark?.value.answer.answerType === 'accepted_peer'
      ? new Set(peerMark.value.tileIds)
      : NO_TILES),
    [historyView.isViewing, peerMark],
  )
  // A teammate's answer, once the attention flash has handed the tiles back.
  const boardAnswer = !historyView.isViewing && peerMark?.phase === 'answer'
    ? { tileIds: new Set(peerMark.value.tileIds), outcome: answerMessage(peerMark.value.answer).outcome }
    : null

  // ─── The pending move ─────────────────────────────────────────
  // The word being built and its trip to the server (`useWordMove`), and the
  // column's three commands (`useBoardColActions`).
  const move = useWordMove(gd, localFeedbackSlot)

  // The tiles not drawn: the stack to show's, and — live — the word being
  // built and an accepted word not yet gone from the blob, less a teammate's
  // word held for its answer.
  const offTileIds = useMemo(() => {
    if (historyView.isViewing || gd.ended) return shownOffTileIds
    const off = new Set(shownOffTileIds)
    for (const id of move.currentWord.tileIds) off.add(id)
    for (const id of move.currentWord.pendingRemoved) off.add(id)
    for (const id of heldTileIds) off.delete(id)
    return off
  }, [
    historyView.isViewing, gd.ended, shownOffTileIds, move.currentWord.tileIds,
    move.currentWord.pendingRemoved, heldTileIds,
  ])

  const actions = useBoardColActions({ gd, isInteractive, move, offTileIds, localFeedbackSlot })

  // Any key is the next move, so any key drops the previous move's result —
  // the rule every game follows, bound here because stackdown mounts no
  // WordEntryArea.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ───────────────────────────────────────────────────

  // The attention flash: a teammate's word before its answer shows, and my own
  // refused tiles as they land back.
  const attentionTileIds = useMemo(() => {
    if (historyView.isViewing) return NO_TILES
    const tileIds = new Set(move.returnedTileIds)
    if (peerMark?.phase === 'attention') for (const id of peerMark.value.tileIds) tileIds.add(id)
    return tileIds
  }, [historyView.isViewing, move.returnedTileIds, peerMark])

  return (
    // No click handler: leaving a past turn on a click is the viewer's own
    // (`useHistoryViewer`) — a click anywhere returns to live.
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <Board
        tiles={gd.puzzle.tiles}
        offTileIds={offTileIds}
        isInteractive={actions.canPick}
        isViewingHistory={historyView.isViewing}
        endingOutcome={gd.me.outcome}
        marks={{
          ambiguousTileIds: historyView.isViewing ? NO_TILES : actions.ambiguousTileIds,
          litTileIds: historyView.litTileIds,
          attentionTileIds,
          answer: boardAnswer,
          heldTileIds,
        }}
        onPick={actions.pickTile}
      />

      <div className={styles.belowBoard}>
        {/* The shared banner overlays the whole below-board region while a past
            turn is open — the WordEntry + feedback stay mounted underneath, so the
            built-up word survives the trip. */}
        {historyView.isViewing && (
          <HistoryBanner label={historyView.label} actor={historyView.actor} onExit={historyView.exit} />
        )}
        {/* The shared word-entry row (docs/playarea.md → Text entry) around the five
            slots. stackdown can't use <WordEntryArea> — its "entry" is a grid of
            picked-up TILES, so WordEntryArea's capture keyboard, arrow-history and
            string `value` have nothing to bind to — but the ROW is the same row,
            which is what `<WordEntryRow>` exists to share.

            Both buttons stay MOUNTED and merely disabled when they can't act —
            including while a past turn is being viewed — so the region never
            reflows (the reserve-the-slot rule, docs/ui.md). The ⌫ is the
            touch-reachable twin of physical Backspace, which is the real gain:
            stackdown has a supported phone layout and no keyboard there. */}
        <WordEntryRow className={styles.moveArea} actDelete={actions.actDeleteLast} actSubmit={actions.actSubmit}>
          <WordEntry
            tiles={gd.puzzle.tiles}
            currentWord={move.currentWord.tileIds}
            active={actions.canPick && !move.isRefused}
            onRetract={move.currentWord.retractTo}
            flash={move.flash}
            verdict={move.refusedOutcome}
          />
        </WordEntryRow>
        {/* The LOCAL feedback area — reserves its own height (shared
            `.localFeedback`) so the board above never reflows when the pill
            appears/clears. */}
        <div className={shared.localFeedback}>
          <FeedbackPill slot={localFeedbackSlot} />
        </div>
      </div>
    </div>
  )
}
