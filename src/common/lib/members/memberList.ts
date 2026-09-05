// cs-blessed-game-lib

/**
 * Two operations on a list of members: put it in reading order, and find one
 * in it. Both are pure, and both are generic over anything Member-shaped so a
 * per-game `Player` alias works without a cast.
 *
 * They live beside `member.ts` because what they know about is identity, not
 * gameplay — nothing here is aware of a board, a turn or a channel. Keeping
 * them out of `member.ts` itself is deliberate: that module is TYPES ONLY so
 * its imports — well over a hundred files — erase at runtime, and a value
 * module cannot make that promise (see `terminalOutcomeVerb.ts`, split out for
 * the same reason).
 */

/**
 * Order a player list with the viewer first, then everyone else alphabetically
 * by username.
 *
 * "You, then the others" is the order every list of people in a game is read
 * in — the progress strip, the turn log's whose-turns filter, the word list's
 * whose-words filter, and any game rendering its own roster. Sorting
 * alphabetically after the viewer means the rest of the list stays put as
 * scores change — a strip that reorders itself mid-game is unreadable.
 *
 * Returns a new array; does not mutate the input.
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

/**
 * Find a member in a roster by user id — the "who is this `user_id`?" lookup
 * every game does to attribute a guess or a turn to its actor.
 *
 * Returns `undefined` for an unknown id (a departed member, a roster that
 * hasn't loaded yet), so a caller rendering a name needs a fallback.
 */
export function memberById<T extends { user_id: string }>(
  members: readonly T[],
  userId: string,
): T | undefined {
  return members.find((m) => m.user_id === userId)
}
