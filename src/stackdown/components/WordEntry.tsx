import type { Tile } from '../lib/board'
import styles from './WordEntry.module.css'

/**
 * The word being built, shown as five slots below the board. Each filled
 * slot is the letter of a tile that's been picked up, in selection
 * order. Clicking a filled slot returns that tile AND every tile after
 * it to the board (the word is an order — you can't pull one from the
 * middle and keep the rest), via `onRetract(index)`.
 *
 * Five empty slots when nothing's selected, so the entry row keeps its
 * footprint and reads as "spell a 5-letter word here."
 */
export function WordEntry({
  tiles,
  currentWord,
  active,
  onRetract,
}: {
  tiles: Tile[]
  currentWord: number[]
  active: boolean
  onRetract: (index: number) => void
}) {
  const letterOf = (id: number) => tiles.find((t) => t.id === id)?.letter ?? '?'

  return (
    <div className={styles.row} aria-label="Current word">
      {Array.from({ length: 5 }, (_, i) => {
        const tileId = currentWord[i]
        const filled = tileId !== undefined
        return (
          <button
            type="button"
            key={i}
            className={`${styles.slot} ${filled ? styles.filled : ''}`}
            disabled={!filled || !active}
            onClick={() => onRetract(i)}
            title={filled ? 'Return this tile (and the ones after it)' : undefined}
          >
            {filled ? letterOf(tileId) : ''}
          </button>
        )
      })}
    </div>
  )
}
