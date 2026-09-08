// cs-blessed-buttons

import { IconDelete } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * BACKSPACE — removes the last typed character. Reach for this on an
 * on-screen keyboard or an entry row, wherever a player types without a
 * physical keyboard to delete with.
 *
 * Default label "Delete"; pass `show="icon"`, since a key is the glyph.
 */
export function DeleteButton({
  label = 'Delete',
  icon = IconDelete,
  // The delete glyph reads denser and smaller than most, so it is bumped for
  // every consumer here, once. A multiplier rather than a pixel size, so it
  // stays right when the button is `small`.
  iconScale = 1.2,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} iconScale={iconScale} {...rest} />
}
