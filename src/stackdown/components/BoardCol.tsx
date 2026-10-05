// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { AMBIGUOUS_PICK_FLASH_MS } from '@/common/board-marks/feedbackTiming'
import { useBindAction } from '@/common/actions/useBindAction'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { WordEntryRow } from '@/common/word-entry/WordEntryRow'
import { exposedIds } from '../lib/board'
import { ANSWER_OUTCOME } from '../lib/answer'
import { useWordMove } from '../hooks/useWordMove'
import type { GGameData, GHistoryView, GPeerWordMark, GTile } from '../types'
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
  const move = useWordMove(gd, localFeedbackSlot)

  // The board responds to me: the move is mine, on the live board (any key
  // over a past turn leaves history instead). stackdown does not draft
  // off-turn, so submitting asks what picking asks.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  // ─── Send the word ────────────────────────────────────────────
  // A word is exactly five tiles, so that's the whole submit gate. The send is
  // this action's run, so its `pending` is the word in flight.
  const canSubmit = isInteractive && move.currentWord.tileIds.length === 5
  const actSubmit = useBindAction('act-submit', {
    describe: () => (canSubmit ? 'active' : 'disabled'),
    run: () => move.submitWord(move.currentWord.tileIds),
  })

  // May I pick or take back a tile right now? The board responds to me, and no
  // word is with the server.
  const canPick = isInteractive && !actSubmit.pending

  // ─── The marks a live board wears ─────────────────────────────
  // All empty while a past turn is open: that board is a record, and nothing
  // is happening on it.
  //
  // A teammate's accepted word is HELD on the board for the length of its
  // mark: the tiles the server has already taken stay drawn, and inert, until
  // the answer has been read. Otherwise the news and the change are one event —
  // the tiles you are being told about are already gone by the time you look.
  const heldTileIds = useMemo(
    () => (!historyView.isViewing && peerMark?.value.answer === 'accepted'
      ? new Set(peerMark.value.tileIds)
      : NO_TILES),
    [historyView.isViewing, peerMark],
  )
  // The attention flash: a teammate's word before its answer shows, and my own
  // refused tiles as they land back.
  const attentionTileIds = useMemo(() => {
    if (historyView.isViewing) return NO_TILES
    const tileIds = new Set(move.returnedTileIds)
    if (peerMark?.phase === 'attention') for (const id of peerMark.value.tileIds) tileIds.add(id)
    return tileIds
  }, [historyView.isViewing, move.returnedTileIds, peerMark])
  // A teammate's answer, once the attention flash has handed the tiles back.
  const boardAnswer = !historyView.isViewing && peerMark?.phase === 'answer'
    ? { tileIds: new Set(peerMark.value.tileIds), outcome: ANSWER_OUTCOME[peerMark.value.answer] }
    : null

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

  // Red ambiguous-tile flash — a typed letter matched more than one exposed tile;
  // the candidates outline red for a beat. Purely this column's input feedback.
  const [ambiguousMark, flashTiles] = useMark<{ tileIds: ReadonlySet<string> }>(
    AMBIGUOUS_PICK_FLASH_MS,
  )
  const ambiguousTileIds = ambiguousMark?.value.tileIds ?? NO_TILES

  // ─── Tile click → extend the word ─────────────────────────────
  // Filling the fifth slot deliberately does NOT submit: the word sits there
  // until you commit it with the Submit button or Enter, so a wrong fifth tile
  // is recoverable — the last tile is just another tile.
  function pickTile(tile: GTile) {
    if (!canPick) return
    move.clearFlash() // starting a new word drops any lingering word flash
    localFeedbackSlot.dismiss() // …and the previous move's result (next-move-dismisses rule)
    move.currentWord.appendTile(tile.id)
  }

  // ─── Take a tile back ─────────────────────────────────────────
  // The predicate also drives the button's `disabled`, so the key and the
  // button can't disagree about what's possible right now.
  const canDelete = canPick && move.currentWord.tileIds.length > 0

  /** Return the most recent tile — the ⌫ button and physical Backspace share it. */
  function deleteLast() {
    if (!canDelete) return
    // A ⌫ click is a move like any keystroke, so it dismisses a result the
    // same way (the WordEntryArea rule — it matters most on touch, where there is
    // no next keystroke to do it).
    localFeedbackSlot.dismiss()
    move.currentWord.retractTo(move.currentWord.tileIds.length - 1)
  }

  // ─── The board's other two keys ───────────────────────────────
  // Each is ONE action behind both its control and its key, as Submit is.
  // DISABLED rather than hidden where they don't apply: the ⌫ / Submit buttons
  // keep their slot so the region never reflows (the reserve-the-slot rule,
  // docs/ui.md). A control that stayed live over a frozen board would be lying
  // about what it can do.
  const actDeleteLast = useBindAction('act-delete-last', {
    // A word here is picked-up TILES, so this returns the last one rather than
    // erasing a letter — the registry's name would say the wrong thing.
    describe: () => ({
      state: canDelete ? 'active' : 'disabled',
      label: 'Return the last tile',
    }),
    run: deleteLast,
  })

  // Any key is the next move, so any key drops the previous move's result —
  // the rule every game follows, bound here because stackdown mounts no
  // WordEntryArea.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // A letter plays the matching tile — but ONLY if exactly one exposed tile
  // bears it: the word is the selection order, so an ambiguous letter can't
  // pick for you. 0 matches is an error; >1 flashes the candidates and asks you
  // to click one. A pattern action, so it is handed whichever letter fired it.
  useBindAction('act-pick-tile', {
    describe: () => (canPick ? 'active' : 'disabled'),
    run: (key) => {
      const letter = (key ?? '').toUpperCase()
      // Any handled keystroke is a "next move" — dismiss the previous result.
      // The no-match / ambiguous branches below show a fresh one after this.
      localFeedbackSlot.dismiss()
      // `offTileIds` is exactly the set the exposure check needs: the tiles
      // cleared so far and the ones picked into the word.
      const exposed = exposedIds(gd.puzzle.tiles, offTileIds)
      const matches = gd.puzzle.tiles.filter((t) => exposed.has(t.id) && t.letter === letter)
      if (matches.length === 1) {
        pickTile(matches[0]!)
      } else if (matches.length === 0) {
        localFeedbackSlot.show(FeedbackMessage.result('lost', `No “${letter}” tile is on top`))
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles({ tileIds: new Set(matches.map((m) => m.id)) })
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
        tiles={gd.puzzle.tiles}
        offTileIds={offTileIds}
        isInteractive={canPick}
        isViewingHistory={historyView.isViewing}
        marks={{
          ambiguousTileIds: historyView.isViewing ? NO_TILES : ambiguousTileIds,
          litTileIds: historyView.litTileIds,
          attentionTileIds,
          answer: boardAnswer,
          heldTileIds,
        }}
        onPick={pickTile}
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
        <WordEntryRow className={styles.moveArea} actDelete={actDeleteLast} actSubmit={actSubmit}>
          <WordEntry
            tiles={gd.puzzle.tiles}
            currentWord={move.currentWord.tileIds}
            active={canPick && !move.isRefused}
            onRetract={move.currentWord.retractTo}
            flash={move.flash}
            verdict={move.isRefused ? ANSWER_OUTCOME.invalid : null}
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
