// cs-blessed-wordle

import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useTypedGuess } from '../hooks/useTypedGuess'
import type { BoardRow } from '../lib/board'
import { makeKeyColors } from '../lib/colors'
import { Board } from './Board'
import styles from './BoardCol.module.css'

/**
 * wordle's board column — the `<Board>` plus the region under it: the
 * turn-viewer banner, the local-feedback pill slot, and the on-screen keyboard.
 * It builds and sends the guess: the word being typed (`useTypedGuess`, from
 * either keyboard) and the one out with the server (`useSubmitGuess`). See
 * docs/playarea.md.
 */
export function BoardCol({
  gd,
  historyView,
  brand,
  localFeedbackSlot,
  endingOutcome,
  myTurnJustStarted,
}: {
  gd: GameData
  historyView: HistoryView
  // Brand name (manifest) for the grid's `aria-label`, a test handle.
  brand: string
  localFeedbackSlot: FeedbackSlot
  // The ending that applies to me — bands the board in its outcome, and the
  // keyboard goes with it. Null while I play.
  endingOutcome: EndOutcome | null
  // True for a beat as the turn becomes mine — the frame flashes yellow.
  myTurnJustStarted: boolean
}) {
  // A past turn on screen blocks every write to the board.
  const isViewingHistory = historyView.isViewing

  // The live board: every guess on coop's shared board, my own in compete.
  const liveRows: BoardRow[] = gd.boardGuesses.map((g) => ({ guess: g.word, colors: g.colors }))

  const { submitGuess, inFlightWord, refusedGuessMark } = useSubmitGuess({
    gameId: gd.gameId,
    liveRows,
    localFeedbackSlot,
  })
  // The game lets me guess, and no guess of mine is still out.
  const canGuess = gd.standing.isBoardInteractive && inFlightWord === null
  // …and the live board is the one on screen.
  const canType = canGuess && !isViewingHistory
  const { typedWord, typeLetter, actDeleteLast, actSubmit } = useTypedGuess({
    localFeedbackSlot,
    canType,
    submitGuess,
  })

  // ─── Render ────────────────────────────────────────────

  // The word still out belongs to the live board only.
  const shownInFlightWord = isViewingHistory ? null : inFlightWord

  return (
    <div className={shared.boardCol}>
      <Board
        grid={{ liveRows, maxGuesses: gd.readout.maxGuesses }}
        marks={{
          typedWord,
          inFlightWord: shownInFlightWord,
          refusedGuessMark,
          endingOutcome,
          isWaitingForTurn: gd.standing.isWaitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        canType={canType}
        brand={brand}
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
              every letter earned, the record of the game just played. */}
          <GuessKeyboard
            keyColors={makeKeyColors(liveRows)}
            onKey={typeLetter}
            actSubmit={actSubmit}
            actDelete={actDeleteLast}
            disabled={!canGuess}
          />
        </div>
      </div>
    </div>
  )
}
