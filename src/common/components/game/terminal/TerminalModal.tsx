import { useTerminalModal } from '../../../hooks/game/useTerminalModal'
import { GameOverModal } from './GameOverModal'
import type { TerminalCopy } from '../../../lib/game/terminalCopy'

type Props = {
  /** Whether the game has reached a terminal state — drives the one-shot pop. */
  isTerminal: boolean
  /** The terminal copy (null while playing); `outcome` + `verdict` fill the modal. */
  over: TerminalCopy | null
  onBackToClub: () => void
}

/**
 * The shared game-over modal tail. Owns the `useTerminalModal` one-shot state
 * and renders `<GameOverModal>` on terminal entry — the identical
 * `useTerminalModal` + guarded `<GameOverModal>` pair every PlayArea used to
 * write by hand.
 *
 * Folding it into a component also removes the hooks-ordering footgun: the hook
 * used to be called manually in each PlayArea body (and MUST precede any early
 * return); now it lives here, always rendered, so a game can't misorder it.
 */
export function TerminalModal({ isTerminal, over, onBackToClub }: Props) {
  const { showModal, closeModal } = useTerminalModal(isTerminal)
  if (!showModal || !over) return null
  return (
    <GameOverModal
      outcome={over.outcome}
      verdict={over.verdict}
      onClose={closeModal}
      onBackToClub={onBackToClub}
    />
  )
}
