import { IconBack } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

type Props = PurposeButtonProps & {
  onClick: () => void
  /** Filled (`primary`) at terminal, where going back IS the next thing you do;
   *  the outline everywhere else. */
  variant?: 'primary' | 'secondary'
  /** Shorten the visible label to "Club" — the chevron carries the rest. The
   *  accessible label stays "Back to club" either way. */
  compact?: boolean
}

/**
 * The app-wide "‹ Back to club" button.
 *
 * Every exit-to-club affordance (each game's playing action row, and its
 * terminal row via `<TerminalActionRow>`) routes through here so the glyph, the
 * spacing and the accessible label are identical everywhere. The chevron is
 * `aria-hidden` inside `ActionButton`, so a screen reader just announces "Back
 * to club".
 *
 * It wears the ACTION tone in both weights. Going back to the club is a thing
 * you do — it is not a cancel — and it is already the filled action blue at
 * terminal, so anything else would make one control two colours depending on the
 * phase. It rendered a raw `<button className="secondary">` until 2026-08-18,
 * which is how it ended up quiet-grey mid-game while sitting in an action row
 * beside blue buttons.
 */
export function BackToClubButton({
  variant = 'secondary',
  compact,
  label,
  ...rest
}: Props) {
  return (
    <ActionButton
      icon={IconBack}
      iconSize={16}
      label={label ?? (compact ? 'Club' : 'Back to club')}
      tooltip={label ?? 'Back to club'}
      weight={variant}
      tone="action"
      // The VISIBLE text may be "Club" (compact) or nothing at all (iconOnly),
      // but the control is always announced in full. ActionButton only sets an
      // aria-label for the icon-only case, so `compact` needs this said here —
      // spread after ActionButton's own, so this wins.
      aria-label={label ?? 'Back to club'}
      {...rest}
    />
  )
}
