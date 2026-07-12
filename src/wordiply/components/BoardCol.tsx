import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { terminalPill } from '../../common/lib/game/localPills'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { GuessKeyboard } from '../../common/components/game/entry/GuessKeyboard'
import { useCaptureKeys, asciiLetters } from '../../common/hooks/input/useCaptureKeys'
import { useArrowHistory } from '../../common/hooks/input/useArrowHistory'
import { GuessBoard } from './GuessBoard'
import shared from '../../common/components/game/PlayArea.module.css'
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
 * The keyboard slot doubles as the feedback area: a soft-reject line sits
 * above the keys (successful guesses show NO pill — the row already shows
 * the word + its length), and at terminal the verdict fills the slot in
 * place of the keyboard.
 */
export function BoardCol({
  base,
  guesses,
  word,
  onChange,
  onSubmit,
  clearLocalFeedback,
  lastWord,
  entryDisabled,
  localPill,
  over,
}: {
  base: string
  guesses: { word: string; length: number }[]
  word: string
  onChange: Dispatch<SetStateAction<string>>
  onSubmit: () => void
  clearLocalFeedback: () => void
  /** The last submitted guess — ArrowUp recalls it (the next guess is often the
   *  previous one with another letter). */
  lastWord: string
  /** Freeze input (terminal / conceded / out of guesses). */
  entryDisabled: boolean
  /** The own-move pill (from useWordSubmit). Success is dropped; only a
   *  soft-reject reason is shown. */
  localPill: GenericFeedbackMsg | null
  /** Terminal copy at game-over (`indicator` drives the verdict line). */
  over: (TerminalCopy & { indicator: string }) | null
}) {
  // On-screen key → append/backspace (updater form, so it reads the latest
  // word); each edit dismisses a sticky reject.
  const typeLetter = useCallback(
    (ch: string) => {
      clearLocalFeedback()
      onChange((w) => (w.length < MAX_LEN ? w + ch.toLowerCase() : w))
    },
    [clearLocalFeedback, onChange],
  )
  const backspace = useCallback(() => {
    clearLocalFeedback()
    onChange((w) => w.slice(0, -1))
  }, [clearLocalFeedback, onChange])

  // Physical keyboard (desktop convenience) drives the SAME word + submit.
  useCaptureKeys({
    value: word,
    onChange,
    onSubmit,
    disabled: entryDisabled,
    onAnyKey: clearLocalFeedback,
    charFor: asciiLetters('lower'),
    maxLength: MAX_LEN,
  })
  // ArrowUp recalls the last guess, ArrowDown clears — handy here since the
  // next guess is often the last one plus a letter (the shared history hook,
  // the same one <EntryRow> uses).
  useArrowHistory({ recall: lastWord, onChange, enabled: !entryDisabled })

  // Drop success feedback (the row shows the word + length); keep soft rejects.
  const rejectPill = localPill && localPill.tone !== 'success' ? localPill : null

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <div className={styles.starterWord}>{base.toUpperCase()}</div>

      <GuessBoard base={base} guesses={guesses} activeWord={word} showActive={!entryDisabled} />

      <div className={styles.inputArea}>
        {over ? (
          <div className={styles.verdictSlot}>
            <GenericFeedbackPill msg={terminalPill(over.tone, over.indicator)} onClose={() => {}} />
          </div>
        ) : (
          <>
            <div className={styles.kbFeedback}>
              {rejectPill && <GenericFeedbackPill msg={rejectPill} onClose={() => {}} />}
            </div>
            <GuessKeyboard onKey={typeLetter} onEnter={onSubmit} onBackspace={backspace} disabled={entryDisabled} />
          </>
        )}
      </div>
    </div>
  )
}
