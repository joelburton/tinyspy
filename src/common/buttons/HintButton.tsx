// cs-audited-buttons

import { IconHint } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Get-a-hint button — asks for a clue. The dark amber marks it as help you
 * asked for: important, but neither good nor bad, and nothing like the red of
 * an End. That amber is deliberately NOT the orange an outcome wears — the
 * theme rotates it a third of the way toward red for exactly that reason (see
 * its CAUTION block). Default label "Hint".
 */
export function HintButton({ label = 'Hint', icon = IconHint, tone = 'caution', ...rest }: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
