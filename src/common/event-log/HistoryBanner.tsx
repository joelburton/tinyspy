// cs-blessed-event-log

import type { ReactNode } from 'react'
import type { Actor } from '../members/member'
import { DotActor } from '../members/ActorMention'
import styles from './historyViewer.module.css'

/**
 * The turn viewer's **banner** — the opaque strip that says which past turn you
 * are looking at, laid over the game's input area while the viewer is open.
 * Render it while `isViewingHistory`, inside the below-board box the game gives it; that
 * box is the game's to size and to make a positioning context (`.historyBannerHost`).
 *
 * `label` is what the turn was — usually the game's description string, but a
 * `ReactNode` because scrabble names a teammate with a `<Dot>`. It truncates
 * rather than wrapping, so the banner is always one line and the ✕ never moves.
 *
 * `actor` names WHOSE board is on screen, and is passed only when that is not
 * the viewer's own: at terminal a compete log opens up, and a `#N` there
 * replays the board of the player who made that move. It reads
 * "● moth: GUESS 3" — the dot and the name, then the game's own label. Not
 * "moth's board": player names are never apostrophized anywhere in the app.
 *
 * `onExit` is `useHistoryViewer`'s `exitHistory`. The whole banner is a
 * click-to-exit target and the ✕ is the visible way to do it; both call it.
 * Neither carries a tooltip: an ✕ that closes the thing it sits in needs no
 * explaining.
 */
export function HistoryBanner({
  label,
  actor,
  onExit,
}: {
  label: ReactNode
  actor?: Actor | null
  onExit: () => void
}) {
  return (
    // `data-history-banner` is the spec handle (the repo's `[data-board]` /
    // `[data-cell]` convention), so no spec has to match the label's wording.
    <div className={styles.historyBanner} onClick={onExit} data-history-banner>
      <span className={styles.historyBannerLabel}>
        {actor && (
          <>
            <DotActor actor={actor} show="both" />
            {': '}
          </>
        )}
        {label}
      </span>
      <button
        type="button"
        className={styles.historyBannerExit}
        // The wrapper exits too, so this only keeps the click from being counted
        // twice on its way out.
        onClick={(e) => {
          e.stopPropagation()
          onExit()
        }}
        aria-label="Exit history"
      >
        ✕
      </button>
    </div>
  )
}
