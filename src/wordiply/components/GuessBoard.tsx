// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import history from '@/common/event-log/historyViewer.module.css'
import { DimmedBaseWord } from './DimmedBaseWord'
import styles from './GuessBoard.module.css'

/** The fixed number of guesses per track (coop: shared; compete: per player). */
export const MAX_GUESSES = 5

type CompletedGuess = { word: string; length: number }

/**
 * The five-row guess board — always exactly MAX_GUESSES fixed-height rows
 * (a HARD layout-stability rule; the board must never grow/shrink). The
 * word ENTRY is the on-screen keyboard BELOW the grid (in BoardCol), but
 * the word-in-progress appears LIVE in the next row as it's typed.
 *
 * Each row is one of:
 *   • completed — a landed guess (`<DimmedBaseWord>` + a length badge, the
 *     only readout during play);
 *   • active — the next row while playing: the live `<DimmedBaseWord>` of
 *     what's being typed, with a running length badge;
 *   • empty — a future row: a fixed-height placeholder.
 */
export function GuessBoard({
  base,
  guesses,
  activeWord,
  showActive,
  held = null,
  flash = null,
  isViewingHistory = false,
}: {
  base: string
  guesses: CompletedGuess[]
  /** The word being typed — shown live in the active row. */
  activeWord: string
  /** Whether the active (in-progress) row is shown (playing + budget left). */
  showActive: boolean
  /** My own just-accepted word, drawn as the next landed row until the server's
   *  own row takes its place. Without it the word vanishes for a round trip —
   *  the engine clears the box on submit. */
  held?: { word: string; length: number; awaitingRow: boolean } | null
  /** The answer on whichever row its word is in, for a beat: a teammate's word
   *  is already a landed row, mine may still be the held one. */
  flash?: Mark<{ word: string; outcome: Outcome }> | null
  /** A past row is open: the board wears the shared history frame and the rows
   *  drawn are that moment's, not the live ones. */
  isViewingHistory?: boolean
}) {
  // The answer marks the row its word is IN, and MY row wins: guessing a word
  // again is answered where I just typed it, not on the row it landed in four
  // turns ago. Only a teammate's word — which has no held row of mine — marks a
  // landed one.
  const onHeldRow = held !== null && flash !== null && flash.value.word === held.word
  const flashed =
    flash && !onHeldRow ? guesses.findIndex((g) => g.word === flash.value.word) : -1
  const activeIndex = showActive ? guesses.length + (held ? 1 : 0) : -1
  /** The marks a row wears while it is the answered one. */
  const answerMarks = (a: NonNullable<typeof flash>) =>
    cls(
      a.phase === 'attention' && shared.attentionFlash,
      a.phase === 'answer' && styles.answered,
      a.phase === 'answer' && OUTCOME_TO_VERDICT_CLASS[a.value.outcome],
      // Side to side means "not a winning move", so only a win is spared it.
      a.phase === 'answer' && a.value.outcome !== 'won' && shared.verdictShake,
    )

  return (
    // data-board: the stable handle a spec uses to ask what the BOARD holds,
    // since the event log beside it shows the same words (the repo's
    // [data-board] / [data-cell] convention).
    <ol className={cls(shared.boardSeal, styles.board, isViewingHistory && history.historyFrame)} data-board>
      {Array.from({ length: MAX_GUESSES }, (_, i) => {
        if (held && i === guesses.length) {
          return (
            <li
              key={`answer-${held.word}`}
              // The row keeps its own shape — the word left, the badge right —
              // and only its colors change. The shared verdict classes carry
              // nothing but the two custom properties `.answered` reads, which
              // is why a row can wear a verdict without being a `.tileFace`.
              className={cls(
                styles.row,
                styles.done,
                flash && flash.value.word === held.word && answerMarks(flash),
              )}
            >
              <DimmedBaseWord word={held.word} base={base} className={styles.rowWord} />
              <span className={styles.badge} aria-label={`${held.length} letters`}>
                {held.length}
              </span>
            </li>
          )
        }
        const g = guesses[i]
        if (g) {
          return (
            <li
              key={i}
              className={cls(
                styles.row,
                styles.done,
                flash && i === flashed && answerMarks(flash),
              )}
            >
              <DimmedBaseWord word={g.word} base={base} className={styles.rowWord} />
              <span className={styles.badge} aria-label={`${g.length} letters`}>
                {g.length}
              </span>
            </li>
          )
        }
        if (i === activeIndex) {
          return (
            <li key={i} className={cls(styles.row, styles.active)}>
              <DimmedBaseWord word={activeWord} base={base} className={styles.rowWord} />
              {activeWord.length > 0 && (
                <span className={styles.badge} aria-label={`${activeWord.length} letters`}>
                  {activeWord.length}
                </span>
              )}
            </li>
          )
        }
        return <li key={i} className={cls(styles.row, styles.empty)} aria-hidden="true" />
      })}
    </ol>
  )
}
