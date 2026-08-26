// cs-unmet

import { IconZoomFit } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Zoom-to-fit — frame the whole board in the viewport (bananagrams' "Center +
 * fit"). A standard square icon-only action button (the shared `.icon-only`
 * box), not a bespoke round control. Default aria-label "Fit to screen".
 *
 * Icon-only by default (it floats over the board where a text label wouldn't
 * fit); pass `label={false ? null : undefined}` for a labeled form if a game ever wants one.
 */
export function ZoomFitButton({
  name = 'Fit to screen',
  icon = IconZoomFit,
  label = null,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} label={label} {...rest} />
}
