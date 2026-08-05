import styles from './PlayArea.module.css'

/**
 * The in-progress word as the value INSIDE the shared `<EntryBox>` (passed as
 * its `children`), one span per character — the same seam spellingbee and
 * wordwheel use to style letters individually.
 *
 * Here it exists for one letter: the SEED, the mandatory first letter carried
 * over from the previous word's ending. It renders in the board's accent green,
 * the same colour the current letter on the board is filled with, because it is
 * not a character the player typed — Backspace won't remove it, and a letter
 * that ignores Backspace should not look like the ones that don't.
 */
export function TypedWord({ word, seedLength }: { word: string; seedLength: number }) {
  return (
    <>
      {Array.from(word).map((ch, i) => (
        <span key={i} className={i < seedLength ? styles.seedLetter : undefined}>
          {ch.toUpperCase()}
        </span>
      ))}
    </>
  )
}
