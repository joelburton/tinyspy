import type { ButtonHTMLAttributes, ComponentType } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './ActionButton.module.css'

/** A button's visual WEIGHT — its emphasis, independent of semantic tone.
 *  `primary` is the filled main action (SubmitButton); `secondary` is the
 *  outline everything else builds on. Both take any tone. */
export type ButtonWeight = 'primary' | 'secondary'

/** A button's semantic TONE — CHROME's own vocabulary (theme.css → CHROME), not
 *  the outcome palette's. It colors a secondary button's border + text + icon,
 *  or a primary button's background: `action` = blue, `caution` = orange (Hint /
 *  Reveal), `destructive` = dark red (End / Concede), `quiet` = grey (a dialog's
 *  Cancel). Tone and weight are ORTHOGONAL — all four tones work in both
 *  treatments, and each tone carries the five values that takes. */
export type ButtonTone = 'quiet' | 'action' | 'caution' | 'destructive'

/**
 * The DEFAULT tone is `action`: everything that goes through a purpose button is
 * something you do — Clear, Delete, Help, Zoom-fit — and the audit found no
 * consumer that wanted the quiet grey. The cancels don't come through here at
 * all; they are dialog buttons wearing the bare `secondary` class, whose slots
 * default to quiet in theme.css. A caller CAN pass `tone="quiet"`, and should
 * only do so for something that means "never mind".
 */

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
   *  tooltip so the control stays accessible. */
  iconOnly?: boolean
  /** The styled hover tooltip (the fast `data-tooltip` bubble — see TooltipHost;
   *  the native `title` was too slow to appear in some browsers). Defaults to
   *  the label, so every button has one; pass this to say something richer
   *  than the label ("End the game for everyone"). */
  tooltip?: string
}

type ActionButtonProps = PurposeButtonProps & {
  /** The glyph. Usually a Lucide icon from the semantic registry — the type is
   *  widened to "a component that takes a size" so a button can supply its own
   *  when the registry's answer is wrong: the pause bars are drawn inline,
   *  because lucide's `Pause` is two OUTLINED rounded rects and doesn't read as
   *  the familiar media mark. */
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean }>
  /** Resolved label (the purpose button has already applied its default). */
  label: string
  /** Per-glyph display size. Lives here, not in the icons registry: the same
   *  glyph appears at different sizes in different buttons, and `.icon-only`'s
   *  fixed box means a bigger glyph doesn't change the button's footprint. */
  iconSize?: number
  /** Filled (`primary`) vs the default outline (`secondary`). */
  weight?: ButtonWeight
  /** Semantic color, in either treatment (default `action`). */
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
  tone = 'action',
  tooltip,
  className,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={cls(
        // Every purpose button is a GENERAL button (docs/ui.md) — flat, tone-
        // coloured, hover on colour alone. `.button` is the SHAPE and paints
        // nothing; the treatment paints everything, and there is no unmarked
        // default — which is why `weight` can be the class name directly. Add a
        // third weight one day and it cannot be forgotten here: it arrives
        // needing a class of its own.
        'button',
        weight,
        'icon-button',
        // Semantic tone recolors the filled background (primary) or the
        // outline + label (secondary) — it re-sets the slot tokens both read
        // (see the module). Every tone gets its class, quiet included: quiet is
        // the SECONDARY default in theme.css but not the primary one, so
        // skipping it here painted a quiet primary action-blue.
        styles[tone],
        iconOnly && 'icon-only',
        className,
      )}
      aria-label={iconOnly ? label : undefined}
      // The styled hover bubble (TooltipHost, via [data-tooltip]) — replaces the
      // native `title`, which some browsers delay past noticing.
      data-tooltip={tooltip ?? label}
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
