import { cls } from '../../common/lib/cls'
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
 *
 * When `goodWordTiles` is set (a word was just accepted) and no new word
 * is in progress, those letters show with a green "good move" border for
 * a beat — driven by the PlayArea's flash timer.
 */
export function WordEntry({
  tiles,
  currentWord,
  active,
  onRetract,
  goodWordTiles,
}: {
  tiles: Tile[]
  currentWord: number[]
  active: boolean
  onRetract: (index: number) => void
  goodWordTiles?: number[] | null
}) {
  const letterOf = (id: number) => tiles.find((t) => t.id === id)?.letter ?? '?'

  // The just-accepted word takes over the row only while nothing new is
  // being spelled (the moment a tile is picked, currentWord wins).
  const showGood =
    currentWord.length === 0 && !!goodWordTiles && goodWordTiles.length > 0
  const display = showGood ? goodWordTiles : currentWord

  return (
    <div className={styles.row} aria-label="Current word">
      {Array.from({ length: 5 }, (_, i) => {
        const tileId = display[i]
        const filled = tileId !== undefined
        return (
          <button
            type="button"
            key={i}
            className={cls(
              styles.slot,
              filled && styles.filled,
              showGood && filled && styles.good,
            )}
            disabled={!filled || !active || showGood}
            onClick={() => onRetract(i)}
            title={
              filled && !showGood
                ? 'Return this tile (and the ones after it)'
                : undefined
            }
          >
            {filled ? letterOf(tileId) : ''}
          </button>
        )
      })}
    </div>
  )
}
