// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useTypedGuess } from '../hooks/useTypedGuess'
import { useMarkForeignGuesses } from '../hooks/useMarkForeignGuesses'
import type { GGameData, GHistoryView } from '../types'
import { Board } from './Board'
import styles from './PlayArea.module.css'

/**
 * wordiply's board column — the base (shown plainly), the guess board (with
 * the word-in-progress live in the active row), and an on-screen
 * `<GuessKeyboard>` below it so the game needs NO physical keyboard.
 *
 * It builds and sends the guess: the word being typed (`useTypedGuess`, from
 * either keyboard) and its trip to the server with its answer on the board
 * (`useSubmitGuess`); a teammate's word is marked too
 * (`useMarkForeignGuesses`).
 *
 * The keyboard slot doubles as the feedback area: the local slot's top
 * message sits above the keys (a rejection, "you're out", whose turn it is —
 * an accepted guess shows nothing, the row already shows the word + its
 * length), and at the end the same slot carries the verdict.
 */
export function BoardCol({
  gd,
  historyView,
  localFeedbackSlot,
}: {
  gd: GGameData
  historyView: GHistoryView
  /** PlayArea's below-board slot, drawn above the keyboard. A key, on screen or
   *  physical, is the player's next move, so it dismisses a gesture-cleared
   *  message. */
  localFeedbackSlot: FeedbackSlot
}) {
  // The move is mine — not the game over, my five spent, conceded, or a
  // teammate's turn — and the live board is the one on screen: a key then is
  // the history viewer's exit, and must not also type.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  const submission = useSubmitGuess({ gd, localFeedbackSlot })
  const entry = useTypedGuess({ submission, localFeedbackSlot, canType: isInteractive })
  useMarkForeignGuesses({
    gd,
    isViewingHistory: historyView.isViewing,
    answerMark: submission.answerMark,
  })

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <div className={styles.starterWord}>{gd.puzzle.base}</div>

      <Board
        grid={{ liveWords: gd.me.board.words, maxGuesses: gd.me.maxGuesses, base: gd.puzzle.base }}
        marks={{
          typedWord: submission.word,
          held: submission.answerMark.held,
          flash: submission.answerMark.flash,
        }}
        historyView={historyView}
        isInteractive={isInteractive}
      />

      {/* The shared banner overlays the input area while a past row is open —
          the keyboard and the pill stay mounted underneath, frozen to the eye
          (the viewer's click-away and keystroke exits do the rest). */}
      <div className={cls(styles.inputArea, historyView.isViewing && history.historyBannerHost)}>
        {historyView.isViewing && (
          <HistoryBanner
            label={historyView.label ?? ''}
            actor={historyView.actor}
            onExit={historyView.exit}
          />
        )}
        {/* One arrangement, played or finished: the keyboard stays at the end,
            disabled. Never branch here and unmount it — the column would rise
            by the ten-odd rem of cap rows at the frame a player is reading
            their verdict (the pill's slot reserves 3.6rem where the keyboard
            and its own slot take about 12.4rem). */}
        <div className={styles.kbFeedback}>
          <FeedbackPill slot={localFeedbackSlot} />
        </div>
        <GuessKeyboard
          onKey={entry.typeLetter}
          actSubmit={entry.actions.actSubmit}
          actDelete={entry.actions.actDeleteLast}
          disabled={!isInteractive}
        />
      </div>
    </div>
  )
}
