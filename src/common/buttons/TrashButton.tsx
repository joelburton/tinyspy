// cs-unmet

import { IconTrash } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * DESTROY this thing — a game, and whatever else earns one later.
 *
 * Destructive by default, and that is the whole point of it existing rather
 * than each site reaching for a bare `<button>`: an irreversible act should look
 * irreversible **before** you press it, not after. The club's game-delete used
 * to be a neutral gray `×` that only turned red once you had already clicked, so
 * the one signal that mattered arrived too late to help.
 *
 * `×` is deliberately not this button's glyph. An ✕ means *close this*;
 * a trash can means *destroy this*, and the two acts are only a pixel apart on
 * screen while being nothing alike in consequence.
 */
export function TrashButton({
  name = 'Delete',
  icon = IconTrash,
  tone = 'destructive',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
