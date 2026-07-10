import { IconPeel } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * bananagrams' "Peel" — the game's PRIMARY move: draw a fresh round of tiles
 * once your hand is empty, or — when the bunch can't refill the table — go out
 * and win (Bananas!). Primary weight (the filled accent) since it's the main
 * action, with the banana glyph (see IconPeel).
 *
 * Only bananagrams peels, so this is the one game that renders it — but it lives
 * here with the other semantic buttons (rather than hand-rolled in the game) so
 * it inherits the shared action-button shape, focus-guard, and icon-only box,
 * per docs/ui.md → "Button iconography" (games never hand-roll a
 * `<button className="...">`). Default label "Peel"; the game passes a fuller
 * label ("Peel! 🍌" / "Place all your tiles") to reflect the enabled state.
 */
export function PeelButton({ label = 'Peel', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconPeel} label={label} weight="primary" {...rest} />
}
