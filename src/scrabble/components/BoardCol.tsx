// cs-fixed-outcome-fix

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import {
  useDismissLocalFeedbackOnKey,
} from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { cls } from '@/common/utils/cls'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { Dot } from '@/common/members/Dot'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { GridCursor } from '@/common/board-cursor/gridCursor'
import { BLANK, makeCellId } from '../lib/board'
import { useRackOrder } from '../hooks/useRackOrder'
import { useStagedTiles } from '../hooks/useStagedTiles'
import { useSubmitMove } from '../hooks/useSubmitMove'
import { useBoardDrag } from '../hooks/useBoardDrag'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { useLandMove } from '../hooks/useLandMove'
import type {
  GCell,
  GGameData,
  GHistoryView,
  GPlacement,
  GMovePreviewRaw,
  GTile,
} from '../types'
import { Board } from './Board'
import { Rack } from './Rack'
import { Controls } from './Controls'
import { StateLine } from './StateLine'
import { BlankPickerBlockingModal } from './BlankPickerBlockingModal'
import shared from '@/common/game-page/playArea.module.css'
import dragGhost from '@/shared/grid-and-drag/dragGhost.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** No cells and no laid tiles — the marks a past turn's board wears for the
 *  live move. */
const NO_CELLS: ReadonlySet<string> = new Set()
const NO_TILES: ReadonlyMap<string, GTile> = new Map()

/**
 * scrabble's board column: the 15×15 board, and beneath it the rack and the
 * move row — and the move. Laying a move out (`useStagedTiles`, `useBoardDrag`
 * and the cursor keys), the rack's order (`useRackOrder`), and the move's trip
 * to the server (`useSubmitMove`) are all here, since each one reads the
 * others' state; `useBoardColActions` binds the commands the row places.
 *
 * Above the board sits the shared `<MobileStatusBar>`, `display: none` on
 * desktop: on a phone the info column is off-canvas, and the state line is
 * what a player reads between moves.
 */
