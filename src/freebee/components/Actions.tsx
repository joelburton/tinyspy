import { cls } from '../../common/lib/cls'
import styles from './Actions.module.css'

type Props = {
  /** Empty-word state — Delete and Enter should be disabled. */
  wordEmpty: boolean
  /** Terminal / paused — disables Delete + Enter, but **leaves
   *  Shuffle clickable** so the user can keep rearranging the
   *  board as a fidget after the game ends. Same UX freebee-ws
   *  has; the Shuffle is genuinely harmless when locked. */
  locked: boolean
  onDelete: () => void
  onShuffle: () => void
  onSubmit: () => void
}

/**
 * The Delete / Shuffle / Enter triplet below the honeycomb.
 *
 * `<button type="button">` everywhere — these aren't inside a
 * form so we don't want any of them to act as a submit button
 * (which would also be a default behavior we'd need to suppress
 * with preventDefault).
 *
 * `onMouseDown` is intercepted on every button (same pattern as
 * <Letter>) so clicking an action doesn't steal focus from the
 * keyboard-handler attachment point. Without it, the next typed
 * letter would dispatch to a stale focus target.
 */
export function Actions({
  wordEmpty,
  locked,
  onDelete,
  onShuffle,
  onSubmit,
}: Props) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.action}
        onClick={onDelete}
        onMouseDown={(e) => e.preventDefault()}
        disabled={wordEmpty || locked}
      >
        Delete
      </button>
      <button
        type="button"
        className={cls(styles.action, styles.iconAction)}
        onClick={onShuffle}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Shuffle outer letters"
        title="Shuffle"
      >
        {/* The glyph is wrapped so the hover rotation animates
            the symbol, not the whole button. (Rotating the
            button moves the whole pill — unwanted; rotating
            the inner span keeps the pill stable.) */}
        <span className={styles.iconGlyph}>⟲</span>
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={onSubmit}
        onMouseDown={(e) => e.preventDefault()}
        disabled={wordEmpty || locked}
      >
        Enter
      </button>
    </div>
  )
}
