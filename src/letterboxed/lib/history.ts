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
 *   played  → push the word
 *   undone  → pop the last one
 *   cleared → empty it
 *   hint / spoiler → nothing changed; help doesn't move the chain
 *
 * **The boundary is INCLUSIVE**: viewing the move at `index` shows the chain
 * *after* it — "this is what move #N did", which is the natural way to review a
 * move, and the only reading that makes an `undone` row show anything at all
 * (its whole content is the word no longer being there).
 *
 * **One player's moves at a time.** In compete each player builds a separate
 * chain from the same twelve letters, so folding a mixed list would produce a
 * chain nobody ever had. Callers pass an already-filtered list — which is
 * exactly the list the turn log is displaying, so a row's position in it IS its
 * index here.
 */
export function chainAt(events: readonly EventRow[], index: number): string[] {
  const chain: string[] = []
  for (let i = 0; i <= index && i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'played' && e.word) chain.push(e.word)
    else if (e.kind === 'undone') chain.pop()
    else if (e.kind === 'cleared') chain.length = 0
  }
  return chain
}

/** The one-line "what this move was" for the viewer's banner. */
export function describeAt(events: readonly EventRow[], index: number): string | null {
  const e = events[index]
  if (!e) return null
  const word = e.word?.toUpperCase() ?? ''
  switch (e.kind) {
    case 'played':
      return `Played ${word}`
    case 'undone':
      return `Took back ${word}`
    case 'cleared':
      return 'Started the chain over'
    case 'hint':
      return 'Took a hint'
    case 'spoiler':
      return `Was shown ${word}`
  }
}