export function BoardCol({
  gd,
  shownCells,
  historyView,
  localFeedbackSlot,
  sendPreview,
  registerSuggestionApplier,
}: {
  gd: GGameData
  // The board to show — PlayArea picks it: a past turn's, or the live one.
  shownCells: GCell[]
  historyView: GHistoryView
  // PlayArea's below-board slot: a move's answer, the ending, whose turn.
  localFeedbackSlot: FeedbackSlot
  // Show my staged tiles to my teammates (`useMovePreview`).
  sendPreview: (payload: GMovePreviewRaw) => void
  // Hand PlayArea the way a picked suggestion is staged; null on unmount.
  registerSuggestionApplier: (fn: ((placements: GPlacement[]) => void) | null) => void
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // I may lay a move out — on another player's turn too — while I'm still
  // playing and the board is live; a press over a past turn is the viewer's
  // exit.
  const isInteractive =
    gd.me.stillPlaying && !gd.ended && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  // The rack I play from: the team's in coop, my own in a race.
  const rack = gd.me.rack
  const [cursor, setCursor] = useState<GridCursor>({ x: 7, y: 7, dir: 'h' })
  const submission = useSubmitMove({ gd, localFeedbackSlot })
  const staged = useStagedTiles({
    cells: submission.liveCells,
    rack,
    historyView,
    localFeedbackSlot,
    registerSuggestionApplier,
  })
  const rackOrder = useRackOrder(rack)
  const pointer = useBoardDrag({
    cells: submission.liveCells,
    isInteractive,
    historyView,
    stagedAt: staged.stagedAt,
    placeFromRack: staged.placeFromRack,
    placePickedAt: staged.placePickedAt,
    moveStaged: staged.moveStaged,
    recall: staged.recall,
    togglePick: staged.togglePick,
    moveRackTile: rackOrder.moveTile,
    setCursor,
    localFeedbackSlot,
  })
  const actions = useBoardColActions({
    gd,
    rack,
    cells: submission.liveCells,
    cursor,
    setCursor,
    isInteractive,
    staged,
    rackOrder,
    submission,
    sendPreview,
    localFeedbackSlot,
  })

  // A move landed: the rack, my staged tiles and the viewer follow it.
  useLandMove({ gd, rack, historyView, submission, staged, rackOrder })

  // Any key is the next move, so any key drops the previous move's result.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ───────────────────────────────────────────────────

  // The live board carries my just-played tiles until the blob has them.
  const boardCells = historyView.cells === null
    ? submission.liveCells
    : shownCells
  const preview = historyView.preview

  /** The tiles laid but not played: a preview's over the live board, none
   *  over a past turn, my own staged tiles otherwise. */
  function getLaidTiles() {
    if (preview !== null) return preview.tiles
    if (historyView.isViewing) return NO_TILES
    return staged.laidTiles
  }

  const boardMarks = {
    stagedTiles: getLaidTiles(),
    justPlayedCellIds: historyView.isViewing
      ? NO_CELLS
      : submission.playedCellIds,
    refusedCellIds: historyView.isViewing
      ? NO_CELLS
      : submission.refusedCellIds,
    historyLitCellIds: new Set(historyView.litCellIds),
    liftedCellId: pointer.drag?.source.kind === 'board'
      ? makeCellId(pointer.drag.source.x, pointer.drag.source.y)
      : null,
    dropCellId: pointer.drag === null || historyView.isViewing ||
    pointer.hover === null
      ? null
      : makeCellId(pointer.hover.x, pointer.hover.y),
  }

  return (
    <>
      {/* `.peerPreview` recolors the frame and banner, so a teammate's preview
          reads apart from a past turn (theme.css → --peer-preview-color). */}
      <div className={cls(shared.boardCol,
        styles.boardCol,
        preview !== null && history.peerPreview)}>
        <MobileStatusBar>
          <StateLine gd={gd}/>
        </MobileStatusBar>
        <Board
          cells={boardCells}
          marks={boardMarks}
          cursor={cursor}
          isViewingHistory={historyView.isViewing}
          onCellPointerDown={pointer.onCellPointerDown}
        />

        <div className={styles.belowBoard}>
          {/* The banner covers the rack row while viewing; the rack stays
              mounted underneath, so a staged move survives a look back. */}
          {historyView.isViewing && (
            <HistoryBanner
              onExit={historyView.exit}
              label={preview === null ? historyView.label : (
                <>
                  <Dot
                    color={preview.by.color}/> {preview.by.username} showing:{' '}
                  {preview.words.length > 0
                    ? `+${preview.score} ${preview.words.map((w) => w.toUpperCase()).join(
                      ', ')}`
                    : `${preview.tiles.size} tile${preview.tiles.size === 1 ? '' : 's'}`}
                </>
              )}
            />
          )}
          <div className={styles.moveArea}>
            <div className={styles.rackWrap}>
              <Rack
                tiles={rackOrder.tiles}
                usedSlots={staged.usedSlots}
                pickedSlots={staged.pickedSlots}
                drawnSlots={rackOrder.drawnSlots}
                isInteractive={isInteractive}
                onPointerDown={pointer.onRackPointerDown}
              />
              {/* Shuffle floats over the rack's corner: it reorders the rack,
                  not the move. It hides itself on an empty rack. */}
              <ShuffleButton action={actions.actShuffle} tooltip="Shuffle rack"
                             className={styles.rackShuffle}/>
            </div>
            <Controls
              submitScore={actions.submitScore}
              actSubmit={actions.actSubmit}
              actRecallTiles={actions.actRecallTiles}
              actSharePreview={actions.actSharePreview}
              actExchange={actions.actExchange}
              actPass={actions.actPass}
              localFeedbackSlot={localFeedbackSlot}
            />
          </div>
        </div>
      </div>

      {staged.blankAt !== null && (
        <BlankPickerBlockingModal onPick={staged.pickBlank}
                                  onCancel={staged.cancelBlank}/>
      )}

      {pointer.drag !== null && (
        <div className={cls(dragGhost.ghost, styles.ghost)}
             style={{ left: pointer.drag.x, top: pointer.drag.y }}>
          {pointer.drag.letter === BLANK ? '' : pointer.drag.letter}
        </div>
      )}
    </>
  )
}
