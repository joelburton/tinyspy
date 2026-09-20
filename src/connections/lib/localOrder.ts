// cs-met-connections

/**
 * The per-player local order of the board's tiles.
 *
 * The board's tile order from `connections.games.board.tileOrder` is the same
 * for every player at game start. A player may shuffle their own view (the
 * shared `shuffle()` from `common/utils`) — no broadcast, no server write; it
 * is a "what looks good to me right now" preference, and losing it on a pause
 * is fine. What this file owns is what happens to that order when a category
 * gets matched and the remaining-tiles list shrinks: the local order drops the
 * gone tiles while preserving the positions of the ones still there (the NYT
 * visual rule: "matched tiles disappear, others stay where they were").
 * Defensive on the other direction too: if `remaining` ever gains a tile not
 * in `local`, it is appended rather than lost — connections never adds tiles
 * mid-game, but the not-explicitly-impossible case is cheap to handle.
 */

export function reconcileLocalOrder(
  local: string[],
  remaining: string[],
): string[] {
  const remainingSet = new Set(remaining)
  // Keep tiles still present, in their current local positions.
  const stillThere = local.filter((t) => remainingSet.has(t))
  // Defensive: if remaining has tiles missing from local (a
  // never-yet-seen case in connections's tile-only-removed model),
  // append them at the end so they don't get dropped.
  const localSet = new Set(local)
  const newTiles = remaining.filter((t) => !localSet.has(t))
  return [...stillThere, ...newTiles]
}
