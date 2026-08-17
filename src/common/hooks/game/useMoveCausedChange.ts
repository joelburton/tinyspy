import { useState } from 'react'

/**
 * The content as it was BEFORE this render's change — but only when a MOVE
 * caused that change. `null` on every other render, including the ones where
 * the board changed for some other reason entirely.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Attention marks are driven by diffing: the cells that differ from last render
 * are the cells that changed under the player. But a board changes for reasons
 * that are not moves — a restart deals a fresh one, a terminal reveal swaps the
 * solution in, opening a finished game arrives at a board full of history — and
 * a diff cannot tell those apart from a move. It sees only that things differ,
 * so it lights the whole board up at exactly the moments nothing has happened.
 *
 * The lesson is setgame's, and it cost three bugs there: **read the cause, do
 * not infer it from the state.** Every proxy for "was this a move?" that can be
 * measured off the board — how many slots differ, whether the count grew,
 * whether a score moved — has a case that breaks it, and two of those shipped.
 * The cause was recorded on the server the whole time: a move writes a row, and
 * the things that are not moves do not.
 *
 * ── Using it ────────────────────────────────────────────────────────────────
 * `moveCount` is a monotone marker of the last move the server has recorded —
 * the move log's length, or the last move's id. Its one requirement is that a
 * replay must not carry it forward: the RPC that re-deals a board deletes the
 * log with it, so the marker drops instead of advancing, and a re-deal reads as
 * what it is rather than as a flurry of moves.
 *
 * `contentKey` is what "changed" means for the caller — a board string, a
 * joined list of cards. Content itself is usually a fresh object every render
 * (a refetch mints new arrays), so identity would re-fire on traffic that
 * changed nothing.
 *
 * The two must arrive TOGETHER. Both games read them in one `Promise.all`, so
 * within a render the board and the log cannot disagree — a board that has moved
 * always comes with the row that moved it.
 *
 *     const before = useMoveCausedChange({ board, colors }, board + colors, log.length)
 *     if (before) setFlashing(whatChanged(before, { board, colors }))
 *
 * The comparison happens DURING render (React's endorsed
 * adjust-state-when-input-changes shape) so a caller can set its own state from
 * the result and have both land in one commit — which is the point for an
 * attention mark: if the change paints a frame before the mark, the eye catches
 * the change first and the mark reads as a second, unexplained event.
 *
 * setgame implements this same rule by hand for its claim flash (it keys on the
 * last claim's id rather than a count, and has its own hold-then-arrive
 * choreography around it); it folds into this hook when it converts.
 */
export function useMoveCausedChange<T>(
  content: T,
  contentKey: string,
  moveCount: number,
): T | null {
  const [seen, setSeen] = useState({ key: contentKey, moves: moveCount, content })

  // Nothing moved — the common case, and the only one that returns early.
  if (seen.key === contentKey && seen.moves === moveCount) return null

  // A move is the ONLY thing that both changes the content and advances the
  // server's move marker. A re-deal changes the content while the marker drops;
  // a move landing on a board that happens to look identical (waffle swapping
  // two of the same letter) advances the marker without changing the content —
  // neither is a change caused by a move that anybody can see.
  const byMove = contentKey !== seen.key && moveCount > seen.moves
  const before = byMove ? seen.content : null

  // Re-seed either way: an unexplained change is absorbed silently, so the NEXT
  // move diffs against what is actually on screen. (First render seeds through
  // the initializer, which is why opening a finished game — a full log, a board
  // arrived at long ago — says nothing.)
  setSeen({ key: contentKey, moves: moveCount, content })
  return before
}
