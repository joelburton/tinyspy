// cs-blessed-buttons

import { IconTrash } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * DESTROY this thing — a game, and whatever else earns one later.
 *
 * Destructive by default, and that is the whole point of it existing rather
 * than each site reaching for a bare `<button>`: an irreversible act should look
 * irreversible **before** you press it, while you can still change your mind. A
 * control that turns red only once you have clicked it delivers the one signal
 * that mattered too late to help.
 *
 * `×` is deliberately not this button's glyph. An ✕ means *close this*;
 * a trash can means *destroy this*, and the two acts are only a pixel apart on
 * screen while being nothing alike in consequence.
 */
export function TrashButton({
  label = 'Delete',
  icon = IconTrash,
  tone = 'destructive',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
