// cs-blessed-connections

/**
 * The per-player local order of the board's tiles, reconciled with what is
 * still on the grid.
 *
 * `connections.games.board.tileOrder` is the same for every player; a shuffle
 * gives this client its own view of it — no broadcast, no server write. When a
 * category is matched and the remaining tiles shrink, the local order drops
 * the gone tiles and keeps every other tile where it was (the NYT rule:
 * matched tiles disappear, the others stay put). A tile in `remaining` that
 * `local` does not hold is appended rather than lost.
 */
export function reconcileLocalOrder(
  local: string[],
  remaining: string[],
): string[] {
  const remainingSet = new Set(remaining)
  // Keep tiles still present, in their current local positions.
  const stillThere = local.filter((t) => remainingSet.has(t))
  // A tile `local` does not hold is appended rather than dropped.
  const localSet = new Set(local)
  const newTiles = remaining.filter((t) => !localSet.has(t))
  return [...stillThere, ...newTiles]
}
