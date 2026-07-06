import { Fragment, type ReactNode } from 'react'
import { FloatingPanel } from '../../common/components/panels/FloatingPanel'
import styles from './ExplainDialog.module.css'

/** The dialog's state — mirrors crossplay's ExplainPopover states, minus the
 *  scratchpad (native thinking is never returned to the client). */
export type ExplainState =
  | { kind: 'loading' }
  | { kind: 'ok'; explanation: string }
  | { kind: 'error'; message: string }

type Props = {
  clueLabel: string
  state: ExplainState
  onClose: () => void
}

/**
 * Shows the AI explanation of a cryptic clue (from `crosswords-explain-clue`).
 * Rides on the shared `FloatingPanel` like Help / the note. The explanation is
 * plain prose with `**bold**` labels (Definition / Wordplay / Indicators),
 * rendered without `dangerouslySetInnerHTML`.
 */
export function ExplainDialog({ clueLabel, state, onClose }: Props) {
  return (
    <FloatingPanel
      title={`Explain ${clueLabel}`}
      onClose={onClose}
      defaultSize={{ width: 520, height: 380 }}
      minWidth={320}
      minHeight={220}
      persistKey="crosswords:explainRect"
    >
      {state.kind === 'loading' && <p className={styles.status}>Asking the AI…</p>}
      {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}
      {state.kind === 'ok' && <div className={styles.body}>{renderExplanation(state.explanation)}</div>}
    </FloatingPanel>
  )
}

/** Render prose with `**bold**` spans + preserved line breaks, as React nodes
 *  (no HTML injection). Splits on the `**…**` delimiter. */
function renderExplanation(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) => {
    const bold = chunk.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={i}>{bold[1]}</strong>
    return <Fragment key={i}>{chunk}</Fragment>
  })
}
