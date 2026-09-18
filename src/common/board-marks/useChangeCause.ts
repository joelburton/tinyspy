// cs-blessed-board-marks

import { useState } from 'react'

/**
 * What caused this render's change to the content — a move, something else, or
 * nothing at all.
 *
 * `null` is "nothing changed", which is most renders. The other two are the
 * distinction the whole folder turns on, and a caller that re-deals a board
 * needs both: a move is news to point at, and a change no move caused is a
 * board to simply show.
 */
export type ChangeCause<T> =
  /** A move did it. `before` is the content as it was, to diff against. */
  | { byMove: true; before: T }
  /** It changed, and nothing a player did changed it — a fresh deal, a terminal
   *  reveal, a game opened at a board arrived at long ago. */
  | { byMove: false }

/**
 * Why the content changed, read from the server rather than guessed at.
 *
 * `contentKey` is what "changed" means for the caller — a board string, a joined
 * list of cards. Content itself is usually a fresh object every render (a
 * refetch mints new arrays), so identity would re-fire on traffic that changed
 * nothing. `moveCount` is a monotone marker of the last move the server has
 * recorded: the move log's length, or the last move's id.
 *
 * `ready` is the caller saying whether it has data to compare at all. A caller
 * mounted inside its game's loaded tree is always ready and passes `true`; one
 * that renders above its own loading guard passes `game != null`, and must —
 * otherwise its first render seeds the comparison with a placeholder (an empty
 * board, no move) and the arrival of the real data reads as a move, because the
 * content changed and the marker advanced in the same render. While `ready` is
 * false the hook remembers nothing; when content first arrives where there was
 * none it reports a change that no move caused, which is what it is.
 *
 * Two requirements on the caller's data path, and this cannot check either. The
 * key and the marker must arrive TOGETHER, so that within a render a board that
 * has moved always carries the row that moved it. And a re-deal must DROP the
 * marker rather than carry it forward — the RPC that re-deals a board deletes
 * the move log with it, so the marker falls instead of advancing.
 *
 * The comparison happens DURING render, so a caller can set its own state from
 * the answer and have a mark land in the same commit as the change:
 *
 *     const change = useChangeCause({ board, colors }, board + colors, log.length)
 *     if (change?.byMove) setFlashing(whatChanged(change.before, { board, colors }))
 *
 * A game that just wants the changed pieces marked calls `useMoveAttention`,
 * which is this plus the diff and the lifetime. This one is for a game that acts
 * on the answer itself — setgame holds the departing cards on screen before it
 * swaps them, and resets the board it is showing when the change was not a move.
 *
 * Why an attention mark is gated on the cause at all: common/board-marks/doc.md.
 */
export function useChangeCause<T>(
  content: T,
  contentKey: string,
  moveCount: number,
  ready: boolean,
): ChangeCause<T> | null {
  // Null is "nothing remembered yet". A caller ready on its first render seeds
  // through the initializer, exactly as before — which is why mount is silent
  // for it, however long the log already is.
  const [seen, setSeen] = useState<{ key: string; moves: number; content: T } | null>(() =>
    ready ? { key: contentKey, moves: moveCount, content } : null,
  )

  // No data to compare. Forget what was remembered, so that whenever the data
  // does arrive it is seeded fresh rather than diffed against a board that is
  // no longer on screen.
  if (!ready) {
    if (seen !== null) setSeen(null)
    return null
  }

  // Content where there was none. Nobody played it — the caller simply had
  // nothing to show until now — so it is a change, and not a move.
  if (seen === null) {
    setSeen({ key: contentKey, moves: moveCount, content })
    return { byMove: false }
  }

  // Nothing moved — the common case, and the only one that returns early.
  if (seen.key === contentKey && seen.moves === moveCount) return null

  const changed = contentKey !== seen.key
  // A move is the ONLY thing that both changes the content and advances the
  // server's move marker. A re-deal changes the content while the marker drops.
  const byMove = changed && moveCount > seen.moves
  const before = seen.content

  // Re-seed on any of it, so the NEXT move diffs against what is actually on
  // screen. (First render seeds through the initializer, which is why opening a
  // finished game — a full log, a board arrived at long ago — says nothing.)
  setSeen({ key: contentKey, moves: moveCount, content })

  // The marker moved and the content did not: a move that landed on content
  // that happens to look identical (waffle swapping two of the same letter).
  // Nothing changed for anyone looking, so this is not a change at all.
  if (!changed) return null

  return byMove ? { byMove, before } : { byMove: false }
}
