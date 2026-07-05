import { FloatingPanel } from './FloatingPanel'
import { setScratchpadOpen, useScratchpadOpen } from '../../lib/scratchpad/scratchpadOpenStore'
import { useScratchpad } from '../../hooks/scratchpad/useScratchpad'
import styles from './GameScratchpad.module.css'

type Props = {
  gameId: string
  /** null = the shared coop pad; a user id = that player's private compete pad. */
  ownerId: string | null
  myId: string
  username: string
  /** At terminal the pad is read-only (still shows the notes). */
  isTerminal: boolean
}

/**
 * The per-game scratchpad floating panel — rendered at the GamePage level
 * (outside PauseBoundary, so it survives pause and shows at terminal) for
 * games whose manifest opts in. The header `<ScratchpadBubble>` toggles it
 * via the shared open-state store; geometry persists per-game.
 *
 * The hook runs even while the panel is closed (background body sync + lock),
 * mirroring how chat keeps syncing when collapsed.
 */
export function GameScratchpad({ gameId, ownerId, myId, username, isTerminal }: Props) {
  const open = useScratchpadOpen()
  const sp = useScratchpad(gameId, ownerId, myId, username, isTerminal)

  if (!open) return null

  const shared = ownerId === null
  const status = isTerminal
    ? 'Game over — read-only.'
    : sp.editingBy
      ? `${sp.editingBy} is editing…`
      : shared
        ? 'Shared with the table.'
        : 'Private to you.'

  return (
    <FloatingPanel
      title="Scratchpad"
      onClose={() => setScratchpadOpen(false)}
      persistKey={`puzpuzpuz:scratchpad:${gameId}`}
      closeOnEsc={false}
      zIndex={10000}
      defaultPosition="center"
      defaultSize={{ width: 320, height: 360 }}
      minWidth={240}
      minHeight={200}
    >
      <div className={styles.body}>
        <div className={styles.lockBar}>
          <span>{status}</span>
          {sp.canTakeOver && (
            <button type="button" className={styles.takeOver} onClick={sp.takeOver}>
              Take over
            </button>
          )}
        </div>
        <textarea
          className={styles.textarea}
          value={sp.body}
          onChange={(e) => sp.setBody(e.target.value)}
          readOnly={!sp.canEdit}
          maxLength={10000}
          placeholder={shared ? 'Shared notes…' : 'Your private notes…'}
          aria-label="Scratchpad"
        />
      </div>
    </FloatingPanel>
  )
}
