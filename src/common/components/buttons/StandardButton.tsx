// cs-fixed

import type { ComponentPropsWithRef, ComponentType, ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './StandardButton.module.css'

/** A button's visual WEIGHT — its emphasis, independent of semantic tone.
 *  `primary` is the filled main action (a form's commit, a move submit);
 *  `secondary` is the outline everything else builds on. Both take any tone. */
export type ButtonWeight = 'primary' | 'secondary'

/** A button's semantic TONE — the BUTTON bucket's own vocabulary (see
 *  themes/daylight.css → BUTTON), not the outcome palette's. It colors a
 *  secondary button's border + label + glyph, or a primary button's background:
 *  `normal` = blue, `caution` = orange (Hint / Reveal), `destructive` = dark red
 *  (End / Concede / Delete), `quiet` = gray (a Cancel), `success` = a confirming
 *  yes, reserved. Tone and weight are ORTHOGONAL — all five tones work in both
 *  treatments, and each carries the values that takes. */
export type ButtonTone = 'quiet' | 'normal' | 'caution' | 'destructive' | 'success'

/** The glyph type: a component that takes a `size`. Widened past Lucide's own
 *  so a button can supply its own drawing when the registry's answer is wrong
 *  — the pause bars are drawn inline, because lucide's `Pause` is two OUTLINED
 *  rounded rects and doesn't read as the familiar media mark. The `size` prop
 *  is never passed (the module sizes the glyph in `em`); it stays in the type
 *  because Lucide's components declare it. */
export type ButtonIcon = ComponentType<{ size?: number | string; 'aria-hidden'?: boolean }>

/**
 * What every standard button takes — the native <button> attributes plus the
 * six axes. A PURPOSE BUTTON (`RestartButton`, `TrashButton`, …) takes this
 * same type, supplies defaults for some of it, and overrides nothing: every
 * axis stays reachable at every call site.
 *
 * **`undefined` means "not supplied, use the default"; `null` means "don't"**
 *. `<RestartButton />` and `<RestartButton icon={undefined} />`
 * are the same button; `<RestartButton icon={null} />` is that button with no
 * glyph. The two only differ where a default exists, which is to say inside a
 * purpose button — on a bare `<StandardButton>` both simply mean "nothing here".
 *
 * `small` is the exception, and doesn't need the rule: it is a boolean, so
 * `false` already plays the part `null` plays for the others. It is also NOT
 * `size="normal"` — `normal` is a tone, and 95% of buttons would have to type a
 * word that says nothing.
 */
export type StandardButtonProps = ComponentPropsWithRef<'button'> & {
  /** WHAT THIS BUTTON IS — "Restart", "Delete", "Back to club". The identity,
   *  and the one thing a purpose button always supplies.
   *
   *  It is not necessarily what you SEE: `label` is what gets drawn, and it
   *  defaults to this. When the label is suppressed the name lives on as the
   *  hover bubble and the accessible name, so an icon-only button is still
   *  findable and still says what it does.
   *
   *  **This shadows the DOM `name` attribute deliberately.** No button in the
   *  app uses native form submission with a named button (every form goes
   *  through an RPC), and a button's identity is worth the better word. */
  name: string
  /** WHAT IS DRAWN. Defaults to `name`; pass a different string to deviate
   *  ("Start over" on a Restart), or `null` to draw no text at all — which is
   *  what makes it an icon-only button.
   *
   *  A ReactNode, because the drawn label is CONTENT while `name` is identity:
   *  the setup dialog's Start wraps part of its own text in a span the phone
   *  breakpoint hides ("Start" + "PsychicNum · Co-op"), and that is a rendering
   *  detail, not a second name. */
  label?: ReactNode | null
  /** THE GLYPH. Defaults to the purpose button's; `null` draws none. A standard
   *  button may carry a label, an icon, or both — neither is required. */
  icon?: ButtonIcon | null
  /** The styled hover bubble (`data-tooltip`, rendered by TooltipHost — the
   *  fast replacement for the native `title`, which some browsers delay past
   *  the point anyone notices).
   *
   *  Omit it and the bubble says the NAME, but only when the name isn't already
   *  drawn — a bubble reading "Cancel" over a button reading "Cancel" is noise.
   *  Pass a string to say something richer ("End the game for everyone"), which
   *  shows in both cases. Pass `null` for no bubble at all. */
  tooltip?: string | null
  /** Filled (`primary`) vs the default outline (`secondary`). */
  weight?: ButtonWeight
  /** Semantic color, in either treatment. Defaults to `normal`. */
  tone?: ButtonTone
  /** Tighter padding, smaller type, and a glyph that follows both. */
  small?: boolean
  /** FILL THE WIDTH the button is given, instead of hugging its label.
   *
   *  For a button that is the whole content of its row rather than one control
   *  beside others — a stacked pair in a small card, where two hugging buttons
   *  of different label lengths read as ragged. Meaningless on an icon-only
   *  button, which is a fixed square by definition. */
  fullWidth?: boolean
  /** Per-glyph size multiplier, for the Lucide glyphs that read denser or
   *  looser than the rest at the same nominal size (the trash can wants 1.2, a
   *  titlebar ✕ wants 0.85). A multiplier rather than a pixel count, so it
   *  stays right when the button changes size. */
  iconScale?: number
}

/**
 * What a PURPOSE BUTTON takes: everything a standard button does, except that
 * `name` is optional because the purpose button already knows its own.
 *
 * Purpose buttons supply defaults **as default parameters**, not by spreading
 * over them, and that is load-bearing: a default parameter treats an explicitly
 * passed `undefined` exactly like an omitted prop, which is the
 * `undefined` = "use the default" half of the rule. A JSX spread would not — it
 * would override the default with the undefined.
 */
export type PurposeButtonProps = Omit<StandardButtonProps, 'name'> & { name?: string }

/**
 * A STANDARD BUTTON — the app's ordinary button, and the only general button
 * component there is.
 *
 * ONE button, not a family: an info-column action, a form's
 * Cancel and a dialog's acknowledgment are this control wearing different
 * tones. Every axis is optional — a button with no glyph, no label, or neither
 * is still this one — so there is never a reason to hand-write a `<button>` to
 * escape a required prop.
 *
 * Everything a standard button looks like lives in its module. There are no
 * global button classes to compose.
 *
 * The families that are NOT this: a game piece, a keycap, a segmented choice, a
 * page-header mark, and the board's round `ShuffleButton`.
 *
 * A ✕ dismiss IS this button — a glyph, no label, no border — packaged as
 * `<CloseButton>`.
 */
export function StandardButton({
  name,
  label,
  icon,
  tooltip,
  weight = 'secondary',
  tone = 'normal',
  small,
  fullWidth,
  iconScale,
  className,
  style,
  ...rest
}: StandardButtonProps) {
  // `undefined` falls through to the name, `null` suppresses. `??` would treat
  // the two alike, which is the whole distinction, so this is written out.
  const drawn = label === undefined ? name : label
  const Icon = icon ?? undefined

  // The bubble says the name only when the name isn't already on screen; an
  // explicit tooltip always shows. `tooltip === null` is "no bubble", which
  // `??` cannot express either.
  const bubble =
    tooltip === null ? undefined : tooltip !== undefined ? tooltip : drawn === null ? name : undefined

  return (
    <button
      type="button"
      className={cls(
        styles.standardButton,
        // The treatment. There is no unmarked default — add a third weight one
        // day and it arrives needing a class of its own, which is exactly when
        // someone should be forced to think about it.
        styles[weight],
        // Every tone gets its class, quiet included: quiet is the SECONDARY
        // default in the theme but not the primary one, so skipping it here
        // painted a quiet primary action-blue.
        styles[tone],
        small && styles.small,
        fullWidth && styles.fullWidth,
        drawn === null && styles.iconOnly,
        className,
      )}
      style={
        iconScale === undefined
          ? style
          : { ...style, ['--standardButton-icon-scale' as string]: iconScale }
      }
      // The name has to reach the DOM somehow when it isn't drawn — it is what
      // the bubble says and what tests find the button by.
      aria-label={drawn === null ? name : undefined}
      data-tooltip={bubble}
      // Suppress focus-steal on mouse click: the capture-input games
      // (spellingbee) read keystrokes off the window, so a clicked button must
      // not grab focus or the next typed letter goes nowhere. Harmless
      // everywhere else (onClick still fires). Before {...rest} so a caller can
      // override it.
      onMouseDown={(e) => e.preventDefault()}
      // Last, so every axis above — `type` included — is overridable at the
      // call site. A form's commit passes `type="submit"` and it wins.
      {...rest}
    >
      {Icon && <Icon aria-hidden />}
      {drawn}
    </button>
  )
}
