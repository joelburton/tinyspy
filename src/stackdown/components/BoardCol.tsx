// cs-fixed-outcome-fix

import { useCallback } from 'react'
import { cls } from '@/common/utils/cls'
import { useMark } from '@/common/board-marks/useMark'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { WordEntryRow } from '@/common/word-entry/WordEntryRow'
import type { Outcome } from '@/common/outcomes/outcomes'
import { exposedIds, type Tile } from '../lib/board'
import { ANSWER_OUTCOME } from '../lib/answer'
import { Board } from './Board'
import { WordEntry, type WordFlash } from './WordEntry'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'

/** Empty tile set — reused so a live render passes a stable empty one. */
const NO_TILES: ReadonlySet<number> = new Set()

/**
 * stackdown's board column — the stacked-tile board plus the below-board region
 * (the five-slot WordEntry, the local-feedback pill, the turn-viewer banner). This
 * is the **live input engine**: it turns tile clicks and physical keystrokes into a
 * word being built, and emits the completed 5-tile word up via `onSubmitWord`. It
 * does NOT own the game state — `PlayArea` hands it **the board to render** (the
 * live board OR a historical snapshot) plus where I stand; that split is what makes
 * the turn-history viewer a drop-in (viewing a past turn is just "render this
 * snapshot", no reopening of the input path). See docs/playarea.md.
 *
 * State ownership across the seam:
 *   - Owned here: the red ambiguous-tile flash (a typed letter matched >1 exposed
 *     tile) — purely this column's own input feedback.
 *   - Owned by PlayArea, rendered here via props: the word-slot flash (`flash` —
 *     my own accepted word) and the local feedback slot (`localFeedbackSlot`,
 *     which this column shows its input-engine results into and draws). Those
 *     channels have triggers outside this column (a teammate's word marks their
 *     tiles; the reveal/hint cheats), so the coordinator owns them.
 */
