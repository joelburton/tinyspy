// cs-audited

import { IconClose } from '../icons'
import { ActionButton, type PurposeButtonProps } from '../buttons/ActionButton'
import styles from './TitlebarCloseButton.module.css'
import { cls } from '../../lib/util/cls'

/**
 * The ✕ that dismisses a floating panel — the titlebar's own affordance, and
 * the ONE way to write one.
 *
 * **A component rather than a CSS class**, which is the whole point: what
 * drifted here was never the paint. `InfoSheet` shipped `✕` (U+2715) against
 * this `×` (U+00D7) with its own hand-written aria-label, and a class can only
 * make two different characters look alike. This owns the glyph, the label, the
 * element and the treatment together, so the next close button is free and
 * cannot be subtly wrong.
 *
 * **Quiet, and with no border.** A bare `.secondary` IS the quiet family
 * (patterns/button.css), so the tone is the shared one — where this used to
 * hand-write a muted ink, a `--page-surface-hover-color` hover and a
 * `--field-edge-color` border, the last of which put a form FIELD's edge on a
 * button. The border is overridden away (Joel, 2026-08-25): a titlebar's dismiss
 * is furniture, not a control being offered. The hover wash stays — that is the
 * affordance.
 *
 * **Sized by the bar it sits in**, via the module — see there for how, and why
 * that needs no specificity fight.
 */
export function TitlebarCloseButton({ className, ...rest }: PurposeButtonProps) {
  return (
    <ActionButton
      icon={IconClose}
      label="Close"
      iconOnly
      tone="quiet"
      // 15 against `.icon-only`'s box, which this module shrinks to 0.7 of the
      // titlebar: the default 18 fills a 22px box wall to wall. The purpose
      // button owns its glyph size (the pattern DeleteButton set), so every
      // titlebar gets the same one.
      iconSize={15}
      className={cls(styles.close, className)}
      {...rest}
    />
  )
}
