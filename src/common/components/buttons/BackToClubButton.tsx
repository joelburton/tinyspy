// cs-unmet

import { IconBack } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

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
 * terminal, so anything else would make one control two colors depending on the
 * phase. It rendered a raw `<button className="secondary">` until 2026-08-18,
 * which is how it ended up quiet-gray mid-game while sitting in an action row
 * beside blue buttons.
 */
export function BackToClubButton({
  name = 'Back to club',
  icon = IconBack,
  tone = 'normal',
  // The chevron is a touch lighter than the default: it is a direction mark
  // rather than an object, and at full size it out-weighed its own label.
  iconScale = 0.9,
  variant = 'secondary',
  compact,
  label,
  ...rest
}: Props) {
  return (
    <StandardButton
      name={name}
      icon={icon}
      tone={tone}
      iconScale={iconScale}
      weight={variant}
      // `compact` shortens what is DRAWN, never what the button is called.
      label={label ?? (compact ? 'Club' : undefined)}
      // The visible text may be "Club", or nothing at all — but the control is
      // always announced in full, and e2e finds it by that name. StandardButton
      // only sets an aria-label when nothing is drawn, so the compact case says
      // it here; spread after its own, so this wins.
      aria-label={name}
      {...rest}
    />
  )
}
