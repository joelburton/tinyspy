// cs-unmet

import { PageHeaderButton } from '../chrome/PageHeaderButton'
import styles from './PauseButton.module.css'

type Props = {
  /** Is the game paused right now — from either source? */
  paused: boolean
  /** Is that pause a MANUAL one (someone pressed this button)? A presence
   *  pause — we're waiting on a player who left — is not clearable from here. */
  manual: boolean
  onPause: () => void
  onUnpause: () => void
}

/**
 * The pause affordance in the GamePage header: ONE button with two faces.
 *
 *   playing            two bars — press to pause
 *   manually paused    a triangle — press to resume
 *   presence-paused    a triangle, dimmed and inert
 *
 * WHY A TOGGLE. A pause control that only pauses leaves the header lying about
 * the state of the game: the bars still say "press to pause" while the game is
 * already stopped, and the only honest thing it can do about that is grey
 * itself out — which is a control saying "not now" when what it should say is
 * "here is how you get out". One button that changes face says both what the
 * game IS doing and what you can do about it, in the place your eye already
 * goes, and it costs the header no width to do it. It also puts resume where a
 * player on a phone can reach it without the overlay being the only route.
 *
 * The third state is the one worth reading twice. When the game is paused
 * because someone left, the button still shows the resume face, because that IS
 * the state of the game — but it is disabled, because you cannot clear that
 * pause: the player we are waiting on has to come back, or someone shelves the
 * game from the overlay. A control that looked pressable and did nothing would
 * be worse than one that says "not yours to undo".
 *
 * Resuming from here needs no permission check — `PauseOverlay` already
 * documents that any connected player may resume, with no privileged
 * "original pauser".
 *
 * NOT RENDERED once the game is over (GamePage decides). `useCommonGame` forces
 * `paused` false at `ended_at`, so a pause button on a finished game could only
 * ever look live and do nothing — and hiding it hands the phone header back
 * ~38px at exactly the moment there is nothing to pause. The page switch stays
 * flush right through the change: it is the last child of a slot the left side
 * grows into.
 *
 * A `<PageHeaderButton>` rather than a toned one: it is a mark in the header, not
 * an action being offered (docs/ui.md → the button taxonomy). The resume face
 * is green — see the module.
 */
export function PauseButton({ paused, manual, onPause, onUnpause }: Props) {
  const resumable = paused && manual
  return (
    <PageHeaderButton
      icon={paused ? PlayGlyph : PauseGlyph}
      iconSize={20}
      label={paused ? (manual ? 'Resume game' : 'Waiting for a player') : 'Pause game'}
      className={resumable ? styles.resume : undefined}
      disabled={paused && !manual}
      onClick={resumable ? onUnpause : onPause}
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

/** Its partner: the solid play triangle, drawn to the same optical weight and
 *  in the same 20-unit box, so the two faces swap without the button's contents
 *  changing size. Inline for the same reason as the bars — lucide's `Play` is
 *  an outline. */
function PlayGlyph({ size }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 4l10 6-10 6z" fill="currentColor" />
    </svg>
  )
}
