import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import styles from './PlayArea.module.css'

/**
 * The turn-action row, split into two groups by a divider:
 *   - LEFT — actions that DON'T submit a move (Recall, Shuffle): local, free.
 *   - RIGHT — actions that DO submit a move (Play word, Exchange, and Pass in
 *     compete): rendered blue (primary) to signal "this commits your turn".
 * Disabled-state logic is computed in PlayArea and passed down.
 */
export function Controls({
  isCompete,
  canAct,
  hasTentative,
  selectedCount,
  canExchange,
  submitting,
  onSubmit,
  onRecall,
  onShuffle,
  onExchange,
  onPass,
}: {
  isCompete: boolean
  canAct: boolean
  hasTentative: boolean
  selectedCount: number
  canExchange: boolean
  submitting: boolean
  onSubmit: () => void
  onRecall: () => void
  onShuffle: () => void
  onExchange: () => void
  onPass: () => void
}) {
  return (
    <div className={styles.controls}>
      <button type="button" className="secondary" disabled={!hasTentative} onClick={onRecall}>
        Recall
      </button>
      <ShuffleButton onShuffle={onShuffle} label="Shuffle rack" />

      <span className={styles.divider} aria-hidden />

      <button
        type="button"
        className="primary"
        disabled={!canAct || hasTentative || selectedCount === 0 || !canExchange}
        onClick={onExchange}
        title={canExchange ? 'Swap the selected tiles for new ones' : 'Need ≥ 7 tiles in the bag'}
      >
        Exchange ({selectedCount})
      </button>
      <button
        type="button"
        className="primary"
        disabled={!canAct || !hasTentative || submitting}
        onClick={onSubmit}
      >
        Submit
      </button>
      {isCompete && (
        <button
          type="button"
          className="primary"
          disabled={!canAct || hasTentative}
          onClick={onPass}
        >
          Pass
        </button>
      )}
    </div>
  )
}
