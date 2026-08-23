// cs-unmet

import type { ButtonHTMLAttributes, ComponentType } from 'react'
import { cls } from '../../lib/util/cls'

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
}

/**
 * The shared SHAPE of a bare icon control — the header's marks: an ink glyph,
 * no border, no fill, a soft background on hover (`.bare-icon-button` in
 * patterns/button.css).
 *
 * A component rather than "apply the class yourself", for the reason
 * `<PageHeader>` gives about itself: a shared stylesheet with several consumers
 * and no component is a component waiting to be written. The wiring each
 * consumer would otherwise repeat is the whole point — the aria-label, the
 * styled tooltip, and the mousedown suppression.
 *
 * That last one is not optional: the capture-input games (spellingbee and its
 * siblings) read keystrokes off the window, so a clicked button must not take
 * focus or the next letter typed goes nowhere.
 *
 * NOT toned. There is no family here and no `secondary` beneath it — an ink
 * glyph is the whole treatment, which is why this sits outside the five button
 * families rather than inside them as a sixth. A consumer that needs its glyph
 * a different color says so in its own class (PauseButton's resume green).
 */
export function BareIconButton({
  icon: Icon,
  iconSize = 18,
  label,
  tooltip,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={cls('bare-icon-button', className)}
      aria-label={label}
      // The styled hover bubble (TooltipHost, via [data-tooltip]) — replaces the
      // native `title`, which some browsers delay past noticing.
      data-tooltip={tooltip ?? label}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden />
    </button>
  )
}
