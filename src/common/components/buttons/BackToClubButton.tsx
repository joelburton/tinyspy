import { IconBack } from '../icons'
import { cls } from '../../lib/util/cls'

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
  /** Icon-only square (the shared `icon-only` box) — just the chevron; the
   *  label moves to the aria-label + the styled tooltip. For the icon-only
   *  action rows (waffle's experiment). Wins over `compact`. */
  iconOnly?: boolean
  autoFocus?: boolean
  /** Override the visible text — e.g. "Suspend and return to club" on the pause
   *  overlay, where leaving *shelves* the game. Defaults to "Back to club"
   *  ("Club" when compact). */
  label?: string
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
  iconOnly,
  autoFocus,
  label,
}: Props) {
  const text = label ?? (compact ? 'Club' : 'Back to club')
  return (
    <button
      type="button"
      className={cls('icon-button', variant === 'secondary' && 'secondary', iconOnly && 'icon-only')}
      onClick={onClick}
      // Compact/icon-only hide some or all of the words behind the chevron, so
      // keep an accessible label — unless a full custom label spells it out.
      aria-label={(iconOnly || compact) && !label ? 'Back to club' : undefined}
      // The styled hover bubble (theme.css) — same default-to-the-label
      // behavior as ActionButton.
      data-tooltip={label ?? 'Back to club'}
      autoFocus={autoFocus}
    >
      <IconBack size={iconOnly ? 20 : 16} aria-hidden />
      {!iconOnly && text}
    </button>
  )
}