export function BoardCol({
  tiles,
  offBoard,
  historyLitTiles,
  isBoardInteractive,
  submitting,
  historyLabel,
  historyActor,
  onExitHistory,
  currentWord,
  appendTile,
  retractTo,
  onSubmitWord,
  localFeedbackSlot,
  flash,
  clearFlash,
  attentionTiles,
  boardAnswer,
  heldTiles,
  refusedWord,
}: {
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  // The full tile set (fixed geometry).
  tiles: Tile[]
  // Tiles NOT to paint — the live board's removed+picked-up tiles, OR a snapshot's
  // off-board set while viewing a past turn. PlayArea picks which.
  offBoard: Set<number>
  // Tiles to ring green — a viewed turn's played word; empty (NO_TILES) when live.
  historyLitTiles: ReadonlySet<number>
  // The board responds to me (the page's `isBoardInteractive`). The history
  // viewer and a word in flight block input on top of it.
  isBoardInteractive: boolean
  // My word is with the server — no new pick until it answers.
  submitting: boolean

  // ── History viewer (its overlay lives in the below-board region) ──
  // The viewed turn's label (it drives the banner and the viewing frame), or null
  // when live.
  historyLabel: string | null
  /** Whose board is on screen, when it is not the viewer's own. */
  historyActor?: Actor | null
  // Return to the live board (a board/banner click, the ✕, or any keystroke).
  onExitHistory: () => void

  // ── Word-building (the buffer stays in useGame; this column drives it) ──
  // The word being built (tile ids in selection order).
  currentWord: number[]
  // Pick a tile onto the word; returns the new word (or null if it couldn't).
  appendTile: (tileId: number) => number[] | null
  // Return a slot's tile and every tile after it.
  retractTo: (index: number) => void
  // Emit the completed 5-tile word up — PlayArea owns the RPC + commit/clear.
  // Only ever called on a deliberate submit (the button or Enter); picking the
  // fifth tile no longer fires it.
  onSubmitWord: (tileIds: number[]) => void

  // ── Below-board own-move feedback (the slot is PlayArea's) ──
  // PlayArea's below-board slot. This column shows its input-engine results
  // into it (no matching tile / an ambiguous letter) and draws it in its own
  // reserved row; a tile click, ⌫ or any key is the player's next move, so
  // it dismisses a gesture-cleared message.
  localFeedbackSlot: FeedbackSlot

  // ── Word-slot flash (my own accepted word — timer owned by PlayArea) ──
  flash: WordFlash | null
  // Drop any lingering word flash when a new word starts.
  clearFlash: () => void

  // ── The live board's marks (PlayArea sequences them) ──
  // Tiles taking the attention flash — a teammate's word before its answer
  // shows, and my own refused tiles as they land back.
  attentionTiles: ReadonlySet<number>
  // A teammate's answer, once the attention flash has handed their tiles back:
  // those tiles wear the outcome's own color, and a refusal shakes.
  boardAnswer: { ids: ReadonlySet<number>; outcome: Outcome } | null
  // Tiles the server has taken but the board is still showing, so the answer
  // can be read before they go. Drawn, and inert.
  heldTiles: ReadonlySet<number>
  // My own word was just refused: the slots are wearing the answer, so they are
  // not a place to take tiles back from yet.
  refusedWord: boolean
}) {
  const isViewingHistory = historyLabel != null
  // May I pick, take back or submit a tile right now? The board is mine to
  // touch, no word is in flight, and a past turn is not on screen (any key
  // there leaves history). stackdown does not draft off-turn, so submitting
  // asks what picking asks.
  const canPick = isBoardInteractive && !submitting && !isViewingHistory

  // Red ambiguous-tile flash — a typed letter matched more than one exposed tile;
  // the candidates outline red for a beat. Purely this column's input feedback, so
  // the state lives here (unlike the word-slot flash, which a teammate can trigger).
  const [ambiguousMark, flashTiles] = useMark<{ ids: ReadonlySet<number> }>(
    AMBIGUOUS_PICK_FLASH_MS,
  )
  const flashIds = ambiguousMark?.value.ids ?? NO_TILES

  // ─── Tile click → extend the word ─────────────────────────────
  // Filling the fifth slot deliberately does NOT submit: the word sits there
  // until you commit it with the Submit button or Enter, so a wrong fifth tile
  // is recoverable — the last tile is just another tile.
  const onTileClick = useCallback(
    (tileId: number) => {
      if (!canPick) return
      clearFlash() // starting a new word drops any lingering word flash
      localFeedbackSlot.dismiss() // …and the previous move's result (next-move-dismisses rule)
      appendTile(tileId)
    },
    [canPick, appendTile, clearFlash, localFeedbackSlot],
  )

  // ─── The two explicit move controls ───────────────────────────
  // A word is exactly five tiles, so that's the whole submit gate. Both
  // predicates also drive the buttons' `disabled`, so the keyboard and the
  // buttons can't disagree about what's possible right now.
  const canSubmit = canPick && currentWord.length === 5
  const canDelete = canPick && currentWord.length > 0

  const submitWord = useCallback(() => {
    if (canSubmit) onSubmitWord(currentWord)
  }, [canSubmit, onSubmitWord, currentWord])

  /** Return the most recent tile — the ⌫ button and physical Backspace share it. */
  const deleteLast = useCallback(() => {
    if (!canDelete) return
    // A ⌫ click is a move like any keystroke, so it dismisses a result the
    // same way (the WordEntryArea rule — it matters most on touch, where there is
    // no next keystroke to do it).
    localFeedbackSlot.dismiss()
    retractTo(currentWord.length - 1)
  }, [canDelete, localFeedbackSlot, retractTo, currentWord.length])

  // ─── The board's three keys ───────────────────────────────────
  // Each is ONE binding behind both its control and its key. DISABLED rather
  // than hidden where they don't apply: the ⌫ / Submit buttons keep their slot
  // so the region never reflows (the reserve-the-slot rule, docs/ui.md). The
  // history viewer's any-key exit needs no help from this — the dispatcher gives
  // a MODE priority over a particular key — but a control that stayed live over
  // a frozen board would be lying about what it can do. `canPick` covers both
  // the frozen board and the open past turn.
  const actSubmit = useBoundAction('act-submit', {
    describe: () => (canSubmit ? 'active' : 'disabled'),
    run: submitWord,
  })

  const actDeleteLast = useBoundAction('act-delete-last', {
    // A word here is picked-up TILES, so this returns the last one rather than
    // erasing a letter — the registry's name would say the wrong thing.
    describe: () => ({
      state: canDelete ? 'active' : 'disabled',
      label: 'Return the last tile',
    }),
    run: deleteLast,
  })

  // A letter plays the matching tile — but ONLY if exactly one exposed tile
  // bears it: the word is the selection order, so an ambiguous letter can't
  // pick for you. 0 matches is an error; >1 flashes the candidates and asks you
  // to click one. A pattern action, so it is handed whichever letter fired it.
  // Any key is the next move, so any key drops the previous move's result —
  // the rule every game follows, bound here because stackdown mounts no
  // WordEntryArea.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  useBoundAction('act-pick-tile', {
    describe: () => (canPick ? 'active' : 'disabled'),
    run: (key) => {
      const letter = (key ?? '').toUpperCase()
      // Any handled keystroke is a "next move" — dismiss the previous result.
      // The no-match / ambiguous branches below show a fresh one after this.
      localFeedbackSlot.dismiss()
      // Exposed tiles still on the board. While live (the only time we get
      // here), `offBoard` already excludes the tiles removed so far + the ones
      // picked into the word, so it's exactly the set the exposure check needs.
      const exposed = exposedIds(tiles, offBoard)
      const matches = tiles.filter((t) => exposed.has(t.id) && t.letter === letter)
      if (matches.length === 1) {
        onTileClick(matches[0].id)
      } else if (matches.length === 0) {
        localFeedbackSlot.show(FeedbackMessage.result('lost', `No “${letter}” tile is on top`))
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles({ ids: new Set(matches.map((m) => m.id)) })
        localFeedbackSlot.show(
          FeedbackMessage.result('warning', `${matches.length} “${letter}” tiles are on top — click one`),
        )
      }
    },
  })

  return (
    // Exit-on-click is intrinsic to the viewer now (useHistoryViewer's document
    // listener + the click-through `.historyFrame`), so the board column needs no click
    // handler — a click anywhere returns to live.
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <Board
        tiles={tiles}
        offBoard={offBoard}
        active={canPick}
        ambiguousTiles={isViewingHistory ? NO_TILES : flashIds}
        historyLitTiles={historyLitTiles}
        isViewingHistory={isViewingHistory}
        onTileClick={onTileClick}
        attention={attentionTiles}
        answer={boardAnswer}
        held={heldTiles}
      />

      <div className={styles.belowBoard}>
        {/* The shared banner overlays the whole below-board region while a past
            turn is open — the WordEntry + feedback stay mounted underneath, so the
            built-up word survives the trip. */}
        {isViewingHistory && (
          <HistoryBanner label={historyLabel} actor={historyActor} onExit={onExitHistory} />
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
        <WordEntryRow className={styles.moveArea} actDelete={actDeleteLast} actSubmit={actSubmit}>
          <WordEntry
            tiles={tiles}
            currentWord={currentWord}
            active={canPick && !refusedWord}
            onRetract={retractTo}
            flash={flash}
            verdict={refusedWord ? ANSWER_OUTCOME.invalid : null}
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
