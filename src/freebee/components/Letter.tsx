import { cls } from '../../common/lib/cls'
import styles from './Letters.module.css'

type Props = {
  letter: string
  isCenter?: boolean
  onClick: () => void
}

/**
 * One hex in the honeycomb. Pure presentation — receives the
 * letter and a click handler from <Letters>. The position
 * within the honeycomb is decided by render order (the parent
 * renders center first, then 6 outer in clockwise-from-top
 * order); CSS nth-child rules pin each to its absolute spot.
 *
 * `onMouseDown` is intercepted to prevent the button from
 * stealing focus from the typed-word input — without this,
 * clicking a letter would blur whatever was focused and the
 * next keyboard letter would go to the body element instead of
 * the input. (This is the same trick freebee-ws uses; the
 * focus stays where the user expects.)
 */
export function Letter({ letter, isCenter, onClick }: Props) {
  return (
    <button
      type="button"
      className={cls(styles.letter, isCenter && styles.center)}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={isCenter ? `${letter} (center letter)` : letter}
    >
      <span>{letter}</span>
    </button>
  )
}
