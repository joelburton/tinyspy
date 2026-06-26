import { cls } from '../../common/lib/cls'
import type { Tile } from '../lib/board'
import styles from './WordEntry.module.css'

/** A word to flash in the entry row when nothing is being spelled — the
 *  player's own just-accepted word, or a teammate's played word. `tone`
 *  colors the slots: 'good' (green) for an accepted/valid word, 'bad'
 *  (red) for a teammate's rejected word. The letters are passed directly
 *  (not tile ids) because a flashed word may be a teammate's, whose tiles
 *  this client never picked up — and a valid word's tiles have already
 *  left the board. */
export type WordFlash = { letters: string[]; tone: 'good' | 'bad' }

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
 * When `flash` is set and no new word is in progress, those letters show
 * for a beat in the flash's tone — green for a good word, red for a bad
 * one — driven by the PlayArea's flash timer. The flash is suppressed the
 * instant the player starts spelling (currentWord wins), so it never
 * stomps an in-progress word.
 */
export function WordEntry({
  tiles,
  currentWord,
  active,
  onRetract,
  flash,
}: {
  tiles: Tile[]
  currentWord: number[]
  active: boolean
  onRetract: (index: number) => void
  flash?: WordFlash | null
}) {
  const letterOf = (id: number) => tiles.find((t) => t.id === id)?.letter ?? '?'

  // The flash takes over the row only while nothing new is being spelled
  // (the moment a tile is picked, currentWord wins).
  const showFlash =
    currentWord.length === 0 && !!flash && flash.letters.length > 0

  return (
    <div className={styles.row} aria-label="Current word">
      {Array.from({ length: 5 }, (_, i) => {
        // Flash mode renders letters directly; otherwise map the
        // in-progress tile ids to their glyphs.
        const letter = showFlash ? flash.letters[i] : currentWord[i] !== undefined
          ? letterOf(currentWord[i])
          : undefined
        const filled = letter !== undefined
        return (
          <button
            type="button"
            key={i}
            className={cls(
              styles.slot,
              filled && styles.filled,
              showFlash && filled && (flash.tone === 'good' ? styles.good : styles.bad),
            )}
            // Flashed slots aren't interactive — only an in-progress word's
            // tiles can be returned.
            disabled={!filled || !active || showFlash}
            onClick={() => onRetract(i)}
            title={
              filled && !showFlash
                ? 'Return this tile (and the ones after it)'
                : undefined
            }
          >
            {letter ?? ''}
          </button>
        )
      })}
    </div>
  )
}
