// cs-blessed-info-sheet

import { type ReactNode } from 'react'
import { useDismissOnEscape } from '../keyboard/useDismissOnEscape'
import { cls } from '../utils/cls'
import styles from './InfoSheet.module.css'

type Props = {
  // Whether the sheet is slid in. Ignored on desktop, where the wrapper is
  // `display: contents` and the child is always the visible info column.
  open: boolean
  onClose: () => void
  // The game's `<InfoCol>`.
  children: ReactNode
}

/**
 * The mobile info-column sheet wrapper (doc.md → Details).
 *
 * On desktop it's a `display: contents` no-op: the child (a game's InfoCol) is
 * the flex child of `.layout`. Below `--mobile` it becomes a fixed, FULL-BLEED
 * page slid in from the right by `open` — the second of the two mobile pages,
 * reached by the header's switch button.
 *
 * The presentational half of the recipe. Pair it with `useInfoSheet` (the open
 * flag and a way to close) and the shared `.mobileFill` class on the game's
 * `.layout` (which hands the board the full width).
 */
export function InfoSheet({ open, onClose, children }: Props) {
  // Escape closes the open sheet — the keyboard-tablet expectation (a supported
  // class). This is the CHEAP HALF of dialog behavior; the full treatment
  // (move focus into the sheet on open + restore on close, trap Tab, dismiss by
  // tapping outside) is deliberately deferred — see docs/deferred.md → Mobile.
  // Bound only while open, so it never competes with a game's own key handling
  // when the sheet is shut, and it stops there rather than also closing a panel
  // above the sheet (`useDismissOnEscape`).
  useDismissOnEscape(open, onClose)

  return (
    // data-info-sheet: a stable hook for e2e (the class name is hashed).
    //
    // Dialog semantics are applied ONLY when `open` — which is only ever true on
    // mobile, where the wrapper is a real off-canvas sheet. On desktop the
    // wrapper is `display: contents` and `open` is always false, so the
    // always-visible info column is NOT (mis)announced as a modal dialog. We
    // stop at role + aria-modal + a label (the honest "this is a modal" hint);
    // we don't yet make outside content `inert`, matching the deferred cut above.
    //
    // It declares NO tab ring, unlike a floating panel: this is the game page's
    // own info column slid into view on a phone, its controls are tap targets,
    // and the page's ring — empty — is the right one to be answering Tab.
    <div
      className={cls(styles.wrap, open && styles.open)}
      data-info-sheet
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? 'Game info' : undefined}
    >
      {children}
    </div>
  )
}
