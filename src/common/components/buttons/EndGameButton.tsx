import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * End-the-game button — the manual "we're done" stop for solo / coop. The
 * **`error`** tone (dark red, the same red as an `error` feedback pill) marks it
 * as the destructive action in the row, and the glyph is the crossed-out stop
 * sign (`IconEnd`), not the flag it used to share with Concede — bananagrams
 * shows both buttons at once, and two red flags read as one act repeated.
 *
 * Label is always **"End game"** — the canonical, consistent label across every
 * v3 game (compete uses `ConcedeGameButton` instead). Don't pass a custom
 * `label`: the whole point is that this button reads the same everywhere. It's
 * the full phrase rather than a bare "End" because most games render it
 * icon-only, where the label IS the accessible name and the tooltip — and "End"
 * alone doesn't say end *what*.
 *
 * Thin for now. The confirm-before-ending dialog + irreversibility (identical
 * everywhere this is used) will move INTO this component later — which is exactly
 * why it's its own file from the start.
 */
export function EndGameButton({ label = 'End game', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="error" {...rest} />
}
