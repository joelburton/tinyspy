import { useCallback } from 'react'
import { cls } from '../../common/lib/util/cls'
import { useFlash } from '../../common/hooks/ui/useFlash'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { DeleteButton } from '../../common/components/buttons/DeleteButton'
import { SubmitButton } from '../../common/components/buttons/SubmitButton'
import { exposedIds, type Tile } from '../lib/board'
import { Board } from './Board'
import { WordEntry, type WordFlash } from './WordEntry'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** Empty highlight set — reused so a live render passes a stable empty green set. */
const NO_TILES: ReadonlySet<number> = new Set()

/**
 * stackdown's board column — the stacked-tile board plus the below-board region
 * (the five-slot WordEntry, the local-feedback pill, the turn-viewer banner). This
 * is the **live input engine**: it turns tile clicks and physical keystrokes into a
 * word being built, and emits the completed 5-tile word up via `onSubmitWord`. It
 * does NOT own the game state — `PlayArea` hands it **the board to render** (the
 * live board OR a historical snapshot) plus `readOnly`; that split is what makes the
 * turn-history viewer a drop-in (viewing a past turn is just "render this snapshot,
 * readOnly", no reopening of the input path). See docs/playarea-decomposition-plan.md.
 *
 * State ownership across the seam:
 *   - Owned here: the red ambiguous-tile flash (a typed letter matched >1 exposed
 *     tile) — purely this column's own input feedback.
 *   - Owned by PlayArea, rendered here via props: the word-slot flash (`flash` —
 *     own-accepted or a coop teammate's word) and the below-board local pill
 *     (`localPill`, written via `showLocalFeedback`/`clearLocalFeedback`). Those
 *     channels have triggers outside this column (coop peer narration; the
 *     reveal/hint cheats), so the coordinator owns them — see the plan's note on
 *     cross-column feedback.
 */
