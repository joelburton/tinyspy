// cs-unmet

import { useCallback, useState, type ReactNode } from 'react'
import { useSingleFlight } from '@/common/single-flight/useSingleFlight'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import { runRpc } from '@/common/supabase/dbResult'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { db } from '../db'
import type { WordRow } from '../hooks/useBoard'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import { Board } from './Board'
import { CluePanel, type SuggestState } from './CluePanel'
import shared from '@/common/game-page/PlayArea.module.css'
import history from '@/common/turn-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * What `submit_guess` answers. Five `ok`s: the three that end the game are
 * named for the play_state they set, and the two that leave it running are
 * named for what was turned over.
 *
 * `revealed` is the key-card label the guess hit ('G' | 'N' | 'A'), one field
 * among the board facts the reveal produced.
 */
type GuessAnswer =
  | {
      result: 'agent' | 'bystander'
      revealed: 'G' | 'N'
      greens_found: number
      turn_number: number
      turns_remaining: number
      clue_giver: Seat
      play_state: 'playing' | 'sudden_death'
    }
  | {
      result: 'won' | 'lost_assassin' | 'lost_clock'
      revealed: 'G' | 'N' | 'A'
      greens_found: number
      turns_used: number
    }

/**
 * codenamesduet's board column — the 5×5 `Board` plus the fixed-height
 * below-board slot under it (the turn-viewer banner, the CluePanel during play, or
 * the local feedback slot's top message — a not-ok, the terminal verdict).
 *
 * This is codenamesduet's **input engine**, and it's a two-input game: guessing is a
 * board click (a tile → `submit_guess`) and cluing is the below-board `CluePanel`
 * form (which owns `submit_clue` / `pass_turn` / the AI suggest itself). So this
 * column owns the **guess** RPC directly — the guess has no deep entangled state (the
 * reveal arrives via realtime), but keeping the `pendingPos` + in-flight guard beside
 * the board it gates is the natural home — while `CluePanel` keeps the clue RPCs.
 * Like the other games' BoardCol it does NOT own the game state: PlayArea hands it
 * **the board to render** (live OR a historical snapshot) + `viewing`, which is what
 * makes the turn-history viewer a drop-in. Not-oks show into PlayArea's local
 * slot (the slot InfoCol's End shows into too), and the AI-suggestion dialog
 * state lives in PlayArea (it must mount high in the tree). See docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status strip (above the board) ──
  mobileStatus,
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  words,
  myKey,
  peerKey,
  mySeat,
  gameOver,
  readOnly,
  highlight,
  // ── History viewer (its overlay lives in the below-board region) ──
  viewing,
  viewingDescription,
  onExitViewing,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  localFeedbackSlot,
  // ── Clue panel (the clue-giver's below-board form) ──
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  onSuggestionChange,
}: {
  // ── Mobile-only status strip ──
  /** The core state readout (the `<StateLine>` the InfoCol also renders), shown
   *  above the board ONLY below the `--mobile` breakpoint — where the info
   *  column is off-canvas in the InfoSheet and would otherwise take a tap to
   *  read. Hidden by CSS on desktop; see `<MobileStatusBar>`. */
  mobileStatus: ReactNode

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
  /** The board-gate (glossary `readOnly`): tiles are inert. Derived in PlayArea
   *  from the phase (`!derivePhase().cellsClickable`); this column ORs in
   *  `viewing` before handing the leaf `<Board>` its `cellsClickable`. */
  readOnly: boolean
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
  /** PlayArea's below-board slot. This column and the clue panel show their
   *  not-oks into it (a rejected guess / clue / pass), and while it holds
   *  anything — a not-ok, the terminal verdict — the pill takes the clue
   *  panel's place. A tile click is the player's next move, so it dismisses a
   *  gesture-cleared message. */
  localFeedbackSlot: FeedbackSlot

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
  // Phase-clickability, the positive of the `readOnly` gate. Reintroduced (rather
  // than flipping every internal use) so the leaf `<Board>`'s `cellsClickable`
  // prop + the `viewing` interplay below stay byte-identical — the prop-name
  // unification can't change behavior.
  const cellsClickable = !readOnly

  // The guess move — a board click. Owned here (beside the board it gates). The
  // reveal arrives via realtime, so there's no optimistic state; the only own-move
  // feedback is a NOT-OK (a rejected guess), shown into the slot.
  //
  // `pendingPos` says WHICH tile is committing — Board marks that one pending
  // and disables it — so the single-flight flag below can't stand in for it.
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const submitGuess = useCallback(
    async (position: number) => {
      localFeedbackSlot.dismiss() // a click is the next move
      setPendingPos(position)
      const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
        target_game: gameId,
        target_position: position,
      }))
      setPendingPos(null)
      // Five answers, and every one of them says nothing here: each is a
      // REVEAL, and the reveal arrives via Realtime → useBoard
      // refetches → the tile re-renders in its result color. No optimistic
      // update, no flash, and a pill would only repeat the board.
      //
      // The refusals are the opposite — nothing on the board changes, so this
      // is the only place they can be said. Most of them are races (orange):
      // the tiles unlock on this reply while the board and the turn state
      // arrive by subscription, and in sudden death the partner is guessing at
      // the same time as you.
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'agent') {
        return
      } else if (res.type === 'ok' && res.data.result === 'bystander') {
        return
      } else if (res.type === 'ok' && res.data.result === 'won') {
        // The terminal verdict is PlayArea's: it reads the new play_state and
        // shows the verdict into the slot (and pops the celebration). Saying
        // it here as well would say it twice.
        return
      } else if (res.type === 'ok' && res.data.result === 'lost_assassin') {
        return
      } else if (res.type === 'ok' && res.data.result === 'lost_clock') {
        return
      } else {
        reportUnhandled('submit_guess', res)
        return
      }
    },
    [gameId, localFeedbackSlot],
  )

  // Guards a non-idempotent request from firing twice; see `useSingleFlight`.
  // A tile's `disabled` can't do it: that follows `pendingPos` → re-render, so
  // it misses a same-tick double-tap, and a click on a DIFFERENT tile while the
  // first guess commits (you shouldn't guess again until the reveal resolves).
  const [handleGuess] = useSingleFlight(submitGuess)

  // Whatever the slot holds on top takes the clue panel's place; an empty
  // slot hands it back.
  const top = useTopFeedbackMessage(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the live agents/turns readout, above the board. It's a fixed-height
          row, so on a phone the board is that much shorter — the deliberate
          trade for keeping the core state on the play surface. */}
      <MobileStatusBar>{mobileStatus}</MobileStatusBar>
      <Board
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
          (docs/playarea.md → Board sizing). Two states, in the same
          fixed-height slot so the top-anchored board never shifts as it swaps:
            - the slot holds something → its pill: the filled verdict at
              terminal (the terminal state always also lands as local feedback,
              alongside the info-column outcome line), or a not-ok (a rejected
              guess / clue / pass / failed End — the LOCAL half of the feedback
              split; turn-state changes go to the header);
            - else → the CluePanel (clue form / clue display + Pass / waiting). */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, viewing && history.bannerHost)}>
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
          {top !== null ? (
            <div className={shared.localFeedback}>
              {/* Own-action feedback is not-ok-only here (a rejected guess /
                  failed End); the success path shows on the board + turn log
                  instead. */}
              <FeedbackPill slot={localFeedbackSlot} />
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
                // Its not-oks go into the same slot. The AI clue suggestion
                // opens its own draggable panel (rendered at the .layout level)
                // — the requester's helper output.
                localFeedbackSlot={localFeedbackSlot}
                onSuggestionChange={onSuggestionChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
