import styles from './BlankPicker.module.css'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Modal letter chooser shown when a blank is placed. In real Scrabble a
 * blank's letter is declared on play and is permanent for the game (see
 * docs/games/scrabble.md §2.5), so we demand the letter at placement and
 * never let it change. Pick a letter → the tentative tile becomes that
 * letter (still scoring 0).
 */
export function BlankPicker({
  onPick,
  onCancel,
}: {
  onPick: (letter: string) => void
  onCancel: () => void
}) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <p className={styles.prompt}>This blank stands for…</p>
        <div className={styles.grid}>
          {ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              className={styles.letter}
              onClick={() => onPick(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
