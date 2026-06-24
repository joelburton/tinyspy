import styles from './BackToClubButton.module.css'

type Props = {
  onClick: () => void
  /**
   * Filled accent (a modal's primary CTA) vs outline (the in-page
   * terminal indicator each PlayArea shows after the modal closes).
   * Defaults to `'secondary'` — the common case.
   */
  variant?: 'primary' | 'secondary'
  autoFocus?: boolean
}

/**
 * The app-wide "‹ Back to club" button.
 *
 * Every exit-to-club affordance (the GameOverModal's CTA, each game's
 * post-terminal indicator) routes through here so the glyph (U+2039,
 * the single left-angle quote), its spacing, and the accessible label
 * are identical everywhere. The chevron is `aria-hidden` so a screen
 * reader just announces "Back to club", not the punctuation.
 *
 * `variant` only swaps the fill (the global `secondary` class vs the
 * default accent button); the label + chevron never vary.
 */
export function BackToClubButton({
  onClick,
  variant = 'secondary',
  autoFocus,
}: Props) {
  return (
    <button
      type="button"
      className={variant === 'secondary' ? 'secondary' : undefined}
      onClick={onClick}
      autoFocus={autoFocus}
    >
      <span className={styles.chevron} aria-hidden="true">
        ‹
      </span>
      Back to club
    </button>
  )
}
