// cs-blessed-buttons

import { IconBack } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * THE WAY OUT OF A GAME, back to the club it belongs to. Every exit-to-club
 * affordance routes through here — each game's playing action row, and its
 * terminal row via `<TerminalActionRow>` — so the glyph, the spacing and the
 * name are identical everywhere.
 *
 * It DRAWS "Club" and is CALLED "Back to club", which is the one place in the
 * folder those differ: the chevron carries the "back", and the button spends
 * its life in a ~22rem info column with other controls beside it, so the short
 * word is the one that fits. The full sentence is its `tooltip`, which makes it
 * the hover bubble and the accessible name — and what the e2e suite finds it
 * by. Most call sites pass `show="icon"` and get the sentence anyway.
 *
 * It is colored as an action in both weights. Going back to the club is a thing
 * you do — it is not a cancel — and it is already the filled blue at terminal,
 * so anything else would make one control two colors depending on the phase.
 */
export function BackToClubButton({
  label = 'Club',
  tooltip = 'Back to club',
  icon = IconBack,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return (
    <StandardButton
      label={label}
      tooltip={tooltip}
      icon={icon}
      tone={tone}
      {...rest}
    />
  )
}
