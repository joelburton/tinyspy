// cs-unmet

import { cls } from '@/common/utils/cls'
import { IconRemove } from '@/common/icons/icons'
import styles from './ChainStrip.module.css'

/**
 * The chain so far, shown ABOVE the board.
 *
 * It lives here rather than in the info column because it is the game's
 * central state — what you have played, and therefore what letter the next
 * word must start with — and on a phone the info column is off-canvas. A
 * readout you need on every turn can't be behind a sheet.
 *
 * The LAST word carries an ×, and that is the whole undo affordance: there is
 * no separate Undo or Clear button. Only the last word can go, because the
 * chain is a sequence — removing a middle word would leave the words after it
 * starting from the wrong letter. Clicking × repeatedly walks the chain back to
 * empty, which is why a bulk "clear" would be redundant.
 *
 * The strip keeps its height when the chain is empty, so playing the first word
 * doesn't shove the board down (docs/ui.md → layout stability).
 */
export function ChainStrip({
  words,
  onRemoveLast,
  canRemoveLast,
}: {
  words: string[]
  onRemoveLast: () => void
  // The last word may be taken back now; otherwise it carries no ×.
  canRemoveLast: boolean
}) {
  return (
    <ol className={styles.chain}>
      {words.length === 0 && <li className={styles.chainEmpty}>No words yet</li>}
      {words.map((w, i) => {
        const hasRemove = canRemoveLast && i === words.length - 1
        return (
          <li
            key={`${w}-${i}`}
            // The tighter right padding belongs to the ×, NOT to being last:
            // without the button the pill sits like every other one.
            className={cls(styles.chainWord, hasRemove && styles.chainLast)}
          >
            {w}
            {hasRemove && (
              <button
                type="button"
                className={styles.chainRemove}
                onClick={onRemoveLast}
                aria-label={`Take back ${w.toUpperCase()}`}
                data-tooltip={`Take back ${w.toUpperCase()}`}
              >
                <IconRemove size={18} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
