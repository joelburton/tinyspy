import { cls } from '../../common/lib/cls'
import { IconDelete, IconSubmit } from '../../common/components/icons'
import styles from './Actions.module.css'

type Props = {
  /** Empty-word state — Delete and Enter should be disabled. */
  wordEmpty: boolean
  /** Terminal / paused — disables Delete + Enter. */
  locked: boolean
  onDelete: () => void
  onSubmit: () => void
}

/**
 * The Delete / Enter pair in the below-board input row, beside the typed-word
 * EntryBox. Both use the shared icon+label `icon-button` look: Enter carries the
 * `IconSubmit` up-triangle (the canonical submit-a-move idiom — see icons.ts);
 * Delete carries `IconDelete` and is `secondary` (the calmer of the two).
 * (Shuffle is no longer here — it floats over the board's top-right.)
 *
 * `<button type="button">` everywhere — these aren't inside a form. `onMouseDown`
 * is intercepted (same pattern as <Letter>) so clicking an action doesn't steal
 * focus from the keyboard-handler attachment point; without it the next typed
 * letter would dispatch to a stale focus target.
 */
export function Actions({ wordEmpty, locked, onDelete, onSubmit }: Props) {
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={cls('secondary', 'icon-button')}
        onClick={onDelete}
        onMouseDown={(e) => e.preventDefault()}
        disabled={wordEmpty || locked}
      >
        <IconDelete size={15} aria-hidden />
        Delete
      </button>
      <button
        type="button"
        className={cls('icon-button')}
        onClick={onSubmit}
        onMouseDown={(e) => e.preventDefault()}
        disabled={wordEmpty || locked}
      >
        <IconSubmit size={15} aria-hidden />
        Enter
      </button>
    </div>
  )
}
