import { IconShuffle } from '../icons'
import { cls } from '../../lib/cls'
import styles from './ShuffleButton.module.css'

type Props = {
  onShuffle: () => void
  /** Disable the control (e.g. an empty tile set). Defaults to enabled —
   *  shuffling is harmless, so even a locked/terminal game can leave it on
   *  as a post-game fidget. */
  disabled?: boolean
  /** Accessible label + tooltip. Defaults to "Shuffle". */
  label?: string
  /** Extra class for the caller's layout (margins/placement). */
  className?: string
}

/**
 * The standard ⟲ shuffle control — an icon-only pill, used wherever a player
 * reshuffles their OWN tiles for a fresh look (spellingbee's outer letters,
 * connections's remaining tiles, bananagrams's hand). It's part of the shared
 * design language: the same recognizable glyph + hover-spin everywhere, so a
 * player who learns it in one game knows it in the next. See docs/ui.md →
 * Consistency across games.
 *
 * Shuffling is always local and harmless (no server write, no broadcast), so
 * the control stays enabled by default even when the rest of the game is
 * locked. Callers pass `disabled` only when there's nothing to shuffle.
 *
 * The glyph rotates on hover; the rotation lives on the inner span so the pill
 * itself stays put (rotating the button would spin the whole control, which
 * reads as a twitch). `onMouseDown` is suppressed so a click doesn't steal
 * focus from a game's keyboard-handler attachment point (spellingbee captures typed
 * letters and must keep focus where keydown is bound).
 */
export function ShuffleButton({ onShuffle, disabled, label = 'Shuffle', className }: Props) {
  return (
    <button
      type="button"
      className={cls(styles.shuffle, className)}
      onClick={onShuffle}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {/* The glyph spins on hover via the .glyph span (rotating the button
       *  would spin the whole pill). IconShuffle is the rotate glyph — chosen
       *  over the crossing-arrows `Shuffle` as the visually clearer "fresh
       *  look" (see the registry / docs/ui.md). */}
      <span className={styles.glyph}>
        <IconShuffle size={24} aria-hidden />
      </span>
    </button>
  )
}
