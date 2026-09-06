// cs-audited-buttons

import { IconHelp } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * OPEN THE RULES — the "?" in the setup dialog's action row, so a player can
 * read a game before starting it. It opens Help ON TOP of the setup dialog,
 * which stays open behind it; the in-game menu's Help item is the other route
 * and does not.
 *
 * Icon-only by default; pass `label` to draw a word. `name` defaults to
 * "Help", which is what it is called and what its hover bubble says.
 */
export function HelpButton({
  name = 'Help',
  icon = IconHelp,
  // The ? is universally read, and the surfaces that carry it — a setup
  // dialog's footer, a game's chrome — have no room for a word.
  label = null,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} label={label} {...rest} />
}
