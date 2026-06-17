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
      title={paused ? 'Game paused' : 'Pause game'}
    >
      <PauseIcon />
    </button>
  )
}

/** Two-bar pause icon — DVD-player convention. Inline SVG so it
 *  inherits `currentColor` from the button. */
function PauseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}
