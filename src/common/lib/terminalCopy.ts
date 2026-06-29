/**
 * The per-status copy a game's terminal state shows. Both psychicnum's and
 * connections's `buildOver()` return this shape: two cuts at the same outcome —
 * a richer line for the `<GameOverModal>` and a short one for the info-column
 * outcome line — so they stay in sync.
 */
export type TerminalCopy = {
  /** Drives `<GameOverModal>`'s treatment (green vs red). Manual-end uses
   *  `'won'` so the modal reads neutral-green, not as a loss. */
  outcome: 'won' | 'lost'
  /** The modal's verdict line ("You won the race!", "Beaten to the punch."). */
  verdict: string
  /** The short info-column outcome line ("You won!", "Out of guesses"). */
  message: string
  /** Color of the info-column outcome line (`shared.outcome_<tone>`). */
  tone: 'won' | 'lost' | 'neutral'
}

/**
 * The neutral **manual-end** (`play_state === 'ended'`) copy: the friends agreed
 * to stop, so nobody won and nobody lost. Identical across games (the `'ended'`
 * branch led both `buildOver`s), so it lives here. The green modal treatment
 * (`outcome: 'won'`) carries deliberately *neutral* copy.
 */
export function endedCopy(mode: 'coop' | 'compete'): TerminalCopy {
  return {
    outcome: 'won',
    verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
    message: 'Game over',
    tone: 'neutral',
  }
}
