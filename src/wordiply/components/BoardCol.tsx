// cs-unmet

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { GuessKeyboard } from '@/shared/onscreen-keyboard/GuessKeyboard'
import { useCaptureKeys, asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { useArrowHistory } from '@/common/word-entry/useArrowHistory'
import { GuessBoard } from './GuessBoard'
import shared from '@/common/game-page/playArea.module.css'
import type { Outcome } from '@/common/outcomes/outcomes'
import styles from './PlayArea.module.css'

/** A generous cap on a single guess (the longest possible words are ~30). */
const MAX_LEN = 28

/**
 * wordiply's board column — the base (shown plainly), the five-row
 * `<GuessBoard>` (with the word-in-progress live in the active row), and an
 * on-screen `<GuessKeyboard>` below it so the game needs NO physical
 * keyboard (a physical one still works via `useCaptureKeys`, feeding the
 * same word state).
 *
 * The keyboard slot doubles as the feedback area: the local slot's top
 * message sits above the keys (a rejection, "you're out", whose turn it is —
 * an accepted guess shows nothing, the row already shows the word + its
 * length), and at terminal the keyboard goes and the same slot fills its
 * place with the verdict.
 */
export function BoardCol({
  base,
  guesses,
  word,
  onChange,
  onSubmit,
  localFeedbackSlot,
  lastWord,
  entryDisabled,
  isTerminal,
  held,
  flash,
}: {
  base: string
  guesses: { word: string; length: number }[]
  /** My own accepted word, drawn until the server's row lands — see
   *  `<GuessBoard>`. */
  held: { word: string; length: number; awaitingRow: boolean } | null
  /** The answer being shown on the row that word is in, for a beat. */
  flash: { word: string; outcome: Outcome; attention: boolean } | null
  word: string
  onChange: Dispatch<SetStateAction<string>>
  onSubmit: () => void
  /** PlayArea's below-board slot — drawn above the keyboard during play and
   *  in the keyboard's place at terminal. A key, on screen or physical, is
   *  the player's next move, so it dismisses a gesture-cleared message. */
  localFeedbackSlot: FeedbackSlot
  /** The last submitted guess — ArrowUp recalls it (the next guess is often the
   *  previous one with another letter). */
  lastWord: string
  /** Freeze input (terminal / conceded / out of guesses). */
  entryDisabled: boolean
  /** Game over for everyone: the keyboard leaves and the slot takes its place. */
  isTerminal: boolean
}) {
  // On-screen key → append/backspace (updater form, so it reads the latest
  // word); each edit dismisses a sticky reject.
  const typeLetter = useCallback(
    (ch: string) => {
      localFeedbackSlot.dismiss()
      onChange((w) => (w.length < MAX_LEN ? w + ch.toLowerCase() : w))
    },
    [localFeedbackSlot, onChange],
  )
  // Physical keyboard (desktop convenience) drives the SAME word + submit — and
  // hands back the two bindings the ⌫ and Enter caps below place, so a cap and
  // its key are one thing. (No `backspace` twin: `act-delete-last` already
  // dismisses the sticky reject on its way through.)
  const { actDeleteLast, actSubmitEntry } = useCaptureKeys({
    value: word,
    onChange,
    onSubmit,
    disabled: entryDisabled,
    onAnyKey: localFeedbackSlot.dismiss,
    charFor: asciiLetters('lower'),
    maxLength: MAX_LEN,
  })
  // ArrowUp recalls the last guess, ArrowDown clears — handy here since the
  // next guess is often the last one plus a letter (the shared history hook,
  // the same one <EntryRow> uses).
  useArrowHistory({ recall: lastWord, onChange, enabled: !entryDisabled })

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <div className={styles.starterWord}>{base.toUpperCase()}</div>

      <GuessBoard
        base={base}
        guesses={guesses}
        activeWord={word}
        showActive={!entryDisabled}
        held={held}
        flash={flash}
      />

      <div className={styles.inputArea}>
        {isTerminal ? (
          <div className={styles.verdictSlot}>
            <FeedbackPill slot={localFeedbackSlot} />
          </div>
        ) : (
          <>
            <div className={styles.kbFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
            <GuessKeyboard
              onKey={typeLetter}
              actSubmit={actSubmitEntry}
              actDelete={actDeleteLast}
              disabled={entryDisabled}
            />
          </>
        )}
      </div>
    </div>
  )
}
