import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './InfoSheet.module.css'

type Props = {
  /** Whether the sheet is slid in. Ignored on desktop, where the wrapper is
   *  `display: contents` and the child is always the visible info column. */
  open: boolean
  onClose: () => void
  /** Make the mobile sheet the FULL device width instead of the default 24rem —
   *  for games whose info column needs the room (spellingbee/boggle's WordList).
   *  No effect on desktop. */
  wide?: boolean
  /** The game's `<InfoCol>`. */
  children: ReactNode
}

/**
 * The mobile info-column sheet wrapper (docs/mobile.md → the psychicnum recipe).
 *
 * On desktop it's a `display: contents` no-op: the child (a game's InfoCol) is
 * the flex child of `.layout` exactly as before, and the ✕ is hidden. Below
 * `--mobile` it becomes a fixed off-canvas sheet slid in from the right by
 * `open` and dismissed by the ✕ — so the board column fills the freed width.
 *
 * The presentational half of the recipe. Pair it with `useInfoSheet` (the
 * open/close state + the "Game info" menu item) and the shared `.mobileFill`
 * class on the game's `.layout` (which hands the board the full width).
 */
export function InfoSheet({ open, onClose, wide = false, children }: Props) {
  return (
    // data-info-sheet: a stable hook for e2e (the class name is hashed).
    <div className={cls(styles.wrap, open && styles.open, wide && styles.wide)} data-info-sheet>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Close game info"
      >
        ✕
      </button>
      {children}
    </div>
  )
}
