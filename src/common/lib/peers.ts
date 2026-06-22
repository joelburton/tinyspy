/**
 * Order a player list with the viewer first, then everyone else
 * alphabetically by username — the stable "You, then peers" order every
 * in-game progress strip wants (see `common/components/OpponentStrip`).
 *
 * Generic over anything Member-shaped so per-game Player aliases work
 * without a cast. Returns a new array (does not mutate the input).
 *
 * This was copy-pasted — comment and all — into four games' opponent
 * strips before it landed here; the duplication was review item 4.2.
 */
export function orderSelfFirst<T extends { user_id: string; username: string }>(
  players: T[],
  selfId: string,
): T[] {
  return [...players].sort((a, b) => {
    if (a.user_id === selfId) return -1
    if (b.user_id === selfId) return 1
    return a.username.localeCompare(b.username)
  })
}
