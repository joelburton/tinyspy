// cs-audited-buttons

import { IconEndGame } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * End-the-game button — the manual "we're done" stop for solo / coop. It is
 * the irreversible action in the row and is colored to say so before the press.
 * Its glyph is the crossed-out stop sign and Concede's is the flag, because
 * bananagrams shows both buttons at once and two red flags read as one act
 * repeated.
 *
 * Label is always **"End game"** — the same in every game (compete uses
 * `ConcedeGameButton` instead). Don't pass a custom
 * `label`: the whole point is that this button reads the same everywhere. It's
 * the full phrase rather than a bare "End" because most games render it
 * icon-only, where the label IS the accessible name and the tooltip — and "End"
 * alone doesn't say end *what*.
 *
 * Thin for now. The confirm-before-ending dialog + irreversibility (identical
 * everywhere this is used) will move INTO this component later — which is exactly
 * why it's its own file from the start.
 */
export function EndGameButton({
  label = 'End game',
  icon = IconEndGame,
  tone = 'destructive',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
