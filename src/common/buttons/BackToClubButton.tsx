// cs-blessed-buttons

import { IconBack } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * The way out of a game, for the two surfaces that cannot reach the action: the
 * pause overlay and the desktop-only notice. Both REPLACE the play area, so the
 * game's binding is not on the stack and there is no action to place — they get
 * a callback and this button, which keeps them looking like the real one.
 *
 * **Everywhere else it is `act-back-to-club`**, bound once by `GamePage` and
 * handed to a game on `ctx.menu`, which is what knows to suspend mid-game and
 * to go straight there at terminal — a choice a caller here would have to make
 * for itself, and could make wrong.
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
