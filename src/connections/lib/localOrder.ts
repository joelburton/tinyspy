/**
 * Per-player local-shuffle ordering helpers.
 *
 * The board's tile order from `connections.games.board.tileOrder`
 * is the same for every player at game start. Players can shuffle
 * their own view independently — there's no broadcast, no server
 * write. The order is purely a "what looks good to me right now"
 * preference; if a player pauses and resumes, losing the local
 * shuffle is fine (and matches the "should this survive a pause?"
 * rule — UI-local preference, no).
 *
 * Two operations live here:
 *
 *   - `shuffleTiles(tiles)` — Fisher–Yates over a copy of the
 *     input. Used when the player clicks the Shuffle button.
 *   - `reconcileLocalOrder(local, remaining)` — when a category
 *     gets matched, the remaining-tiles list shrinks. The local
 *     order must drop the gone tiles while preserving the
 *     positions of the ones still there (the NYT visual rule:
 *     "matched tiles disappear, others stay where they were").
 *     Defensive on the other direction too: if `remaining` ever
 *     gains a tile not in `local`, we append it rather than lose
 *     it — connections never adds tiles mid-game, but the
 *     not-explicitly-impossible case is cheap to handle.
 */

export function shuffleTiles(tiles: string[]): string[] {
  // Copy first — we never mutate the caller's array.
  const out = [...tiles]
  // Fisher–Yates: walk from end to start, swap each with a
  // random earlier (or same) index.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

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
