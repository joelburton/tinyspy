import { useState } from 'react'

/**
 * One-shot celebration state — pops `<CelebrationDialog>` at the MOMENT of a
 * win, and only then.
 *
 * The deliberate inverse of `useTerminalModal`'s mount behavior:
 *
 *   1. **Never show on mount.** Opening an already-won game (deep link,
 *      refresh) is reviewing history, not winning — the moment has passed, so
 *      the confetti stays away. (`useTerminalModal` initializes open for
 *      exactly that case; this initializes closed.)
 *   2. **Pop when `won` flips true during the session.** The winning move
 *      lands on every connected client via the common realtime refetch, so the
 *      whole group celebrates together — no broadcast needed.
 *   3. **One-shot until re-armed.** Closing it doesn't re-pop; a flip back to
 *      false (waffle's replay-board un-terminals the game) re-arms it, so
 *      win → restart → win celebrates again.
 *
 * Same effect-free previous-render pattern as `useTerminalModal` (state is
 * adjusted DURING render behind a transition guard — React's endorsed "storing
 * information from previous renders" shape).
 *
 * Usage:
 *
 *     const { show, close } = useCelebration(mode === 'coop' && playState === 'won')
 *     ...
 *     {show && <CelebrationDialog onClose={close} />}
 */
export function useCelebration(won: boolean): {
  show: boolean
  close: () => void
} {
  const [show, setShow] = useState(false)

  const [prevWon, setPrevWon] = useState(won)
  if (won !== prevWon) {
    setPrevWon(won)
    if (won) setShow(true)
  }

  return {
    show,
    close: () => setShow(false),
  }
}
