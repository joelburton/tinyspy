// cs-fixed-outcome-fix

import { useCallback } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { useCaptureKeys, asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { useArrowHistory } from '@/common/word-entry/useArrowHistory'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useMarkForeignGuesses } from '../hooks/useMarkForeignGuesses'
import type { GGameData, GHistoryView } from '../types'
import { GuessBoard } from './GuessBoard'
import styles from './PlayArea.module.css'

/** A generous cap on a single guess (the longest possible words are ~30). */
const MAX_LEN = 28

/**
 * wordiply's board column — the base (shown plainly), the guess board (with
 * the word-in-progress live in the active row), and an on-screen
 * `<GuessKeyboard>` below it so the game needs NO physical keyboard (a
 * physical one still works via `useCaptureKeys`, feeding the same word state).
 *
 * It owns the move (`useSubmitGuess`) and the answer marks on the board's
 * lines, a teammate's included (`useMarkForeignGuesses`).
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
  const { entry, answerMark } = useSubmitGuess({ gd, localFeedbackSlot })
  useMarkForeignGuesses({ gd, isViewingHistory: historyView.isViewing, answerMark })

  // Input freezes whenever the move is not mine: the game over, my five
  // guesses spent, conceded, or a teammate's turn.
  const isEntryDisabled = !gd.me.onTurn

  // On-screen key → append/backspace (updater form, so it reads the latest
  // word); each edit dismisses a sticky reject.
  const setWord = entry.setWord
  const typeLetter = useCallback(
    (ch: string) => {
      localFeedbackSlot.dismiss()
      setWord((w) => (w.length < MAX_LEN ? w + ch.toLowerCase() : w))
    },
    [localFeedbackSlot, setWord],
  )
  // Physical keyboard (desktop convenience) drives the SAME word + submit — and
  // hands back the two actions the ⌫ and Enter caps below place, so a cap and
  // its key are one thing. (No `backspace` twin: `act-delete-last` already
  // dismisses the sticky reject on its way through.)
  const { actDeleteLast, actSubmit } = useCaptureKeys({
    pendingText: entry.word,
    onChange: entry.setWord,
    onSubmit: entry.submit,
    disabled: isEntryDisabled,
    onAnyKey: localFeedbackSlot.dismiss,
    charFor: asciiLetters(),
    maxLength: MAX_LEN,
  })
  // ArrowUp recalls the last guess, ArrowDown clears — handy here since the
  // next guess is often the last one plus a letter.
  useArrowHistory({ recall: entry.lastWord, onChange: entry.setWord, disabled: isEntryDisabled })

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <div className={styles.starterWord}>{gd.puzzle.base.toUpperCase()}</div>

      <GuessBoard
        base={gd.puzzle.base}
        words={historyView.words ?? gd.me.board.words}
        maxGuesses={gd.me.maxGuesses}
        activeWord={entry.word}
        // Nothing is being typed into a past board — the live entry row would
        // otherwise draw over the moment being replayed.
        showActive={!isEntryDisabled && !historyView.isViewing}
        held={historyView.isViewing ? null : answerMark.held}
        flash={historyView.isViewing ? null : answerMark.flash}
        isViewingHistory={historyView.isViewing}
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
          onKey={typeLetter}
          actSubmit={actSubmit}
          actDelete={actDeleteLast}
          disabled={isEntryDisabled}
        />
      </div>
    </div>
  )
}
