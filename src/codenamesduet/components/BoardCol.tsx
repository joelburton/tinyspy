// cs-blessed-codenamesduet

import { useCallback, useState, type ReactNode } from 'react'
import { useSingleFlight } from '@/common/single-flight/useSingleFlight'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import { runRpc } from '@/common/supabase/dbResult'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import type { Outcome } from '@/common/outcomes/outcomes'
import { db } from '../db'
import type { WordRow } from '../hooks/useBoard'
import type { ClueEvent } from '../lib/events'
import type { Player } from '../lib/seats'
import type { KeyLabel } from '../lib/labels'
import { isGuessable, type Seat } from '../lib/phase'
import { BOARD_SHAPE, cellAt, positionAt } from '../lib/boardShape'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { Cell } from '@/common/board-cursor/stepCell'
import { Board } from './Board'
import { ClueStrip, type SuggestState } from './ClueStrip'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
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
      // Null once a bystander drops the game into sudden death, and for every
      // agent turned over there: nobody clues in sudden death.
      clue_giver: Seat | null
      play_state: 'playing' | 'sudden_death'
    }
  | {
      result: 'won' | 'lost_assassin' | 'lost_clock'
      revealed: 'G' | 'N' | 'A'
      greens_found: number
      turns_used: number
    }

/**
 * codenamesduet's board column — the 5×5 `Board`, and under it the fixed-height
 * below-board slot: the `ClueStrip` during play, or the local slot's top message
 * (a not-ok, the terminal verdict), with the turn viewer's banner over either.
 *
 * A two-input game: a guess is a tile click — or the keyboard's pick and Enter
 * (`useBoardSelectionCursor`) — and this column owns `submit_guess` with the
 * pending tile it marks; a clue is the `ClueStrip` form, which owns
 * `submit_clue`, `pass_turn` and the AI suggestion. Neither owns game state —
 * the reveal arrives by Realtime, and PlayArea hands this column the board to
 * render, live or a viewed turn's snapshot. Not-oks show into PlayArea's local
 * slot, the one InfoCol's End shows into too. See docs/playarea.md.
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
  historyLitTiles,
  // ── Board marks ──
  notMyTurn,
  myTurnJustStarted,
  moveCount,
  terminalOutcome,
  // ── History viewer (its overlay lives in the below-board region) ──
  historyLabel,
  onExitHistory,
  // ── Guess dispatch (this column owns submit_guess) ──
  gameId,
  localFeedbackSlot,
  // ── Clue strip (the clue-giver's below-board form) ──
  isClueGiver,
  isGuessPhase,
  currentClue,
  inSuddenDeath,
  peer,
  onSuggestionChange,
}: {
  // ── Mobile-only status strip ──
  // The `<StateLine>` the InfoCol also renders, shown above the board only on a
  // phone; see `<MobileStatusBar>`.
  mobileStatus: ReactNode

  // ── Board to render ──
  // The 25 board words — the live board OR a snapshot's reveal state (PlayArea picks).
  words: WordRow[]
  // The caller's own key view.
  myKey: KeyLabel[]
  // The partner's key view — null until the caller chooses to see it.
  peerKey: KeyLabel[] | null
  // The caller's seat.
  mySeat: Seat
  gameOver: boolean
  // The board gate (glossary `readOnly`): tiles are inert. Derived in PlayArea
  // from the phase; this column ORs in `isViewingHistory` before handing the
  // leaf `<Board>` its `cellsClickable`.
  readOnly: boolean
  // The positions the viewed turn decided — ringed (undefined while live).
  historyLitTiles: ReadonlySet<number> | undefined

  // ── Board marks ── straight through to `<Board>`; see its props.
  notMyTurn: boolean
  myTurnJustStarted: boolean
  moveCount: number
  terminalOutcome: Outcome | null

  // The viewed turn's description while inspecting history (drives the banner), or
  // null when live.
  historyLabel: string | null
  // Return to the live board (the banner click / ✕).
  onExitHistory: () => void

  // ── Guess dispatch ──
  gameId: string
  // PlayArea's below-board slot. This column and the clue strip show their
  // not-oks into it (a rejected guess / clue / pass), and while it holds
  // anything — a not-ok, the terminal verdict — the pill takes the clue
  // strip's place. A tile click is the player's next move, so it dismisses a
  // gesture-cleared message.
  localFeedbackSlot: FeedbackSlot

  // ── Clue strip ──
  isClueGiver: boolean
  isGuessPhase: boolean
  currentClue: ClueEvent | null
  inSuddenDeath: boolean
  peer: Player | undefined
  // Open / update / close the AI clue-suggestion dialog; its state is PlayArea's.
  onSuggestionChange: (state: SuggestState | null) => void
}) {
  // Viewing a past turn ⟺ there is one open (docs/playarea.md → Prop
  // conventions: one prop says so, and the flag is derived, never passed).
  const isViewingHistory = historyLabel !== null
  // The positive of the `readOnly` gate, which is what the leaf `<Board>` takes.
  const cellsClickable = !readOnly

  // The guess move — a board click. The reveal arrives by realtime, so there is
  // no optimistic state; the only own-move feedback is a not-ok, shown into the
  // slot. `pendingPos` says WHICH tile is committing — Board marks that one
  // pending and disables it — so the single-flight flag below can't stand in
  // for it.
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

  // ─── The keyboard ──────────────────────────────────────
  // The selection cursor: arrows move it over the words, Space PICKS the word
  // under it, and Enter guesses the pick. A click still guesses at once — the
  // pointer's aim is its confirmation — but an arrow can land a cell off, and a
  // guess can be the assassin, so the keyboard confirms with a second key.

  // May I guess right now? The phase's answer, and never over a past turn.
  const canGuess = cellsClickable && !isViewingHistory

  // The word the keyboard has picked — a board position — shown only while it
  // can still be guessed: a turn that ends, or a partner who turns it over in
  // sudden death, takes the pick away without anything having to clear it.
  const [pickedAt, setPickedAt] = useState<number | null>(null)
  const pickedWord = pickedAt === null ? undefined : words[pickedAt]
  const picked =
    canGuess && pickedAt !== null && pickedWord !== undefined && isGuessable(pickedWord, mySeat)
      ? pickedAt
      : null

  // Space toggles, so a second press un-picks and a press elsewhere moves the
  // pick. A word the click couldn't guess can't be picked either.
  function toggleAt(cell: Cell) {
    const position = positionAt(cell.x, cell.y)
    const word = words[position]
    if (word === undefined || !isGuessable(word, mySeat)) return
    localFeedbackSlot.dismiss() // a pick is the next move
    setPickedAt(picked === position ? null : position)
  }

  const { point } = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: canGuess,
    onToggle: toggleAt,
  })

  // A tile click: the cursor moves there, hidden, any pick goes, and the
  // click is the guess.
  function handleTileClick(position: number) {
    point(cellAt(position))
    setPickedAt(null)
    void handleGuess(position)
  }

  // Enter guesses the pick. Key-only — the click is the board's own guess
  // button — so the action names itself for the key list, and it hides when I
  // am not the one guessing.
  useBoundAction('act-submit', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return { state: picked !== null && pendingPos === null ? 'active' : 'disabled', label: 'Guess' }
    },
    run: () => {
      if (picked === null) return
      setPickedAt(null)
      void handleGuess(picked)
    },
  })

  // ⌫ un-picks.
  useBoundAction('act-clear-selection', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return picked !== null ? 'active' : 'disabled'
    },
    run: () => setPickedAt(null),
  })

  // Whatever the slot holds on top takes the clue strip's place; an empty
  // slot hands it back.
  const top = useTopFeedbackMessage(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      {/* The live readout above the board, on a phone only; see `MobileStatusBar`. */}
      <MobileStatusBar>{mobileStatus}</MobileStatusBar>
      <Board
        words={words}
        myKey={myKey}
        peerKey={peerKey}
        mySeat={mySeat}
        gameOver={gameOver}
        cellsClickable={cellsClickable && !isViewingHistory}
        pendingPos={pendingPos}
        onGuess={handleTileClick}
        isViewingHistory={isViewingHistory}
        historyLitTiles={historyLitTiles}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        moveCount={moveCount}
        terminalOutcome={terminalOutcome}
      />
      {/* The below-board slot (docs/playarea.md → Board sizing). Two states in
          one fixed-height slot, so the board above never shifts as they swap:
          the slot's pill when it holds anything — a not-ok, the verdict — else
          the ClueStrip. */}
      <div className={styles.belowBoard}>
        <div className={cls(shared.moveAreaOrLocalFeedback, isViewingHistory && history.historyBannerHost)}>
          {/* The shared banner overlays this below-board slot while a past turn is
              open — the ClueStrip / pill stays mounted underneath, so an in-progress
              clue survives. */}
          {isViewingHistory && (
            <HistoryBanner label={historyLabel} onExit={onExitHistory} />
          )}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
          ) : (
            <div className={styles.moveArea}>
              <ClueStrip
                gameId={gameId}
                isClueGiver={isClueGiver}
                isGuessPhase={isGuessPhase}
                currentClue={currentClue}
                inSuddenDeath={inSuddenDeath}
                peer={peer}
                // Its not-oks go into the same slot.
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
