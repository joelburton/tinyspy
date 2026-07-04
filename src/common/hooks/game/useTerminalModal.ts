import { useState } from 'react'

/**
 * Terminal-modal state for a game's PlayArea.
 *
 * Every game pops a shared `<GameOverModal>` on terminal entry,
 * and every game's PlayArea needs identical state-machine
 * scaffolding around that pop:
 *
 *   1. **Initialize true if already terminal on mount.** Navigating
 *      into an already-won/already-lost game (deep link, refresh)
 *      should show the modal immediately rather than treating the
 *      game as in-progress.
 *   2. **Re-pop when `isTerminal` flips during play.** The winning
 *      guess (or the out-of-time tick) flips the prop true; the
 *      modal opens once at that moment.
 *   3. **Don't re-pop after dismiss.** Once the user closes the
 *      modal, the action-slot indicator carries the lasting cue;
 *      reopening on every re-render would be hostile.
 *
 * This hook was duplicated verbatim in codenamesduet/connections/psychicnum
 * PlayAreas; extracting it pins the contract in one place so future
 * games (Boggle, etc.) drop into the same shape without re-deriving
 * it. See docs/ui.md → "Modals for terminal results."
 *
 * Usage:
 *
 *     const { showModal, closeModal } = useTerminalModal(isTerminal)
 *     ...
 *     {showModal && over && (
 *       <GameOverModal ... onClose={closeModal} />
 *     )}
 *
 * The hook returns `closeModal` (not `setShowModal`) deliberately:
 * callers should only ever close the modal manually. Re-opening
 * is owned by the effect, which gates on `isTerminal` flipping.
 */
export function useTerminalModal(isTerminal: boolean): {
  showModal: boolean
  closeModal: () => void
} {
  const [showModal, setShowModal] = useState(isTerminal)

  // Pop the modal when `isTerminal` transitions false → true, without an effect:
  // we track the previous value and adjust state DURING render (React's endorsed
  // "storing information from previous renders" pattern — it re-renders
  // immediately without committing, so there's no extra paint and no
  // set-state-in-effect cascade). The transition guard is what makes the pop
  // fire once: after the user closes the modal, `isTerminal` hasn't changed, so
  // we don't re-pop on subsequent renders. The initial already-terminal case is
  // handled by `useState(isTerminal)` above, so this only covers the flip.
  const [prevTerminal, setPrevTerminal] = useState(isTerminal)
  if (isTerminal !== prevTerminal) {
    setPrevTerminal(isTerminal)
    if (isTerminal) setShowModal(true)
  }

  return {
    showModal,
    closeModal: () => setShowModal(false),
  }
}
