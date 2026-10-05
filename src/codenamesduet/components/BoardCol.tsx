// cs-blessed-codenamesduet

import { useCallback, useState } from 'react'
import { useSingleFlight } from '@/common/single-flight/useSingleFlight'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { runRpc } from '@/common/supabase/dbResult'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { db } from '../db'
import { BOARD_SHAPE } from '../lib/boardShape'
import { useBindAction } from '@/common/actions/useBindAction'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { Cell } from '@/common/board-cursor/stepCell'
import { Board } from './Board'
import { ClueStrip } from './ClueStrip'
import { StateLine } from './StateLine'
import type { GGameData, GHistoryView, GSuggestState, GTile } from '../types'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * What `submit_guess` answers. Four `ok`s: the two that end the game are
 * named for the play_state they set and carry its reason, and the two that
 * leave it running are named for what was turned over.
 *
 * `revealed` is the key the guess hit ('G' | 'N' | 'A'), one field
 * among the board facts the reveal produced.
 */
type GuessAnswer =
  | {
      result: 'agent' | 'bystander'
      revealed: 'G' | 'N'
      found_agents_count: number
      turn_number: number
      turns_remaining: number
      // Null once a bystander drops the game into sudden death, and for every
      // agent turned over there: nobody clues in sudden death.
      clue_giver: 'A' | 'B' | null
      play_state: 'playing' | 'sudden_death'
    }
  | {
      result: 'won' | 'lost'
      // The `status.reason` the ending wrote.
      reason: 'solved' | 'assassin' | 'turns'
      revealed: 'G' | 'N' | 'A'
      found_agents_count: number
      turns_used: number
    }

/**
 * codenamesduet's board column — the 5×5 `Board`, and under it the fixed-height
 * below-board slot: the `ClueStrip` during play, or the local slot's top message
 * (a not-ok, the ending's verdict), with the turn viewer's banner over either.
 *
 * A two-input game: a guess is a tile click — or the keyboard's pick and Enter
 * (`useBoardSelectionCursor`) — and this column owns `submit_guess` with the
 * pending tile it marks; a clue is the `ClueStrip` form, which owns
 * `submit_clue`, `pass_turn` and the AI suggestion. Neither owns game state —
 * the reveal arrives in the next blob, and PlayArea hands this column the board
 * to render, live or a viewed turn's. Not-oks show into PlayArea's local slot,
 * the one InfoCol's Stop shows into too. See docs/playarea.md.
 */
