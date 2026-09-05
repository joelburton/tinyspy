// cs-unmet

import { IconHelp } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Icon-only "?" button that opens a game's Help/rules. Uses lucide's
 * circle-question-mark (`IconHelp`). Rendered in the setup dialog's action row so
 * a player can read the rules before starting — it opens Help ON TOP of the setup
 * dialog (which stays open behind it), unlike the in-game menu's Help item.
 *
 * Icon-only by default (the glyph is self-explanatory); `label` becomes the
 * aria-label + tooltip ("Help" unless overridden). A thin wrapper over
 * `ActionButton`, like the other purpose buttons — so it can't drift from them.
 */
export function HelpButton({
  name = 'Help',
  icon = IconHelp,
  // Icon-only by default — the ? is universally read, and the surfaces that
  // carry it (a setup dialog's footer, a game's chrome) have no room for a
  // word. Pass `label="Help"` to draw it.
  label = null,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} label={label} {...rest} />
}
