// cs-fixed

import { cls } from '../../lib/util/cls'
import { IconClose } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'
import styles from './CloseButton.module.css'

/**
 * DISMISS the thing this sits in — a floating panel's titlebar, a toast, a
 * feedback pill.
 *
 * **It is a component, not a class, because it owns the GLYPH.** A class can
 * make two different characters look alike but cannot make them the same
 * character, and `✕` (U+2715) against `×` (U+00D7) is the drift a shared
 * dismiss exists to prevent. Reach for this anywhere a control means *close
 * this*; `<TrashButton>` is the one that means *destroy this*.
 *
 * **NO BORDER.** A quiet secondary outlines itself, and a dismiss is furniture
 * rather than a control being offered (Joel, 2026-08-25) — so the module clears
 * the hover outline. The hover WASH stays: that is the affordance.
 *
 * **Sized in `em`, so it fits whatever it sits in** — a toast's comes out
 * bigger than a feedback pill's without either of them naming a number. A
 * caller needing a specific box re-points `--iconButton-size` in its own class,
 * which is how the titlebar sizes its own against the bar height.
 *
 * **Placement is the caller's**: this draws a glyph in a box and takes no
 * position. The toast pins its own to the top-right corner.
 */
export function CloseButton({
  name = 'Close',
  icon = IconClose,
  label = null,
  tone = 'quiet',
  // Lighter than the default: at full weight the ✕ fills its square wall to
  // wall. The purpose button owns its glyph scale, so every dismiss matches.
  iconScale = 0.85,
  className,
  ...rest
}: PurposeButtonProps) {
  return (
    <StandardButton
      name={name}
      icon={icon}
      label={label}
      tone={tone}
      iconScale={iconScale}
      className={cls(styles.close, className)}
      {...rest}
    />
  )
}