export function BoardCol({
  gd,
  tiles,
  historyView,
  partnerKeyShown,
  endingOutcome,
  localFeedbackSlot,
  onSuggestionChange,
}: {
  gd: GGameData
  // The board to draw — the live one or a viewed turn's (PlayArea picks).
  tiles: GTile[]
  historyView: GHistoryView
  // I asked to see my partner's key; the board draws it once the game has ended.
  partnerKeyShown: boolean
  // The ending's outcome, for the game-over frame's color; null while playing.
  endingOutcome: EndOutcome | null
  // PlayArea's below-board slot. This column and the clue strip show their
  // not-oks into it (a rejected guess / clue / pass), and while it holds
  // anything — a not-ok, the ending's verdict — the pill takes the clue
  // strip's place. A tile click is the player's next move, so it dismisses a
  // gesture-cleared message.
  localFeedbackSlot: FeedbackSlot
  // Open / update / close the AI clue-suggestion dialog; its state is PlayArea's.
  onSuggestionChange: (state: GSuggestState | null) => void
}) {
  const gameId = gd.id
  const suddenDeath = gd.team.suddenDeath
  // The move is mine: the server's pointer names me — or, in sudden death with
  // words on both sides, it names nobody and the rulebook lets either of us
  // guess, which one pointer cannot say.
  const isMyMove = gd.me.onTurn || (suddenDeath && gd.turns.holder === null && gd.me.stillPlaying)
  // The board takes my guess: the move is mine and it is a guess — the clue is
  // in, or it is sudden death. The clue-giver holds the move too, but their
  // move is the clue form, not the board.
  const isInteractive = isMyMove && (suddenDeath || gd.turns.currClue !== null)
  // Still playing, and the move is my partner's.
  const isWaitingForTurn = gd.me.stillPlaying && !isMyMove
  // The board frame flashes the moment the turn arrives — the same arrival the
  // page's bell rings on (the shared pointer), so the two land together.
  const myTurnJustStarted = useTurnStartFlash(gd.me.onTurn)
  // Guesses the server has recorded — the cause the attention flash reads.
  const moveCount = gd.events.filter((e) => e.kind === 'guess').length

  const isViewingHistory = historyView.isViewing
  // May I guess this tile now: the live board's answer, never a past turn's.
  const isGuessable = (position: number) => gd.team.board.tiles[position]?.guessable ?? false

  // The guess move — a board click. The reveal arrives by realtime, so there is
  // no optimistic state; the only own-move feedback is a not-ok, shown into the
  // slot.
  //
  // The position I last guessed, or null. It outlives the guess: nothing clears
  // it when the reveal lands, so what is still in flight is derived below.
  const [submittedPos, setSubmittedPos] = useState<number | null>(null)
  // Its reveal is on the board. Every accepted guess writes the tile — an agent,
  // the assassin, or my own bystander mark — so it stops being guessable for me.
  const submittedLanded = submittedPos !== null && !isGuessable(submittedPos)
  // The tile with the server, which Board dims and disables; null when nothing
  // is out. Held until the REVEAL lands rather than until the RPC resolves: the
  // reply and the reveal are two separate events, and releasing at the first
  // would flash an undecided tile back to normal, clickable again.
  //
  // A past turn's snapshot cannot hold a reveal newer than it, which the
  // `<Board>` call below gates on `isViewingHistory`; a restart needs no gate,
  // because the page unmounts this whole surface when the run changes
  // (common/game-page/doc.md).
  const inFlightPos = submittedLanded ? null : submittedPos
  const submitGuess = useCallback(
    async (position: number) => {
      localFeedbackSlot.dismiss() // a click is the next move
      setSubmittedPos(position)
      const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
        p_game_id: gameId,
        p_guess_position: position,
      }))
      // Four answers, and every one of them says nothing here: each is a
      // REVEAL, and the reveal arrives in the next blob → the tile
      // re-renders in its result color. No optimistic
      // update, no flash, and a pill would only repeat the board.
      //
      // The refusals are the opposite — nothing on the board changes, so this
      // is the only place they can be said, and no reveal is coming to release
      // the tile. Most of them are races (orange): the board and the turn state
      // arrive by subscription, and in sudden death the partner is guessing at
      // the same time as you.
      if (res.type === 'not-ok') {
        setSubmittedPos(null)
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'agent') {
        return
      } else if (res.type === 'ok' && res.data.result === 'bystander') {
        return
      } else if (res.type === 'ok' && res.data.result === 'won') {
        // The ending's verdict is PlayArea's: it reads the ending off `gd` and
        // shows the verdict into the slot (and pops the celebration). Saying
        // it here as well would say it twice.
        return
      } else if (res.type === 'ok' && res.data.result === 'lost') {
        return
      } else {
        // Nothing named this answer, so the tile must not keep claiming to be
        // in flight — there is no reveal coming that would release it.
        setSubmittedPos(null)
        reportUnhandled('submit_guess', res)
        return
      }
    },
    [gameId, localFeedbackSlot],
  )

  // Guards a non-idempotent request from firing twice; see `useSingleFlight`.
  // A tile's `disabled` can't do it: that follows `inFlightPos` → re-render, so
  // it misses a same-tick double-tap, and a click on a DIFFERENT tile while the
  // first guess commits. From the reply until the reveal lands, `inFlightPos`
  // itself holds the next guess back (handleTileClick, act-submit).
  const [handleGuess] = useSingleFlight(submitGuess)

  // ─── The keyboard ──────────────────────────────────────
  // The selection cursor: arrows move it over the words, Space PICKS the word
  // under it, and Enter guesses the pick. A click still guesses at once — the
  // pointer's aim is its confirmation — but an arrow can land a cell off, and a
  // guess can be the assassin, so the keyboard confirms with a second key.

  // May I guess right now? Never over a past turn.
  const canGuess = isInteractive && !isViewingHistory

  // The word the keyboard has picked — a board position — shown only while it
  // can still be guessed: a turn that ends, or a partner who turns it over in
  // sudden death, takes the pick away without anything having to clear it.
  const [pickedAt, setPickedAt] = useState<number | null>(null)
  const picked = canGuess && pickedAt !== null && isGuessable(pickedAt) ? pickedAt : null

  // Space toggles, so a second press un-picks and a press elsewhere moves the
  // pick. A word the click couldn't guess can't be picked either.
  function toggleAt(cell: Cell) {
    const position = positionAt(cell.x, cell.y, BOARD_SHAPE.numCols)
    if (!isGuessable(position)) return
    localFeedbackSlot.dismiss() // a pick is the next move
    setPickedAt(picked === position ? null : position)
  }

  const { cell: cursor, setTo: setCursorTo } = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: canGuess,
    onToggle: toggleAt,
  })

  // A tile click: the cursor moves there, hidden, any pick goes, and the
  // click is the guess — unless one is still out, since you shouldn't guess
  // again until its reveal lands.
  function handleTileClick(position: number) {
    if (inFlightPos !== null) return
    setCursorTo(cellAt(position, BOARD_SHAPE.numCols))
    setPickedAt(null)
    void handleGuess(position)
  }

  // Enter guesses the pick. Key-only — the click is the board's own guess
  // button — so the action names itself for the key list, and it hides when I
  // am not the one guessing.
  useBindAction('act-submit', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return { state: picked !== null && inFlightPos === null ? 'active' : 'disabled', label: 'Guess' }
    },
    run: () => {
      if (picked === null) return
      setPickedAt(null)
      void handleGuess(picked)
    },
  })

  // ⌫ un-picks.
  useBindAction('act-clear-picks', {
    describe: () => {
      if (!canGuess) return 'hidden'
      return picked !== null ? 'active' : 'disabled'
    },
    run: () => setPickedAt(null),
  })

  // Whatever the slot holds on top takes the clue strip's place; an empty
  // slot hands it back.
  const top = useWatchAndGetTopFeedbackMsg(localFeedbackSlot)

  return (
    <div className={shared.boardCol}>
      {/* The live readout above the board, on a phone only; see `MobileStatusBar`. */}
      <MobileStatusBar>
        <StateLine data={gd.stateLineData} />
      </MobileStatusBar>
      <Board
        tiles={tiles}
        me={gd.me}
        partner={gd.partner}
        showsPartnerKey={gd.ended && partnerKeyShown}
        isInteractive={isInteractive}
        inFlightPos={isViewingHistory ? null : inFlightPos}
        onGuess={handleTileClick}
        cursor={cursor}
        picked={picked}
        isViewingHistory={isViewingHistory}
        litTileIds={historyView.litTileIds}
        isWaitingForTurn={isWaitingForTurn}
        myTurnJustStarted={myTurnJustStarted}
        moveCount={moveCount}
        endingOutcome={endingOutcome}
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
            <HistoryBanner label={historyView.label} onExit={historyView.exit} />
          )}
          {top !== null ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
          ) : (
            <div className={styles.moveArea}>
              <ClueStrip
                gameId={gameId}
                isClueGiver={gd.me.clueGiver}
                isGuessPhase={gd.turns.currClue !== null}
                currentClue={gd.turns.currClue}
                inSuddenDeath={suddenDeath}
                partner={gd.partner}
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
