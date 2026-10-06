// cs-unmet

import { BlockingModal } from '@/common/floating-panels/BlockingModal'
import { CancelButton } from '@/common/buttons/CancelButton'
import styles from './BlankPickerBlockingModal.module.css'

// Lowercase, the data's case; the buttons draw capitals.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')

/**
 * Declare what a placed blank stands for — the one question scrabble has to
 * ask mid-move, and the answer is permanent for the rest of the game (the real
 * rule; see docs/games/scrabble.md → Blank tiles).
 *
 * A **blocking** modal, so it has the tab ring, Escape and the panel tier every
 * other modal has, and the key dispatcher stands down for it: a keystroke
 * answers the question rather than reaching the board underneath.
 *
 * The 26 letters are NOT actions. A letter here answers a question this panel is
 * asking — it is not a command the page offers, and it exists only while the
 * panel is open. (A typed letter declares a blank itself and never opens this;
 * this panel is for a blank dragged or tap-placed, where there is no letter
 * yet.)
 */
export function BlankPickerBlockingModal({
  onPick,
  onCancel,
}: {
  onPick: (letter: string) => void
  onCancel: () => void
}) {
  return (
    <BlockingModal title="This blank stands for…" onClose={onCancel} buttons={<CancelButton show="label" onClick={onCancel} />}>
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
