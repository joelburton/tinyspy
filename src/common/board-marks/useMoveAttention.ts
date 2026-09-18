// cs-blessed-board-marks

import { useEffect, useState } from 'react'
import { ATTENTION_FLASH_MS } from './feedbackTiming'
import { useChangeCause } from './useChangeCause'

/** A stable empty set, so "nothing is hot" is one object rather than a new one
 *  per render — the comparison this drives happens during render. */
const NOTHING: ReadonlySet<never> = new Set()

type MoveAttention<Content, Id> = {
  /** This render's content — the board, the results map, whatever the diff reads. */
  content: Content
  /** What "changed" means for this game: a board string, a joined list of ranks. */
  contentKey: string
  /** The server's monotone move marker — the move log's length, or the last
   *  move's id. It must arrive with the content and drop on a re-deal; see
   *  `useChangeCause`. */
  moveCount: number
  /** Which pieces this move changed, given the content before it and the content
   *  now. Runs during render, only on the renders where a move landed. */
  changed: (before: Content, now: Content) => ReadonlySet<Id>
  /** Raise no mark at all — the caller's audience rule. A player reading a past
   *  turn is not being told about the live board, and a game whose own move
   *  needs no mark says so here. */
  quiet?: boolean
}

/**
 * The pieces a move just changed, hot for a beat — the attention mark, end to
 * end. Hand it the content, a key for "changed", the server's move marker and a
 * diff; it returns the set of ids to mark, and empties itself.
 *
 *     const flashing = useMoveAttention({
 *       content: results,
 *       contentKey: [...results.keys()].sort().join(','),
 *       moveCount,
 *       quiet: viewing,
 *       changed: (before, now) => new Set([...now.keys()].filter((w) => !before.has(w))),
 *     })
 *
 * What a game supplies is only what is its own: what counts as changed, and when
 * to stay quiet. The two rules that made this worth sharing are the folder's:
 * the mark is gated on the CAUSE rather than on the board differing, and the set
 * is raised DURING render so the mark and the change land in one commit.
 *
 * `changed` is called during render, so it must not start timers or set state —
 * it reads two values and returns a set. It needs no memoization: it runs only
 * on the renders where a move landed.
 *
 * A game that wants the cause WITHOUT this mark — its own choreography around
 * it — calls `useChangeCause` directly.
 */
export function useMoveAttention<Content, Id>({
  content,
  contentKey,
  moveCount,
  changed,
  quiet = false,
}: MoveAttention<Content, Id>): ReadonlySet<Id> {
  const [hot, setHot] = useState<ReadonlySet<Id>>(NOTHING)

  // Always ready: this hook is called from a game's Board, which is mounted
  // after that game's loading guard, so its first render already holds the real
  // board. A game that renders its differ above the guard calls
  // `useChangeCause` directly and passes its own readiness.
  const cause = useChangeCause(content, contentKey, moveCount, true)
  if (cause?.byMove && !quiet) {
    const fresh = changed(cause.before, content)
    // An empty diff is a move that changed nothing anyone can see (a game whose
    // own move needs no mark returns one). Setting it would re-render to say so.
    if (fresh.size > 0) setHot(fresh)
  }

  // Taking the mark off is a timer, so it is an effect — unlike the diff above,
  // which is a reaction to new props and stays in render. The constant is how
  // long the CLASS is held; what the mark LOOKS like is timed by CSS, from the
  // same number (see `feedbackTiming`).
  useEffect(function takeMarkOffAfterBeat() {
    if (hot.size === 0) return
    const timer = setTimeout(() => setHot(NOTHING), ATTENTION_FLASH_MS)
    return () => clearTimeout(timer)
  }, [hot])

  return hot
}
