import { IconBack } from './icons'
import { cls } from '../lib/cls'

type Props = {
  onClick: () => void
  /**
   * Filled accent (a modal's primary CTA) vs outline (the in-page
   * terminal indicator each PlayArea shows after the modal closes).
   * Defaults to `'secondary'` — the common case.
   */
  variant?: 'primary' | 'secondary'
  /** Short form — renders "Club" instead of "Back to club" (the chevron makes
   *  the meaning clear). For tight spots like an in-column terminal row. */
  compact?: boolean
  autoFocus?: boolean
}

/**
 * The app-wide "‹ Back to club" button.
 *
 * Every exit-to-club affordance (the GameOverModal's CTA, each game's
 * post-terminal indicator) routes through here so the icon (`IconBack`, the
 * chevron-left glyph), its spacing, and the accessible label are identical
 * everywhere. The chevron is `aria-hidden` so a screen reader just
 * announces "Back to club", not the icon.
 *
 * `variant` swaps the fill (the global `secondary` class vs the default accent
 * button); `compact` swaps the visible label to just "Club" (the chevron
 * carries the rest). The accessible label stays "Back to club" either way.
 *
 * The icon+label look is the global `.icon-button` class (docs/ui.md → Button
 * iconography) — the same shape psychicnum's / connections' input-row buttons
 * use, composed via cls() the way `secondary` is.
 */
export function BackToClubButton({
  onClick,
  variant = 'secondary',
  compact,
  autoFocus,
}: Props) {
  return (
    <button
      type="button"
      className={cls('icon-button', variant === 'secondary' && 'secondary')}
      onClick={onClick}
      aria-label={compact ? 'Back to club' : undefined}
      autoFocus={autoFocus}
    >
      <IconBack size={16} aria-hidden />
      {compact ? 'Club' : 'Back to club'}
    </button>
  )
}
