import { IconZoomFit } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Zoom-to-fit — frame the whole board in the viewport (bananagrams' "Center +
 * fit"). A standard square icon-only action button (the shared `.icon-only`
 * box), not a bespoke round control. Default aria-label "Fit to screen".
 *
 * Icon-only by default (it floats over the board where a text label wouldn't
 * fit); pass `iconOnly={false}` for a labelled form if a game ever wants one.
 */
export function ZoomFitButton({ label = 'Fit to screen', iconOnly = true, ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconZoomFit} label={label} iconOnly={iconOnly} {...rest} />
}
