// cs-audited-move-flash

import { useState } from 'react'

/**
 * The content as it was BEFORE this render's change — but only when a MOVE
 * caused that change. `null` on every other render, including the ones where
 * the board changed for some other reason entirely.
 *
 * `contentKey` is what "changed" means for the caller — a board string, a
 * joined list of cards. Content itself is usually a fresh object every render
 * (a refetch mints new arrays), so identity would re-fire on traffic that
 * changed nothing. `moveCount` is a monotone marker of the last move the
 * server has recorded: the move log's length, or the last move's id.
 *
 * Two requirements on the caller's data path, and the hook cannot check
 * either. The key and the marker must arrive TOGETHER, so that within a render
 * a board that has moved always carries the row that moved it. And a re-deal
 * must DROP the marker rather than carry it forward — the RPC that re-deals a
 * board deletes the move log with it, so the marker falls instead of advancing
 * and a fresh board reads as what it is.
 *
 * The comparison happens DURING render, so a caller can set its own state from
 * the result and have the mark land in the same commit as the change:
 *
 *     const before = useMoveCausedChange({ board, colors }, board + colors, log.length)
 *     if (before) setFlashing(whatChanged(before, { board, colors }))
 *
 * Why an attention mark is gated on the cause at all, and why the two
 * requirements are what they are: common/move-flash/doc.md.
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
