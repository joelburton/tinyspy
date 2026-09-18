// cs-unmet

import type { EventRow } from '../hooks/useGame'

/**
 * letterboxed — the turn-history replay.
 *
 * The chain as it stood after any past move, so the PlayArea can hand `Board` a
 * historical chain the same way it hands it the live one.
 *
 * This is a FOLD, not a reconstruction, and that's the payoff of
 * `letterboxed.events` being an append-only stream: a chain isn't a board that
 * accumulates, it's a stack that can also shrink, so the log has to record the
 * shrinking too. Replaying it is then just running the same four rules forward:
 *
 *   word  → push it
 *   undo  → pop the last one
 *   clear → empty it
 *   hint / spoiler → nothing changed; neither one moves the chain
 *
 * **The boundary is INCLUSIVE**: viewing a move shows the chain
 * *after* it — "this is what move #N did", which is the natural way to review a
 * move, and the only reading that makes an `undo` row show anything at all
 * (its whole content is the word no longer being there).
 *
 * **One player's moves at a time.** In compete each player builds a separate
 * chain from the same twelve letters, so folding a mixed list would produce a
 * chain nobody ever had. Callers pass an already-filtered list — one player's
 * chain — and the row is named by its OWN id, resolved against that list. The
 * number the log prints is a position in what is shown, which a filter moves;
 * this is not.
 */
export function historyChainAt(events: readonly EventRow[], id: number): string[] {
  const index = events.findIndex((e) => e.id === id)
  const chain: string[] = []
  for (let i = 0; i <= index && i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'word' && e.word) chain.push(e.word)
    else if (e.kind === 'undo') chain.pop()
    else if (e.kind === 'clear') chain.length = 0
  }
  return chain
}

/** The one-line "what this move was" for the viewer's banner. */
export function historyLabelAt(events: readonly EventRow[], id: number): string | null {
  const e = events.find((x) => x.id === id)
  if (!e) return null
  const word = e.word?.toUpperCase() ?? ''
  switch (e.kind) {
    case 'word':
      return `Played ${word}`
    case 'undo':
      return `Took back ${word}`
    case 'clear':
      return 'Started the chain over'
    case 'hint':
      return 'Took a hint'
    case 'spoiler':
      return `Was shown ${word}`
  }
}
