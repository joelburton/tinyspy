// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { WordEntryRow } from '@/common/word-entry/WordEntryRow'
import { WordEntryInput } from '@/common/word-entry/WordEntryInput'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { useTrace } from '../hooks/useTrace'
import { useSubmitTrace } from '../hooks/useSubmitTrace'
import { useSpendHint } from '../hooks/useSpendHint'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { useShowPuzzleTitle } from '../hooks/useShowPuzzleTitle'
import { useTileCursor } from '../hooks/useTileCursor'
import type { GBoard, GGameData, GHistoryView, GTile, GPuzzleWord } from '../types'
import { Board } from './Board'
import { HintBar } from './HintBar'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'

/** No tiles — a past turn's trace, reused so a render passes a stable empty
 *  list. */
const NO_TILES: GTile[] = []

/** No tile ids — the live board's lit tiles, for the same identity reason. */
const NO_TILE_IDS: ReadonlySet<string> = new Set()

/**
 * strands' board column: the grid, the word-entry-row / pill slot, and the
 * hint bar — and the move: tile clicks and typed letters become a trace
 * (`useTrace`), and Submit or Enter sends it (`useSubmitTrace`). The column's
 * commands are `useBoardColActions`'.
 *
 * `PlayArea` hands it **the board to show** — the live one OR a past turn's —
 * and the words the reveal draws in gray. That split is what makes the
 * turn-history viewer a drop-in: viewing a past turn is just "draw this
 * board", with the input path frozen.
 *
 * The **word-entry row and the pill share one fixed-height slot** because they
 * are mutually exclusive in time — you are either building a word or reading
 * what the last one did. (The same swap `<WordEntryArea>` makes.)
 *
 * The **hint bar lives here rather than in the info column**, deliberately: on
 * a phone the info column goes off-canvas into the InfoSheet, and the hint
 * economy is core play, not a readout you check occasionally.
 */
export function BoardCol({
  gd,
  shownBoard,
  missedPuzzleWords,
  historyView,
  localFeedbackSlot,
}: {
  gd: GGameData
  // The board to show — PlayArea picks it: a past turn's while the history
  // viewer is open, the live one otherwise.
  shownBoard: GBoard
  // The words my board did not find, while the solution is shown; else empty.
  missedPuzzleWords: GPuzzleWord[]
  historyView: GHistoryView
  // PlayArea's below-board slot. While it holds a message — a move's result,
  // the puzzle's title, whose turn, the verdict — the pill takes the word-entry
  // row's place.
  localFeedbackSlot: FeedbackSlot
}) {
  // ─── Which board is on screen ─────────────────────────────────
  // Live, or a past turn's (PlayArea picks); everything that would write to the
  // board answers to it.

  // The board responds to me: the move is mine, on the live board (a click
  // over a past turn leaves history instead). strands does not draft off-turn,
  // so submitting asks what picking asks.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  // The word being traced (`useTrace`), its trip to the server, the hint, and
  // the column's keys.

  const trace = useTrace(gd)
  const submitTrace = useSubmitTrace({ gd, localFeedbackSlot, trace })
  const spendHint = useSpendHint({ gd, localFeedbackSlot })
  const actions = useBoardColActions({
    gd,
    isInteractive,
    isViewingHistory: historyView.isViewing,
    trace,
    submitTrace,
    spendHint,
    localFeedbackSlot,
    // Runs only inside an action's run, after this render has made the cursor.
    moveCursorTo: (tile) => tileCursor.moveTo(tile),
  })

  /** A click on a tile, or Space on the cursor's: the trace's move. */
  function pickTile(tile: GTile) {
    // A click while replaying returns to live rather than starting a trace on
    // a board that isn't the current one.
    if (historyView.isViewing) {
      historyView.exit()
      return
    }
    if (!actions.canPick) return
    localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
    // A click ANSWERS the ambiguous-letter question, so the red rings go now.
    actions.clearAmbiguous()
    trace.click(tile)
  }

  // The keyboard's way onto the board: Space is a click on the ringed letter.
  const tileCursor = useTileCursor({
    tiles: gd.puzzle.tiles,
    canPick: actions.canPick,
    onPick: pickTile,
  })

  // Any key dismisses the last result, matching every other game. A watcher
  // that claims nothing, so the same press still traces its letter.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The puzzle's title, in the slot, on an untouched board.
  useShowPuzzleTitle({ gd, trace, localFeedbackSlot })

  // ─── Render ───────────────────────────────────────────────────

  const topMessage = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)

  // The marks a live board wears are all empty while a past turn is open: that
  // board is a record, and nothing is happening on it.
  const litTileIds = useMemo(
    () => (historyView.isViewing ? new Set(historyView.litTiles.map((t) => t.id)) : NO_TILE_IDS),
    [historyView.isViewing, historyView.litTiles],
  )
  const ambiguousTileIds = useMemo(
    () => (historyView.isViewing ? NO_TILE_IDS : new Set(actions.ambiguousTiles.map((t) => t.id))),
    [historyView.isViewing, actions.ambiguousTiles],
  )

  return (
    <div className={shared.boardCol}>
      <Board
        tiles={gd.puzzle.tiles}
        // Live, my board and its ringed hint; replaying, the board as the
        // viewed turn left it, and the hint that turn spent.
        board={shownBoard}
        // The missed-word reveal is a game-end artifact — drawing it on a past
        // turn's board would mix the endgame's gray lines into a board that
        // hadn't reached it.
        missedPuzzleWords={historyView.isViewing ? [] : missedPuzzleWords}
        traceTiles={historyView.isViewing ? NO_TILES : trace.tiles}
        marks={{ litTileIds, ambiguousTileIds }}
        cursor={tileCursor.cell}
        // Not `!canPick`: over a past turn the letters stay live, because a
        // click there is how the board goes back to the live one.
        isDisabled={!gd.me.onTurn || actions.actSubmit.pending}
        isViewingHistory={historyView.isViewing}
        onPick={tileCursor.pickClicked}
      />

      {/* While replaying, the banner takes the entry/pill slot: what you want
          there is "which turn am I looking at". `bannerHost` only WHILE
          VIEWING — the banner is `position: absolute; inset: 0` and needs a
          positioning context. */}
      <div className={cls(styles.entrySlot, historyView.isViewing && history.historyBannerHost)}>
        {historyView.isViewing ? (
          <HistoryBanner label={historyView.label!} actor={historyView.actor} onExit={historyView.exit} />
        ) : topMessage !== null ? (
          <FeedbackPill slot={localFeedbackSlot} />
        ) : (
          /* The shared word-entry row (docs/playarea.md → Text entry) around the
             traced word. strands can't use <WordEntryArea>: its string is
             DERIVED from the trace, so `value`/`onChange` run backwards. On a
             phone the Submit button is the ONLY way to send a word. */
          <WordEntryRow className={styles.wordEntryRow} actDelete={actions.actDropLastCell} actSubmit={actions.actSubmit}>
            <WordEntryInput value={trace.tiles.map((t) => t.letter).join('')} className={styles.entryWord} />
          </WordEntryRow>
        )}
      </div>

      <HintBar
        hintPoints={gd.hintBarData.hintPoints}
        hintCost={gd.hintBarData.hintCost}
        showing={gd.me.board.hintTiles !== null}
        actHint={actions.actHint}
      />
    </div>
  )
}
