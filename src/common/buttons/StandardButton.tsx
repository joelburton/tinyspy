// cs-blessed-buttons

import type { ComponentPropsWithRef, ReactNode } from 'react'
import { IconGeneric, type AppIcon } from '../icons/icons'
import { buttonIconScale } from './iconScale'
import { cls } from '../utils/cls'
import styles from './StandardButton.module.css'

/** A button's visual WEIGHT — its emphasis, independent of semantic tone.
 *  `primary` is the filled main action (a form's commit, a move submit);
 *  `secondary` is the outline everything else builds on. Both take any tone. */
export type ButtonWeight = 'primary' | 'secondary'

/** A button's semantic TONE — the BUTTON bucket's own vocabulary (see
 *  themes/daylight.css → BUTTON), not the outcome palette's. It colors a
 *  secondary button's border + label + glyph, or a primary button's background:
 *  `normal` = blue, `caution` = orange, `destructive` = dark red, `quiet` =
 *  gray, `success` = a confirming yes, reserved. Tone and weight are
 *  ORTHOGONAL — all five tones work in both treatments, and each carries the
 *  values that takes. */
export type ButtonTone = 'quiet' | 'normal' | 'caution' | 'destructive' | 'success'

/**
 * WHAT THE BUTTON DRAWS — its glyph, its words, or both.
 *
 * Every call site says this out loud, and that is the whole point: reading
 * `<TrashButton show="icon" />` you know what appears without opening
 * `TrashButton`. No component defaults it, deliberately — a default here
 * means two call sites that look alike draw different things, and you cannot
 * tell which without leaving the file you are reading.
 *
 * It is separate from `label`, which carries the WORDS. Form and text are two
 * decisions and a button can want any pair of them: `show="label"` with a
 * `label` of your own, `show="icon"` with a `label` that survives as the hover
 * bubble and the accessible name.
 */
export type ButtonShow = 'icon' | 'label' | 'both'

/** The glyph type — the icon registry's own `AppIcon`, under the name a button
 *  call site reads it by. One type, so a glyph held as an `AppIcon` (a menu
 *  row's, an action's) can be handed straight to a button. */
export type ButtonIcon = AppIcon

/**
 * What every standard button takes — the native <button> attributes plus the
 * axes below. A PURPOSE BUTTON (`TrashButton`, `CancelButton`, …) takes this
 * same type, supplies defaults for some of it, and overrides nothing: every
 * axis stays reachable at every call site.
 *
 * **Two props are REQUIRED, and between them they say what the button is:**
 * `label` (the words) and `show` (which parts appear). A purpose button
 * supplies the first; nobody supplies the second, because guessing it is the
 * thing that made call sites unreadable.
 *
 * `small` is a boolean rather than a size word, and is NOT `size="normal"` —
 * `normal` is a tone, and 95% of buttons would have to type a word that says
 * nothing.
 */
export type StandardButtonProps = ComponentPropsWithRef<'button'> & {
  /** THE WORDS — "Restart", "Delete", "Club". Drawn when `show` includes them,
   *  and the button's identity either way: when `show="icon"` this is what the
   *  hover bubble says and what the button is called, so an icon-only button is
   *  still findable and still says what it does.
   *
   *  A purpose button supplies a default, so a call site passes this only to
   *  deviate ("Start over" on a Restart).
   *
   *  A ReactNode rather than a string, because the drawn label is CONTENT: the
   *  setup dialog's Start wraps part of its own text in a span the phone
   *  breakpoint hides ("Start" + "PsychicNum · Co-op"). Pass a plain string
   *  unless you need that — an icon-only button has nowhere to put markup, and
   *  its accessible name comes from this. */
  label: ReactNode
  /** WHICH PARTS ARE DRAWN. Required, always, at every call site. */
  show: ButtonShow
  /** THE GLYPH. Defaults to the purpose button's, or to a generic square for
   *  the one button with no glyph of its own, so `show="both"` always draws
   *  two things. */
  icon?: ButtonIcon
  /** The styled hover bubble (`data-tooltip`, rendered by TooltipHost — the
   *  fast replacement for the native `title`, which some browsers delay past
   *  the point anyone notices).
   *
   *  Defaults to the `label`, but only shows when the label ISN'T drawn — a
   *  bubble reading "Cancel" over a button reading "Cancel" is noise. Pass a
   *  string to say something richer ("End the game for everyone"), which shows
   *  in both cases, or when the drawn words are shorter than the button's real
   *  name (Back-to-club draws "Club" and is called "Back to club"). Pass
   *  `null` for no bubble at all — the accessible name still comes from the
   *  label. */
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
   *  of different label lengths read as ragged. Meaningless on `show="icon"`,
   *  which is a fixed square by definition. */
  fullWidth?: boolean
  /** Per-glyph size multiplier, for the Lucide glyphs that read denser or
   *  looser than the rest at the same nominal size (the trash can wants 1.2, a
   *  titlebar ✕ wants 0.85). A multiplier rather than a pixel count, so it
   *  stays right when the button changes size. */
  iconScale?: number
}

