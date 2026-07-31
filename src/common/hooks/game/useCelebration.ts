import { useState } from 'react'

/**
 * One-shot celebration state — pops `<CelebrationDialog>` at the MOMENT of a
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
 *      false (waffle's replay-board un-terminals the game) re-arms it, so
 *      win → restart → win celebrates again.
 *
 * Rule 1 is what makes the `won` expression load-bearing: gate it ONLY on values
 * that are correct on the FIRST render (the `common.games` row — `playState`,
 * `status.*` — plus the roster, all of which GamePage awaits before rendering a
 * PlayArea). Anything that arrives later flips false→true after mount and pops
 * confetti at someone merely reviewing a finished game.
 *
 * Effect-free previous-render pattern: state is adjusted DURING render behind a
 * transition guard — React's endorsed "storing information from previous
 * renders" shape.
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
