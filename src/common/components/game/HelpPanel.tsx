import type { ReactNode } from 'react'
import { FloatingPanel } from '../panels/FloatingPanel'
import styles from './HelpPanel.module.css'

type Props = {
  /** The game's user-facing brand — the title reads "How to play {brand}". */
  brand: string
  onClose: () => void
  /** Panel size; defaults to a middle size that fits most rules copy. Games
   *  whose rules run longer/shorter pass their own to avoid scroll/whitespace. */
  size?: { width: number; height: number }
  minSize?: { width: number; height: number }
  /** The game's rules copy. */
  children: ReactNode
}

/**
 * The shared help / rules modal frame every game's `Help.tsx` renders into —
 * the `FloatingPanel` + the uniform "How to play {brand}" title + the
 * right-aligned "Got it" close button. A game's `Help` is now just its rules
 * copy wrapped in this; the chrome (draggable panel, title bar, close) is
 * identical everywhere.
 *
 * Before this, each game hand-rolled the FloatingPanel + Got-it row (with a
 * copy-pasted inline `style`), and **boggle had drifted to a bare `<div>` with
 * no FloatingPanel at all** — rendering visibly differently from every other
 * game. Centralizing the frame kills that drift by construction. ui.md documents
 * Help as part of the uniform frame; this makes it so.
 */
export function HelpPanel({
  brand,
  onClose,
  size = { width: 460, height: 400 },
  minSize = { width: 300, height: 240 },
  children,
}: Props) {
  return (
    <FloatingPanel
      title={`How to play ${brand}`}
      onClose={onClose}
      defaultSize={size}
      minWidth={minSize.width}
      minHeight={minSize.height}
    >
      {children}
      <div className={styles.gotItRow}>
        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </FloatingPanel>
  )
}
