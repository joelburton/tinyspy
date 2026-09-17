// cs-met-outcome-fix

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import type { Tile } from '../lib/board'
import styles from './WordEntry.module.css'

/** THIS player's answer, shown in the slots for a beat once the word is
 *  submitted: 'won' for an accepted word, 'lost' for a refused one. The letters
 *  are passed rather than tile ids because an accepted word's tiles have already
 *  left the board.
 *
 *  A teammate's word is NOT shown here. The entry row is this player's
 *  workspace, and their answer is marked where it happened — on the board tiles
 *  their word used. */
export type WordFlash = { letters: string[]; tone: 'won' | 'lost' }

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
  verdict = null,
}: {
  tiles: Tile[]
  currentWord: number[]
  active: boolean
  onRetract: (index: number) => void
  flash?: WordFlash | null
  /** An answer for the word STILL IN THE SLOTS — a refusal, whose five tiles
   *  stay off the board until the beat ends. `flash` is the other half of the
   *  same idea, for a word the buffer has already let go of. */
  verdict?: 'won' | 'lost' | null
}) {
  const letterOf = (id: number) => tiles.find((t) => t.id === id)?.letter ?? '?'

  // The flash takes over the row only while nothing new is being spelled
  // (the moment a tile is picked, currentWord wins).
  const showFlash =
    currentWord.length === 0 && !!flash && flash.letters.length > 0
  /** The tone the slots wear, from whichever half of the answer is showing. */
  const tone = verdict ?? (showFlash ? flash.tone : null)
  const answering = tone !== null

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
              // The answer, worn as any piece wears one: the outcome's fill and
              // white ink, from the shared tone classes. A refusal shakes too —
              // side to side is "not a winning move" — and needs no wait for an
              // attention flash, because the eye is already on this row.
              answering && filled && styles.verdict,
              answering && filled && shared.verdictFill,
              answering &&
                filled &&
                (tone === 'won' ? shared.verdictWon : shared.verdictLost),
              answering && filled && tone === 'lost' && shared.verdictShake,
            )}
            // Flashed slots aren't interactive — only an in-progress word's
            // tiles can be returned.
            disabled={!filled || !active || answering}
            onClick={() => onRetract(i)}
            title={
              filled && !answering
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
