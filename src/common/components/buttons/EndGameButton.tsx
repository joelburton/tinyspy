import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * End-the-game button — the manual "we're done" stop (a neutral terminal). The
 * `danger` tone reserves it for the destructive-action color (red) we'll design
 * later; for now it renders like a secondary button. Default label "End game";
 * pass `label` to deviate (e.g. a compact "End" in a tight action row) while
 * still getting the right icon / tone / behaviour.
 *
 * Thin for now. The confirm-before-ending dialog + irreversibility (identical
 * everywhere this is used) will move INTO this component later — which is exactly
 * why it's its own file from the start.
 */
export function EndGameButton({ label = 'End game', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="danger" {...rest} />
}
