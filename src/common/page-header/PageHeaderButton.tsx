// cs-unmet

import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'
import { cls } from '../utils/cls'
import styles from './PageHeaderButton.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The glyph. Takes `size` — lucide's icons and our own inline ones both do. */
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean }>
  /** Per-glyph display size. Here rather than in the icons registry: the same
   *  glyph appears at different sizes in different places. */
  iconSize?: number
  /** What the control does, as a sentence. There is no visible text, so this is
   *  the accessible name AND the hover tooltip. */
  label: string
  /** Override the tooltip when it should differ from the label. */
  tooltip?: string
  /** A small decoration pinned to the button — chat's unread count. NOT a
   *  label: this button is icon-only by definition, and the glyph is the whole
   *  message. The module supplies the positioning anchor. */
  badge?: ReactNode
}

/**
 * A MARK IN THE PAGE HEADER — the menu-adjacent controls that strip carries: the
 * chat and scratchpad bubbles, the pause button, the mobile page switch. An ink
 * glyph, no border, no fill, a soft background on hover.
 *
 * Named for where it lives, because that is the whole of its scope: this look is
 * for the header and nowhere else. Its stylesheet is a module rather than a
 * global class for the same reason — nothing can wear the look by sprinkling a
 * class name on; you render the component.
 *
 * A component rather than a shared class, for the reason `<PageHeader>` gives
 * about itself: a shared stylesheet with several consumers and no component is a
 * component waiting to be written. The wiring each consumer would otherwise
 * repeat is the point — the aria-label, the styled tooltip, and the mousedown
 * suppression.
 *
 * That last one is not optional: the capture-input games (spellingbee and its
 * siblings) read keystrokes off the window, so a clicked button must not take
 * focus or the next letter typed goes nowhere.
 *
 * FOUR CHANNELS, and they stay independent — which is why none of them is the
 * background twice over:
 *
 *   glyph fill    who wrote the unread message   (chat's own rule)
 *   border        the panel this toggles is open (aria-pressed / -expanded)
 *   background    hovered (pointer devices only) / pressed
 *   dimmed        inert, and you cannot change that
 *
 * NOT toned, but it borrows one: quiet's two washes, with the glyph kept in body
 * ink. A consumer that needs its glyph a different color says so in its own
 * class (PauseButton's resume green).
 */
export function PageHeaderButton({
  icon: Icon,
  iconSize = 18,
  label,
  tooltip,
  badge,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cls(styles.button, className)}
      aria-label={label}
      // The styled hover bubble (TooltipHost, via [data-tooltip]) — replaces the
      // native `title`, which some browsers delay past noticing.
      data-tooltip={tooltip ?? label}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden />
      {badge}
    </button>
  )
}
