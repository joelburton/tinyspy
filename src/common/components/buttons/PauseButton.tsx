import styles from './PauseButton.module.css'

type Props = {
  paused: boolean
  onPause: () => void
}

/**
 * The pause affordance in the GamePage header. Click fires
 * manual pause via `onPause` (wired to `sendManualPause` from
 * `useCommonGame` at the GamePage level).
 *
 * Disabled when the game is already paused — the resume
 * affordance lives on `<PauseOverlay>`, not in the header. This
 * is deliberate: we want a single-purpose "pause now" icon, not
 * a toggle, so the header stays semantically simple.
 *
 * Always present, even on untimed games. Manual pause is
 * universal: "moth is making tea" doesn't depend on whether
 * there's a clock to freeze. Per docs/ui.md → GamePage header.
 */
export function PauseButton({ paused, onPause }: Props) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onPause}
      disabled={paused}
      aria-label={paused ? 'Game paused' : 'Pause game'}
      data-tooltip={paused ? 'Game paused' : 'Pause game'}
    >
      {/* Pause glyph — inherits `currentColor` from the button. The button
       *  carries the label, so the icon is decorative. */}
      <PauseGlyph size={20} />
    </button>
  )
}

/** The traditional pause glyph: two solid vertical bars. Drawn inline rather
 *  than taken from the icons registry — lucide's `Pause` is two OUTLINED
 *  rounded rects, which doesn't read as the familiar pause mark. The rounded
 *  "button" rect around it is the button's own CSS border, not part of the
 *  glyph, so hover/disabled chrome stays on real button state. */
function PauseGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}
