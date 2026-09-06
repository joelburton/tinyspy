// cs-audited-buttons

import { IconBack } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * The app-wide "‹ Club" button.
 *
 * Every exit-to-club affordance (each game's playing action row, and its
 * terminal row via `<TerminalActionRow>`) routes through here so the glyph, the
 * spacing and the accessible label are identical everywhere. The chevron is
 * `aria-hidden` inside `StandardButton`, so the control announces itself as
 * "Back to club" and nothing else.
 *
 * It DRAWS "Club" and is CALLED "Back to club". The chevron carries the "back",
 * and the button spends its life in a ~22rem info column with other controls
 * beside it, so the short word is the one that fits; the full sentence lives on
 * as the accessible name, which is what the e2e suite finds it by. Pass
 * `label={null}` for the icon-only square, or a `label` of your own where the
 * room is there for a longer one.
 *
 * It is colored as an action in both weights. Going back to the club is a
 * thing you do — it is not a cancel — and it is already the filled blue at
 * terminal, so anything else would make one control two colors depending on the
 * phase. It rendered a raw `<button className="secondary">` until 2026-08-18,
 * which is how it ended up quiet-gray mid-game while sitting in an action row
 * beside blue buttons.
 */
export function BackToClubButton({
  name = 'Back to club',
  label = 'Club',
  icon = IconBack,
  tone = 'normal',
  // A shade smaller than the default: a direction mark should not take as much
  // room as an object glyph. It reads at that size because the glyph carries a
  // heavier stroke than the rest — see IconBack in the registry.
  iconScale = 0.9,
  ...rest
}: PurposeButtonProps) {
  return (
    <StandardButton
      name={name}
      label={label}
      icon={icon}
      tone={tone}
      iconScale={iconScale}
      // The visible text is "Club", or nothing at all — but the control is
      // always announced in full, and e2e finds it by that name.
      // StandardButton only sets an aria-label when nothing is drawn, so the
      // labeled case says it here; before the spread, so a call site can still
      // override it.
      aria-label={name}
      {...rest}
    />
  )
}
