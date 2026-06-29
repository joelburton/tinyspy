import type { ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cls } from '../../lib/cls'

/** The three button weights. `primary` is the base accent-filled <button>;
 *  `secondary` is the neutral outline; `danger` is the destructive weight
 *  (EndGameButton) — reserved for a red palette we'll design later, so for now it
 *  renders like `secondary` (the seam is the tone *value*, carried by the button,
 *  not yet a distinct color). */
export type ActionButtonTone = 'primary' | 'secondary' | 'danger'

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
  tone?: ActionButtonTone
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
  tone = 'secondary',
  className,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cls(
        // primary = the base accent <button>; secondary + danger both take the
        // neutral outline for now (danger's red is a later palette decision).
        tone !== 'primary' && 'secondary',
        'icon-button',
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
