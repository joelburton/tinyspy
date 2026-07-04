import { useCallback, useRef, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { db } from '../db'
import type { WordRow } from '../hooks/useBoard'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import { BoardGrid } from './BoardGrid'
import { CluePanel, type SuggestState } from './CluePanel'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** The below-board pills are never closeable, so the × is never rendered and this is
 *  never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/**
 * codenamesduet's board column — the 5×5 `BoardGrid` plus the fixed-height
 * below-board slot under it (the turn-viewer banner, the CluePanel during play, or a
 * local `<GenericFeedbackPill>` for an own-action error / the terminal verdict).
 *
 * This is codenamesduet's **input engine**, and it's a two-input game: guessing is a
 * board click (a tile → `submit_guess`) and cluing is the below-board `CluePanel`
 * form (which owns `submit_clue` / `pass_turn` / the AI suggest itself). So this
 * column owns the **guess** RPC directly — the guess has no deep entangled state (the
 * reveal arrives via realtime), but keeping the `pendingPos` + in-flight guard beside
 * the board it gates is the natural home — while `CluePanel` keeps the clue RPCs.
 * Like the other games' BoardCol it does NOT own the game state: PlayArea hands it
 * **the board to render** (live OR a historical snapshot) + `viewing`, which is what
 * makes the turn-history viewer a drop-in. Feedback lifts to PlayArea (its `onError`
 * / `clearLocalFeedback` write the shared below-board channel, which InfoCol's End
 * also writes), and the AI-suggestion dialog state lives in PlayArea (it must mount
 * high in the tree). See docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  words,
  myKey,
  peerKey,
  mySeat,
  gameOver,
  cellsClickable,
  highlight,
  // ── History viewer (its overlay lives in the below-board region) ──
  viewing,
  viewingDescription,
  onExitViewing,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  onError,
  clearLocalFeedback,
  // ── Below-board slot content ──
  over,
  localPill,
  // ── Clue panel (the clue-giver's below-board form) ──
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  onSuggestionChange,
}: {
  // ── Board to render ──
  /** The 25 board words — the live board OR a snapshot's reveal state (PlayArea picks). */
  words: WordRow[]
  /** The caller's own key view. */
  myKey: KeyLabel[]
  /** The partner's key view, once the game's over (post-game reveal); else null. */
  peerKey: KeyLabel[] | null
  /** Caller's seat, or undefined if watching. */
  mySeat: Seat | undefined
  gameOver: boolean
  /** May I click a cell to guess right now (derivePhase)? Board input is also frozen
   *  while `viewing` — this column ANDs the two before handing it to `<BoardGrid>`. */
  cellsClickable: boolean
  /** Turn-history: the positions the viewed turn decided — ring them (undefined live). */
  highlight: ReadonlySet<number> | undefined

  // ── History viewer ──
  viewing: boolean
  /** The viewed turn's description while inspecting history (drives the banner), or
   *  null when live. */
  viewingDescription: string | null
  /** Return to the live board (the banner click / ✕). */
  onExitViewing: () => void

  // ── Guess dispatch ──
  gameId: string
  /** Report an own-action error (a rejected guess / a clue-panel error) — PlayArea
   *  routes it to the shared below-board pill (the channel InfoCol's End writes too). */
  onError: (message: string) => void
  /** Clear the below-board pill (a new guess dismisses the previous one). */
  clearLocalFeedback: () => void

  // ── Below-board slot content (the channel is owned by PlayArea) ──
  /** Terminal copy — its verdict shows as a permanent below-board pill at game-over. */
  over: TerminalCopy | null
  /** The own-action pill to show (a rejected guess / failed End), or null. */
  localPill: GenericFeedbackMsg | null

  // ── Clue panel ──
  isClueGiver: boolean
  isGuessPhase: boolean
  currentClue: ClueRow | null
  inSuddenDeath: boolean
  peer: Player | undefined
  /** Open / update / close the AI clue-suggestion dialog (state lives in PlayArea,
   *  which renders the panel high in the tree so react-rnd positions it on-screen). */
  onSuggestionChange: (state: SuggestState | null) => void
}) {
  // The guess move — a board click. Owned here (beside the board it gates). The
  // reveal arrives via realtime, so there's no optimistic state; the only own-move
  // feedback is an ERROR (a rejected guess), routed up via `onError`.
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  // In-flight guard against a double-guess. A synchronous ref, not the `pendingPos`
  // state, because it must block BEFORE any re-render: the tile's `disabled` gate
  // only follows setPendingPos → re-render, so it misses a same-tick double-tap on
  // the tile AND a click on a DIFFERENT tile while the first guess is still
  // committing (you shouldn't guess again until the reveal resolves).
  const guessInFlight = useRef(false)
  const handleGuess = useCallback(
    async (position: number) => {
      if (guessInFlight.current) return
      guessInFlight.current = true
      clearLocalFeedback()
      setPendingPos(position)
      const { error } = await db.rpc('submit_guess', {
        target_game: gameId,
        target_position: position,
      })
      setPendingPos(null)
      guessInFlight.current = false
      if (error) {
        console.error('submit_guess failed', error)
        onError(error.message)
      }
      // Success: the reveal arrives via Realtime → useBoard refetches → the tile
      // re-renders with its result color. No optimistic update, no flash.
    },
    [gameId, onError, clearLocalFeedback],
  )

  return (
    <div className={shared.boardCol}>
      <BoardGrid
        words={words}
        myKey={myKey}
        peerKey={peerKey}
        mySeat={mySeat}
        gameOver={gameOver}
        cellsClickable={cellsClickable && !viewing}
        pendingPos={pendingPos}
        onGuess={handleGuess}
        viewing={viewing}
        highlight={highlight}
      />
      {/* The below-board slot — codenamesduet's move-input zone
          (docs/design-decisions.md → BoardCol → belowBoard). Three states, all in the
          same fixed-height slot so the top-anchored board never shifts as it swaps:
            - terminal → a PERMANENT (fill, outcome-colored) <GenericFeedbackPill>
              carrying the verdict — the terminal state always also lands as local
              feedback, alongside the info-column outcome line;
            - own-action error → a transient (outline, error) pill for a beat (a
              rejected guess / failed End — the LOCAL half of the feedback split;
              turn-state changes go to the header pill);
            - else → the CluePanel (clue form / clue display + Pass / waiting). */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && styles.slotViewing)}>
          {/* Turn-viewer banner — while inspecting a past turn it overlays this
              below-board slot (the CluePanel / pill stays mounted underneath, so an
              in-progress clue survives). Opaque surface + yellow border = the shared
              "viewing history" marker; the description names the turn. Click anywhere
              (intrinsic to the viewer) / the ✕ returns to live. */}
          {viewing && viewingDescription && (
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
          {over ? (
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={{
                  tone:
                    over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
                  text: over.verdict,
                  variant: 'fill', // permanent → lightened-tone fill
                  dismiss: { kind: 'sticky' }, // never auto- or user-dismissed
                }}
                onClose={noop}
              />
            </div>
          ) : localPill ? (
            <div className={shared.localFeedback}>
              {/* Own-action flash is error-only here (a rejected guess / failed End);
                  the success path shows on the board + turn log instead. */}
              <GenericFeedbackPill msg={localPill} onClose={noop} />
            </div>
          ) : (
            <div className={styles.moveArea}>
              <CluePanel
                gameId={gameId}
                isClueGiver={isClueGiver}
                isGuessPhase={isGuessPhase}
                currentClue={currentClue}
                inSuddenDeath={inSuddenDeath}
                peer={peer}
                // Own-action errors → the shared below-board pill (via PlayArea's
                // onError). The AI clue suggestion opens its own draggable panel
                // (rendered at the .layout level) — the requester's helper output.
                onError={onError}
                onSuggestionChange={onSuggestionChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
