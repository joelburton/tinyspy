// cs-unmet

import { BlockingModal } from '@/common/floating-panels/BlockingModal'
import { CancelButton } from '@/common/buttons/CancelButton'
import styles from './ScrabbleBlankPickerBlockingModal.module.css'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Declare what a dragged blank stands for — the one question scrabble has to
 * ask mid-move, and the answer is permanent for the rest of the game (the real
 * rule; see docs/games/scrabble.md → Blank tiles).
 *
 * A **blocking** modal, which is the category it always described itself as and
 * only became on 2026-09-10. It was a hand-rolled `position: fixed` overlay: no
 * focus trap, no Escape, a scrim click that CANCELED where every sibling's does
 * nothing, and `z-index: 50` — below the panel tier, so an open chat painted
 * over the question. The keyboard is what forced the issue: the app's one key
 * dispatcher stands down for anything inside a `[data-floating-panel]`, and this
 * was not one, so a keystroke reached the board underneath a question about it.
 *
 * The 26 letters are NOT actions. A letter here answers a question this panel is
 * asking — it is not a command the page offers, and it exists only while the
 * panel is open. (The typed-letter path into a blank is the board's own
 * `act-place-tile`, which declares the blank from the letter you type and never
 * opens this at all; this panel is the DRAG path, where there is no letter yet.)
 */
export function ScrabbleBlankPickerBlockingModal({
  onPick,
  onCancel,
}: {
  onPick: (letter: string) => void
  onCancel: () => void
}) {
  return (
    <BlockingModal title="This blank stands for…" onClose={onCancel} actions={<CancelButton show="label" onClick={onCancel} />}>
      <div className={styles.grid}>
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            type="button"
            className={styles.letter}
            // Not a focus target on the way IN — the panel's own trap owns the
            // keyboard, and a click parking a ring on whichever letter you last
            // pressed is the trap every board tile avoids the same way.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(letter)}
          >
            {letter}
          </button>
        ))}
      </div>
    </BlockingModal>
  )
}
