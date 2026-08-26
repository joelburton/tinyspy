// cs-unmet

import { IconDelete } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Delete / backspace button — removes the last typed character. The `IconDelete`
 * glyph reads denser/smaller than most, so it's bumped to 22 (vs the default 18)
 * here, once, for every consumer; `.icon-only`'s fixed box keeps the button the
 * same size as its neighbours regardless. Secondary weight. Default label
 * "Delete".
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
