// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useTypedGuess } from '../hooks/useTypedGuess'
import { makeKeyColors } from '../lib/colors'
import { BOARD_ROWS } from '../lib/setup'
import { Board } from './Board'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView } from '../types'

/**
 * wordleone's board column — the `<Board>` plus the region under it: the
 * turn-viewer banner, the local-feedback pill slot, and the on-screen keyboard.
 * It builds and sends the guess: the word being typed (`useTypedGuess`, from
 * either keyboard) and the one out with the server (`useSubmitGuess`). See
 * docs/playarea.md.
 */
export function BoardCol({
  gd,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
  solution,
}: {
  gd: GGameData
  historyView: GHistoryView
  localFeedbackSlot: FeedbackSlot
  // True for a beat as the turn becomes mine — the frame flashes yellow.
  myTurnJustStarted: boolean
  // The answer while I have it revealed, else null.
  solution: string | null
}) {
  const submission = useSubmitGuess({
    gameId: gd.id,
    liveRows: gd.me.board.rows,
    localFeedbackSlot,
  })
  // The move is mine, and no guess of mine is still out.
  const canGuess = gd.me.onTurn && submission.inFlight === null
  // …and the live board is the one on screen: a key then is the viewer's exit,
  // and must not also type.
  const canType = canGuess && !historyView.isViewing
  const entry = useTypedGuess({
    localFeedbackSlot,
    canType,
    submitGuess: submission.send,
  })

  // ─── Render ────────────────────────────────────────────

  // The word still out belongs to the live board only.
  const shownInFlightWord = historyView.isViewing ? null : submission.inFlight

  // A revealed answer sits in the second row, all green, on a board I did not
  // solve — without the flip, which is for a word guessed. The keyboard keeps
  // what I earned, so it reads the board's own rows.
  const revealedRow = solution !== null && gd.me.board.rows.length < BOARD_ROWS
    ? { word: solution, colors: 'ggggg' }
    : null

  return (
    <div className={shared.boardCol}>
      <Board
        grid={{ liveRows: gd.me.board.rows, revealedRow, maxGuesses: BOARD_ROWS }}
        marks={{
          typedWord: entry.word,
          inFlightWord: shownInFlightWord,
          refusedGuessMark: submission.refusedMark,
          // Bands the board once I have ended: the game's ending, or mine
          // while the others play on.
          endingOutcome: gd.me.outcome,
          isWaitingForTurn: gd.me.waitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        canType={canType}
        brand={gd.brand}
      />
      {/* The below-board region. The feedback slot sits BETWEEN the board and
          the keyboard, both of which are always present, and `.localFeedback`
          reserves its own height so neither reflows as the slot's top message
          comes and goes. */}
      <div className={styles.belowBoard}>
        {/* The banner overlays the whole region while a past turn is open: the
            slot and the keyboard stay mounted underneath, capture frozen. */}
        {historyView.label !== null && (
          <HistoryBanner
            label={historyView.label}
            actor={historyView.actor}
            onExit={historyView.exit}
          />
        )}
        <div className={shared.localFeedback}>
          <FeedbackPill slot={localFeedbackSlot} />
        </div>
        <div className={styles.moveArea}>
          {/* Stays once the game has ended, disabled. Its caps hold the color
              every letter earned from the board — the starter's, and the
              solve's once it lands; a miss earns nothing. */}
          <GuessKeyboard
            keyColors={makeKeyColors(gd.me.board.rows)}
            onKey={entry.typeLetter}
            actSubmit={entry.actions.actSubmit}
            actDelete={entry.actions.actDeleteLast}
            disabled={!canGuess}
          />
        </div>
      </div>
    </div>
  )
}
