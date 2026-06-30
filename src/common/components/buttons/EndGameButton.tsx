import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * End-the-game button — the manual "we're done" stop for solo / coop. The
 * **`error`** tone (dark red, the same red as an `error` feedback pill) marks it
 * as the destructive action in the row. Label is always **"End"** — the canonical,
 * consistent label across every v3 game (compete uses `ConcedeGameButton`
 * instead). Don't pass a custom `label`: the whole point is that this button reads
 * the same everywhere.
 *
 * Thin for now. The confirm-before-ending dialog + irreversibility (identical
 * everywhere this is used) will move INTO this component later — which is exactly
 * why it's its own file from the start.
 */
export function EndGameButton({ label = 'End', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="error" {...rest} />
}
