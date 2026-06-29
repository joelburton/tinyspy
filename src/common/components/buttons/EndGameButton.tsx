import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * End-the-game button — the manual "we're done" stop. The **`error`** tone (dark
 * red, the same red as an `error` feedback pill) marks it as the destructive
 * action in the row. Default label "End game"; pass `label` to deviate (e.g. a
 * compact "End" in a tight action row) while still getting the right icon / tone
 * / behaviour.
 *
 * Thin for now. The confirm-before-ending dialog + irreversibility (identical
 * everywhere this is used) will move INTO this component later — which is exactly
 * why it's its own file from the start.
 */
export function EndGameButton({ label = 'End game', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="error" {...rest} />
}
