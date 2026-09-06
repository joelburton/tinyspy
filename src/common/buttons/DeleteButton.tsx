// cs-audited-buttons

import { IconDelete } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * BACKSPACE — removes the last typed character. Reach for this on an
 * on-screen keyboard or an entry row, wherever a player types without a
 * physical keyboard to delete with.
 *
 * Default label "Delete"; pass `label={null}` for the icon-only key, which is
 * what every keyboard uses.
 */
export function DeleteButton({
  name = 'Delete',
  icon = IconDelete,
  // The delete glyph reads denser and smaller than most, so it is bumped for
  // every consumer here, once. A multiplier rather than a pixel size, so it
  // stays right when the button is `small`.
  iconScale = 1.2,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} iconScale={iconScale} {...rest} />
}
