// cs-met-turn-log

import type { ReactNode } from 'react'
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
 * `onExit` is `useHistoryViewer`'s `exitHistory`. The whole banner is a
 * click-to-exit target and the ✕ is the visible way to do it; both call it.
 * Neither carries a tooltip: an ✕ that closes the thing it sits in needs no
 * explaining.
 */
export function HistoryBanner({ label, onExit }: { label: ReactNode; onExit: () => void }) {
  return (
    // `data-history-banner` is the spec handle (the repo's `[data-board]` /
    // `[data-cell]` convention). The specs matched `[title="Click to exit"]`
    // until the title went, which is a brittle way to find anything.
    <div className={styles.historyBanner} onClick={onExit} data-history-banner>
      <span className={styles.historyBannerLabel}>{label}</span>
      <button
        type="button"
        className={styles.historyBannerExit}
        // The wrapper exits too, so this only keeps the click from being counted
        // twice on its way out.
        onClick={(e) => {
          e.stopPropagation()
          onExit()
        }}
        aria-label="Exit viewing"
      >
        ✕
      </button>
    </div>
  )
}
