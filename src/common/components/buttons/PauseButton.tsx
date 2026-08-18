import { ActionButton } from './ActionButton'

type Props = {
  paused: boolean
  onPause: () => void
}

/**
 * The pause affordance in the GamePage header. Click fires manual pause via
 * `onPause` (wired to `sendManualPause` from `useCommonGame` at the GamePage
 * level).
 *
 * Disabled when the game is already paused — the resume affordance lives on
 * `<PauseOverlay>`, not in the header. This is deliberate: we want a
 * single-purpose "pause now" icon, not a toggle, so the header stays
 * semantically simple.
 *
 * Always present, even on untimed games. Manual pause is universal: "moth is
 * making tea" doesn't depend on whether there's a clock to freeze. Per
 * docs/ui.md → GamePage header.
 *
 * It is an `ActionButton` like every other purpose button, in the QUIET tone —
 * pausing is a real thing you can do, but it is never the thing we are pointing
 * you at. It was hand-rolled with its own stylesheet until 2026-08-18, for no
 * reason its comments ever gave; the module said it wanted "a visible
 * rounded-rect border so the glyph reads as a proper pause BUTTON", and then
 * drew that border in a PAGE token (`--page-surface-border-color`) far too faint
 * to deliver it.
 */
export function PauseButton({ paused, onPause }: Props) {
  const label = paused ? 'Game paused' : 'Pause game'
  return (
    <ActionButton
      icon={PauseGlyph}
      iconSize={20}
      label={label}
      iconOnly
      tone="quiet"
      onClick={onPause}
      disabled={paused}
    />
  )
}

/** The traditional pause glyph: two solid vertical bars. Drawn inline rather
 *  than taken from the icons registry — lucide's `Pause` is two OUTLINED
 *  rounded rects, which doesn't read as the familiar pause mark. */
function PauseGlyph({ size }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}
