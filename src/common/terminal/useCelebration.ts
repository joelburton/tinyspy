// cs-audited-terminal

import { useState } from 'react'

/**
 * One-shot celebration state — pops `<CelebrationBlockingModal>` at the MOMENT of a
 * win, and only then.
 *
 * Three rules:
 *
 *   1. **Never show on mount.** Opening an already-won game (deep link,
 *      refresh) is reviewing history, not winning — the moment has passed, so
 *      the confetti stays away.
 *   2. **Pop when `won` flips true during the session.** The winning move
 *      lands on every connected client via the common realtime refetch, so the
 *      whole group celebrates together — no broadcast needed.
 *   3. **One-shot until re-armed.** Closing it doesn't re-pop; a flip back to
 *      false (like restarting a game) re-arms it, so
 *      win → restart → win celebrates again.
 *
 * Rule 1 is what makes the `won` expression load-bearing: gate it ONLY on values
 * that are correct on the FIRST render (the `common.games` row — `playState`,
 * `status.*` — plus the roster, all of which GamePage awaits before rendering a
 * PlayArea). Anything that arrives later flips false→true after mount and pops
 * confetti at someone merely reviewing a finished game.
 *
 * Usage:
 *
 *     const { show, close } = useCelebration(mode === 'coop' && playState === 'won')
 *     ...
 *     {show && <CelebrationBlockingModal onClose={close} />}
 */
export function useCelebration(won: boolean): {
  show: boolean
  close: () => void
} {
  const [show, setShow] = useState(false)

  // Detected during render (React's endorsed "storing information from previous
  // renders" shape, and the house rule against setState in effects), which is
  // also what makes rule 1 fall out for free: `prevWon` seeds from the first
  // value, so a game that is already won has no transition to notice.
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
