import { useCallback } from 'react'
import { cls } from '../../common/lib/cls'
import { useFlash } from '../../common/hooks/useFlash'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { exposedIds, type Tile } from '../lib/board'
import { Board } from './Board'
import { WordEntry, type WordFlash } from './WordEntry'
import shared from '../../common/components/PlayArea.module.css'
import history from '../../common/components/historyViewer.module.css'
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
 *     (`localPill`, written via `showFeedback`/`clearFeedback`). Those channels have
 *     triggers outside this column (coop peer narration; the reveal/hint cheats), so
 *     the coordinator owns them — see the plan's note on cross-column feedback.
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
  showFeedback,
  clearFeedback,
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
  /** Emit a completed 5-tile word up — PlayArea owns the RPC + commit/clear. */
  onSubmitWord: (tileIds: number[]) => void

  // ── Below-board own-move feedback (the channel is owned by PlayArea) ──
  /** The below-board pill to show (terminal verdict / own-move message), or null. */
  localPill: GenericFeedbackMsg | null
  /** Report an input-engine message (no matching tile / ambiguous letter). */
  showFeedback: (text: string, tone: GenericFeedbackTone) => void
  /** Clear the below-board pill (a new move dismisses the previous one). */
  clearFeedback: () => void

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

  // ─── Tile click → extend the word, submit on the fifth ────────
  const onTileClick = useCallback(
    (tileId: number) => {
      if (readOnly) return
      clearFlash() // starting a new word drops any lingering word flash
      clearFeedback() // …and the previous move's local pill (next-move-dismisses rule)
      const word = appendTile(tileId)
      if (word && word.length === 5) onSubmitWord(word)
    },
    [readOnly, appendTile, onSubmitWord, clearFlash, clearFeedback],
  )

  // ─── Physical keyboard ────────────────────────────────────────
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
    clearFeedback()
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (currentWord.length > 0) retractTo(currentWord.length - 1)
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
        showFeedback(`No “${letter}” tile is on top`, 'error')
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles(matches.map((m) => m.id))
        showFeedback(`${matches.length} “${letter}” tiles are on top — click one`, 'warning')
      }
    }
  })

  return (
    // While viewing a past turn, a click anywhere in the board column returns to
    // live (matches scrabble's "click to exit"); it's a no-op when live.
    <div
      className={cls(shared.boardCol, styles.boardCol)}
      onClick={viewing ? onExitViewing : undefined}
    >
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
            "viewing history" marker (common/components/historyViewer.module.css).
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
        <div className={styles.moveArea}>
          <WordEntry
            tiles={tiles}
            currentWord={currentWord}
            active={!readOnly}
            onRetract={retractTo}
            flash={flash}
          />
        </div>
        {/* The LOCAL feedback area — reserves its own height (shared
            `.localFeedback`) so the board above never reflows when the pill
            appears/clears. */}
        <div className={shared.localFeedback}>
          {localPill && <GenericFeedbackPill msg={localPill} onClose={clearFeedback} />}
        </div>
      </div>
    </div>
  )
}
