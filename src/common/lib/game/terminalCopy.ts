/**
 * The per-status copy a game's terminal state shows — every game's `buildOver()`
 * returns this shape. Two cuts at the same outcome, for two surfaces of
 * different width, kept in one object so they stay in sync.
 */
export type TerminalCopy = {
  /** The below-board pill's verdict — terse, leading with the outcome word
   *  ("Won: fewest guesses", "Lost: out of time"), no trailing period: the pill
   *  is a one-line, ellipsising LABEL (~48 chars on a phone), not prose. */
  verdict: string
  /** The short info-column outcome line ("You won!", "Out of guesses"). */
  message: string
  /** Color of BOTH surfaces (`shared.outcome_<tone>` for the line). */
  tone: 'won' | 'lost' | 'neutral'
}

/**
 * The neutral **manual-end** (`play_state === 'ended'`) copy: the friends agreed
 * to stop, so nobody won and nobody lost. Identical across games (the `'ended'`
 * branch led every `buildOver`), so it lives here.
 */
export function endedCopy(mode: 'coop' | 'compete'): TerminalCopy {
  return {
    // No trailing period: these are pill LABELS, not prose (the pill is a
    // fixed-height, ellipsising row), and the rest of the terminal vocabulary
    // ("You win!", "Lost: assassin", "Out of time") doesn't punctuate either.
    verdict: mode === 'coop' ? 'Game ended' : 'Game ended — no winner',
    message: 'Game over',
    tone: 'neutral',
  }
}
