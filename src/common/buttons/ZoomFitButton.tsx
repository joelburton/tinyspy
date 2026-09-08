// cs-blessed-buttons

import { IconZoomFit } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * FRAME THE WHOLE BOARD in the viewport — reach for this on a board a player
 * can pan or grow past the window (bananagrams' "Center + fit").
 *
 * Pass `show="icon"`: it floats over the board, where a word has nowhere to
 * sit, so it takes the shared square box rather than a shape of its own. The
 * label survives as the hover bubble.
 */
export function ZoomFitButton({
  label = 'Fit to screen',
  icon = IconZoomFit,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} {...rest} />
}
