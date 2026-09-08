// cs-blessed-buttons

import { IconPeel } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * bananagrams' "Peel" — the game's PRIMARY move: draw a fresh round of tiles
 * once your hand is empty, or — when the bunch can't refill the table — go out
 * and win (Bananas!). Primary weight (the filled accent) since it's the main
 * action, with the banana glyph (see IconPeel).
 *
 * A move only one game has still gets a named button here rather than a
 * hand-rolled one in the game: that way it inherits the shared shape, the focus
 * guard and the glyph-alone box, and a game never writes a `<button>` of its
 * own. Default label "Peel"; the game passes a fuller one ("Peel! 🍌" / "Place
 * all your tiles") to reflect the enabled state.
 */
export function PeelButton({
  label = 'Peel',
  icon = IconPeel,
  weight = 'primary',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} weight={weight} {...rest} />
}