/**
 * What a PURPOSE BUTTON takes: everything a standard button does, except that
 * `label` is optional because the purpose button already knows its own words.
 * `show` stays REQUIRED — that is the one thing no component may decide for its
 * call sites.
 *
 * Purpose buttons supply defaults **as default parameters**, not by spreading
 * over them, and that is load-bearing: a default parameter treats an explicitly
 * passed `undefined` exactly like an omitted prop. A JSX spread would not — it
 * would override the default with the undefined.
 */
export type PurposeButtonProps = Omit<StandardButtonProps, 'label'> & { label?: ReactNode }

/**
 * A STANDARD BUTTON — the app's ordinary button, and the only general button
 * component there is.
 *
 * ONE button, not a family: an info-column action, a form's Cancel and a
 * dialog's acknowledgment are this control wearing different tones. Reach for a
 * purpose button (`CancelButton`, `FormSubmitButton`, `TrashButton`, …) when
 * one names what you are doing; reach for this directly for a one-off whose
 * words appear nowhere else — a dialog's "Got it", "Reload", "Try again".
 *
 * **A game's COMMANDS do not come through here.** New game, Concede, Shuffle
 * and the rest are actions (`common/actions`), placed with `<ActionButton>`,
 * which is where their words, glyph, tone and key come from. The purpose
 * buttons that used to name them are gone.
 *
 * Everything a standard button looks like lives in its module. There are no
 * global button classes to compose.
 *
 * The families that are NOT this: a game piece, a keycap, a segmented choice, a
 * page-header mark, and the board's round `ShuffleButton`.
 *
 * A ✕ dismiss IS this button — a glyph, no words, no border — packaged as
 * `<CloseButton>`.
 */
export function StandardButton({
  label,
  show,
  icon = IconGeneric,
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
  const Icon = icon
  const iconOnly = show === 'icon'
  const scale = iconScale ?? buttonIconScale(icon)

  // What the button is CALLED — its words, unless a `tooltip` says otherwise.
  // Back-to-club is why that override exists: it draws "Club" and is called
  // "Back to club", and the longer one is what a player hovers and what the
  // suite finds it by. Only a string can serve as a name; a label carrying
  // markup is already in the DOM as text, which names the button on its own.
  const words = typeof label === 'string' ? label : undefined
  const called = tooltip ?? words

  // The bubble says the name only when the name isn't already on screen; an
  // explicit tooltip always shows. `tooltip === null` is "no bubble", which
  // `??` cannot express.
  const bubble = tooltip === null ? undefined : (tooltip ?? (iconOnly ? words : undefined))

  // Only worth saying when the name is not already the visible text — which is
  // every icon-only button, and the handful whose tooltip renames them.
  const drawnText = iconOnly ? undefined : words
  const ariaLabel = called !== drawnText ? called : undefined

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
        iconOnly && styles.iconOnly,
        className,
      )}
      style={
        // A few glyphs don't read right at this size and say so in
        // `iconScale.ts`; an explicit prop still wins over what they say.
        scale === undefined ? style : { ...style, ['--standardButton-icon-scale' as string]: scale }
      }
      // The name has to reach the DOM somehow when the drawn words aren't it —
      // it is what the bubble says and what tests find the button by.
      aria-label={ariaLabel}
      // A glyph with no words, said in the DOM so another stylesheet can ask.
      // `modalActions` uses it to keep its text-button width floor off a lone
      // icon; the class that draws it is hashed per module and unreachable
      // from there.
      data-icon-only={iconOnly ? '' : undefined}
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
      {show !== 'label' && <Icon aria-hidden />}
      {show !== 'icon' && label}
    </button>
  )
}
