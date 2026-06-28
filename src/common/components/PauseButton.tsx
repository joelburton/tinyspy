import { Pause } from 'lucide-react'
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
      {/* Lucide pause glyph — inherits `currentColor` from the button. The
       *  button carries the label, so the icon is decorative. */}
      <Pause size={20} aria-hidden />
    </button>
  )
}
