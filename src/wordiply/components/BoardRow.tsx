// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import type { GAnswerMark } from '../types'
import { DimmedBaseWord } from './DimmedBaseWord'
import styles from './BoardRow.module.css'

/**
 * One line of the guess board: the word, its base dimmed, and its length — the
 * one readout during play. It draws what `Board` decided, and wears the answer
 * when `Board` says the answer is on it.
 */
export function BoardRow({
  word,
  base,
  kind,
  answer,
}: {
  word: string
  base: string
  // A word that has landed (or mine, held while its answer shows), the line
  // being typed into, or an empty one still to come.
  kind: 'landed' | 'typing' | 'empty'
  // The answer being shown on this line, or null.
  answer: GAnswerMark['flash']
}) {
  if (kind === 'empty') {
    return <li className={cls(styles.row, styles.empty)} aria-hidden="true" />
  }

  return (
    <li
      className={cls(
        styles.row,
        kind === 'landed' ? styles.done : styles.active,
        answer?.phase === 'attention' && shared.attentionFlash,
        answer?.phase === 'answer' && styles.answered,
        answer?.phase === 'answer' && OUTCOME_TO_VERDICT_CLASS[answer.value.outcome],
        // Side to side means "not a winning move", so only a win is spared it.
        answer?.phase === 'answer' && answer.value.outcome !== 'won' && shared.verdictShake,
      )}
    >
      <DimmedBaseWord word={word} base={base} className={styles.rowWord} />
      {/* The typing line shows its running length once something is typed. */}
      {word.length > 0 && (
        <span className={styles.badge} aria-label={`${word.length} letters`}>
          {word.length}
        </span>
      )}
    </li>
  )
}
