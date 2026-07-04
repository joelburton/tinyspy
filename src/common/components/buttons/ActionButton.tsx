import type { ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cls } from '../../lib/util/cls'
import styles from './ActionButton.module.css'

/** A button's visual WEIGHT — its emphasis, independent of semantic tone.
 *  `primary` is the filled-accent main action (SubmitButton); `secondary` is the
 *  neutral outline everything else builds on. */
export type ButtonWeight = 'primary' | 'secondary'

/** A button's semantic TONE — the SAME vocabulary + palette as the feedback
 *  pills (docs/design-decisions.md → Action buttons / Tones), coloring a
 *  secondary (outline) button's border + text + icon. `neutral` is the plain
 *  outline; `warning` = dark amber (Hint / Reveal), `error` = dark red (End),
 *  etc. Tone is meaningful only for secondary weight — a `primary` button is the
 *  filled accent and ignores it. */
export type ButtonTone = 'neutral' | 'success' | 'error' | 'warning' | 'info' | 'near'

/**
 * Props every PURPOSE button (SubmitButton, EndGameButton, DeleteButton, …)
 * accepts: the native <button> attributes (onClick, disabled, type, …), plus an
 * optional `label` override and the `iconOnly` toggle. The glyph, tone, and
 * icon-size are baked into each purpose component (that's the whole point —
 * consistency), so they're deliberately NOT here.
 */
export type PurposeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Override the default label. With `iconOnly` it's the aria-label + tooltip;
   *  otherwise it's the visible text. Each purpose button supplies its own
   *  default (SubmitButton → "Submit"), so you only pass this to deviate. */
  label?: string
  /** Render just the icon (no visible text); `label` becomes the aria-label +
   *  title so the control stays accessible. */
  iconOnly?: boolean
}

type ActionButtonProps = PurposeButtonProps & {
  /** The Lucide glyph (from the semantic icons registry). */
  icon: LucideIcon
  /** Resolved label (the purpose button has already applied its default). */
  label: string
  /** Per-glyph display size. Lives here, not in the icons registry: the same
   *  glyph appears at different sizes in different buttons, and `.icon-only`'s
   *  fixed box means a bigger glyph doesn't change the button's footprint. */
  iconSize?: number
  /** Filled-accent (`primary`) vs the default outline (`secondary`). */
  weight?: ButtonWeight
  /** Semantic color for a secondary button's outline (default `neutral`). */
  tone?: ButtonTone
}

/**
 * The shared SHAPE of a game-action button — the one place the icon+label
 * layout, the tone→class mapping, the icon-only fixed-box, and the
 * focus-suppression live. Purpose buttons (SubmitButton, …) are thin wrappers
 * that supply `icon` / `label` / `tone` / `iconSize`; this owns everything they
 * have in common, so a new purpose button is a one-liner and they can't drift.
 *
 * This sits alongside ShuffleButton / PauseButton / BackToClubButton (which are
 * already purpose-buttons) and extends that pattern to the labelled action
 * buttons. The look comes from the shared global classes (`icon-button`,
 * `secondary`, `icon-only` — see theme.css), composed here once.
 */
export function ActionButton({
  icon: Icon,
  label,
  iconOnly,
  iconSize = 18,
  weight = 'secondary',
  tone = 'neutral',
  className,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cls(
        // primary = the base accent <button>; secondary = the outline shape.
        weight === 'secondary' && 'secondary',
        'icon-button',
        // Semantic tone recolors a secondary button's outline (see the module).
        tone !== 'neutral' && styles[tone],
        iconOnly && 'icon-only',
        className,
      )}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      // Suppress focus-steal on mouse click: the capture-input games (spellingbee)
      // read keystrokes off the window, so a clicked button must not grab focus
      // or the next typed letter goes nowhere. Harmless everywhere else (onClick
      // still fires). Before {...rest} so a caller can override it.
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
    >
      <Icon size={iconSize} aria-hidden />
      {!iconOnly && label}
    </button>
  )
}
