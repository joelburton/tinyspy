// cs-unmet

import { IconEndTurn } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Pass / skip your turn, **de-emphasized** — the end-turn octagon at the default
 * secondary weight + a `warning` (amber) tone. For games where passing is a
 * fallback, not the main move: scrabble's Submit is the main action, so its Pass
 * sits beside it as a lighter, secondary control (typically icon-only).
 *
 * Distinct from `EndTurnButton` (same octagon glyph) on purpose: that one is
 * **primary** because in codenamesduet ending the turn *is* the move on offer, so
 * it carries the row's emphasis. Same action, different weight by context — kept
 * as separate components so each reads consistently wherever it's used. Default
 * label "Pass".
 */
export function PassButton({ name = 'Pass', icon = IconEndTurn, tone = 'caution', ...rest }: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