export function BoardCol({
  tiles,
  offBoard,
  greenTiles,
  readOnly,
  viewingDescription,
  onExitViewing,
  currentWord,
  appendTile,
  retractTo,
  onSubmitWord,
  localPill,
  showLocalFeedback,
  clearLocalFeedback,
  flash,
  clearFlash,
}: {
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  /** The full tile set (fixed geometry). */
  tiles: Tile[]
  /** Tiles NOT to paint — the live board's removed+picked-up tiles, OR a snapshot's
   *  off-board set while viewing a past turn. PlayArea picks which. */
  offBoard: Set<number>
  /** Tiles to ring green — a viewed turn's played word; empty (NO_TILES) when live. */
  greenTiles: ReadonlySet<number>
  /** Board inert + input frozen: `viewing || !canPlay`. When NOT viewing this is
   *  exactly "can't play right now", which is why the key handler can gate on it. */
  readOnly: boolean

  // ── History viewer (its overlay lives in the below-board region) ──
  /** The viewed turn's description while inspecting history (drives the banner + the
   *  yellow frame), or null when live. */
  viewingDescription: string | null
  /** Return to the live board (a board/banner click, the ✕, or any keystroke). */
  onExitViewing: () => void

  // ── Word-building (the buffer stays in useGame; this column drives it) ──
  /** The word being built (tile ids in selection order). */
  currentWord: number[]
  /** Pick a tile onto the word; returns the new word (or null if it couldn't). */
  appendTile: (tileId: number) => number[] | null
  /** Return a slot's tile and every tile after it. */
  retractTo: (index: number) => void
  /** Emit the completed 5-tile word up — PlayArea owns the RPC + commit/clear.
   *  Only ever called on a deliberate submit (the button or Enter); picking the
   *  fifth tile no longer fires it. */
  onSubmitWord: (tileIds: number[]) => void

  // ── Below-board own-move feedback (the channel is owned by PlayArea) ──
  /** The below-board pill to show (terminal verdict / own-move message), or null. */
  localPill: GenericFeedbackMsg | null
  /** Report an input-engine message (no matching tile / ambiguous letter). */
  showLocalFeedback: (text: string, tone: GenericFeedbackTone) => void
  /** Clear the below-board pill (a new move dismisses the previous one). */
  clearLocalFeedback: () => void

  // ── Word-slot flash (own-accepted / coop peer word — timer owned by PlayArea) ──
  /** The word-slot flash (own-accepted / peer word), owned by PlayArea's timer. */
  flash: WordFlash | null
  /** Drop any lingering word flash when a new word starts. */
  clearFlash: () => void
}) {
  const viewing = viewingDescription != null

  // Red ambiguous-tile flash — a typed letter matched more than one exposed tile;
  // the candidates outline red for a beat. Purely this column's input feedback, so
  // the state lives here (unlike the word-slot flash, which a teammate can trigger).
  const [flashIds, flashTiles] = useFlash<number>(900)

  // ─── Tile click → extend the word ─────────────────────────────
  // Filling the fifth slot deliberately does NOT submit: the word sits there
  // until you commit it with the Submit button or Enter. Picking a wrong fifth
  // tile used to be unrecoverable — the game committed under your finger — and
  // making the last tile just another tile is most of the point of the change.
  const onTileClick = useCallback(
    (tileId: number) => {
      if (readOnly) return
      clearFlash() // starting a new word drops any lingering word flash
      clearLocalFeedback() // …and the previous move's local pill (next-move-dismisses rule)
      appendTile(tileId)
    },
    [readOnly, appendTile, clearFlash, clearLocalFeedback],
  )

  // ─── The two explicit move controls ───────────────────────────
  // A word is exactly five tiles, so that's the whole submit gate. Both
  // predicates also drive the buttons' `disabled`, so the keyboard and the
  // buttons can't disagree about what's possible right now.
  const canSubmit = !readOnly && currentWord.length === 5
  const canDelete = !readOnly && currentWord.length > 0

  const submitWord = useCallback(() => {
    if (canSubmit) onSubmitWord(currentWord)
  }, [canSubmit, onSubmitWord, currentWord])

  /** Return the most recent tile — the ⌫ button and physical Backspace share it. */
  const deleteLast = useCallback(() => {
    if (!canDelete) return
    // A ⌫ click is a move like any keystroke, so it dismisses sticky feedback
    // the same way (the EntryRow rule — it matters most on touch, where there
    // is no next keystroke to do it).
    clearLocalFeedback()
    retractTo(currentWord.length - 1)
  }, [canDelete, clearLocalFeedback, retractTo, currentWord.length])

  // ─── Physical keyboard ────────────────────────────────────────
  // Enter submits (below five tiles it's a deliberate no-op, matching the
  // disabled Submit button — there's nothing to say, so it says nothing).
  // Backspace returns the most recent tile; a letter key plays the matching tile —
  // but ONLY if exactly one exposed tile bears it (the word is the selection order,
  // so an ambiguous letter can't pick for you). 0 matches is an error; >1 flashes
  // the candidates and asks you to click one. useGlobalKeyHandler reads this closure
  // fresh each render and ignores keys aimed at chat / inputs.
  useGlobalKeyHandler((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // While viewing a past turn, any (non-modifier) key returns to the live board
    // (navigation is by clicking log rows) and consumes the key — checked before the
    // readOnly gate, since viewing can be active while it's still your turn.
    if (viewing) {
      onExitViewing()
      return
    }
    if (readOnly) return // not viewing ⇒ readOnly === "can't play right now"
    // Any handled keystroke is a "next move" — clear the previous local pill. The
    // no-match / ambiguous branches below set a fresh one after this.
    clearLocalFeedback()
    if (e.key === 'Enter') {
      e.preventDefault()
      submitWord()
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      deleteLast()
      return
    }
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      const letter = e.key.toUpperCase()
      // Exposed tiles still on the board. While live (the only time we get here),
      // `offBoard` already excludes the tiles removed so far + the ones picked into
      // the word, so it's exactly the set the exposure check needs.
      const exposed = exposedIds(tiles, offBoard)
      const matches = tiles.filter((t) => exposed.has(t.id) && t.letter === letter)
      if (matches.length === 1) {
        onTileClick(matches[0].id)
      } else if (matches.length === 0) {
        showLocalFeedback(`No “${letter}” tile is on top`, 'error')
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles(matches.map((m) => m.id))
        showLocalFeedback(`${matches.length} “${letter}” tiles are on top — click one`, 'warning')
      }
    }
  })

  return (
    // Exit-on-click is intrinsic to the viewer now (useHistoryViewer's document
    // listener + the click-through `.frame`), so the board column needs no click
    // handler — a click anywhere returns to live.
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <Board
        tiles={tiles}
        offBoard={offBoard}
        active={!readOnly}
        highlight={viewing ? NO_TILES : flashIds}
        green={greenTiles}
        viewing={viewing}
        onTileClick={onTileClick}
      />

      <div className={styles.belowBoard}>
        {/* Turn-viewer banner — while inspecting a past turn it overlays the whole
            below-board region (the WordEntry + feedback stay mounted underneath, so
            the built-up word survives). Opaque surface + yellow border = the shared
            "viewing history" marker (common/components/game/lists/historyViewer.module.css).
            Click anywhere to exit; the ✕ far right also exits. */}
        {viewing && (
          <div className={history.banner} onClick={onExitViewing} title="Click to exit">
            <span className={history.bannerLabel}>{viewingDescription}</span>
            <button
              type="button"
              className={history.bannerExit}
              onClick={(e) => {
                e.stopPropagation()
                onExitViewing()
              }}
              aria-label="Exit viewing"
            >
              ✕
            </button>
          </div>
        )}
        {/* The move row: ⌫ | the five slots | Submit — the arrangement the shared
            <EntryRow> gives every typing game (docs/playarea.md → Text entry), built
            here rather than reused, because stackdown's "entry" is a grid of
            picked-up TILES, not a text buffer: EntryRow's capture keyboard,
            arrow-history and string `value` have nothing to bind to. The two
            buttons are the shared ones, so the control reads as the same control
            it is elsewhere.

            Both stay MOUNTED and merely disabled when they can't act — including
            while a past turn is being viewed — so the region never reflows (the
            reserve-the-slot rule, docs/ui.md). The ⌫ is the touch-reachable twin
            of physical Backspace, which is the real gain: stackdown has a
            supported phone layout and no keyboard there. */}
        <div className={styles.moveArea}>
          <DeleteButton iconOnly onClick={deleteLast} disabled={!canDelete} />
          <WordEntry
            tiles={tiles}
            currentWord={currentWord}
            active={!readOnly}
            onRetract={retractTo}
            flash={flash}
          />
          <SubmitButton iconOnly onClick={submitWord} disabled={!canSubmit} />
        </div>
        {/* The LOCAL feedback area — reserves its own height (shared
            `.localFeedback`) so the board above never reflows when the pill
            appears/clears. */}
        <div className={shared.localFeedback}>
          {localPill && <GenericFeedbackPill msg={localPill} onClose={clearLocalFeedback} />}
        </div>
      </div>
    </div>
  )
}
