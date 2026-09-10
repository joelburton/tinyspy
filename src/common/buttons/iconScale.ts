// cs-unmet

import { IconBack, IconDelete, type AppIcon } from '../icons/icons'

/**
 * The glyphs that don't read right at button size, and by how much.
 *
 * A few glyphs need a nudge to sit correctly in a button's square — a
 * direction mark shouldn't take as much room as an object glyph, a dense one
 * needs a shade more. That is a fact about the glyph ON A BUTTON, not about the
 * glyph: a menu row draws it at its own size and wants none of this.
 *
 * It lives here because the buttons that used to own these numbers are going
 * away. `<BackToClubButton>` carried the chevron's 0.9 as a default parameter,
 * which worked while every back-to-club went through that component; now the
 * action draws its own button and the fact would have died with the file — or
 * worse, been retyped at each call site as a number nobody could explain.
 *
 * A glyph whose purpose button SURVIVES keeps its scale there instead:
 * `<CloseButton>` owns the ✕'s 0.85 ("the purpose button owns its glyph scale,
 * so every dismiss matches"), and a dismiss is not an action.
 */
const BUTTON_ICON_SCALE = new Map<AppIcon, number>([
  // A direction mark should not take as much room as an object glyph. It reads
  // at that size because the glyph carries a heavier stroke than the rest —
  // see IconBack in the registry.
  [IconBack, 0.9],
  // The delete glyph reads denser and smaller than most, so it is bumped for
  // every consumer at once. A multiplier rather than a pixel size, so it stays
  // right when the button is `small`.
  [IconDelete, 1.2],
])

/** How much to scale this glyph on a button, or undefined for the common case.
 *  `<StandardButton>` reads it as the default; an explicit `iconScale` wins. */
export function buttonIconScale(icon: AppIcon | undefined): number | undefined {
  return icon === undefined ? undefined : BUTTON_ICON_SCALE.get(icon)
}
