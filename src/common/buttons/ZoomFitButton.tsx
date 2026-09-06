// cs-audited-buttons

import { IconZoomFit } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * FRAME THE WHOLE BOARD in the viewport — reach for this on a board a player
 * can pan or grow past the window (bananagrams' "Center + fit").
 *
 * Icon-only by default, since it floats over the board where a word has
 * nowhere to sit; pass `label` if a game ever has the room for one. `name`
 * defaults to "Fit to screen", which is what it is called with no text drawn.
 */
export function ZoomFitButton({
  name = 'Fit to screen',
  icon = IconZoomFit,
  // It floats over the board, where a word has nowhere to sit — so it takes
  // the shared square box rather than a shape of its own.
  label = null,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} label={label} {...rest} />
}
