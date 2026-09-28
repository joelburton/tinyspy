// cs-blessed-connections

import { TILES_PER_CATEGORY } from './board'

/**
 * The shared picks on a coop board — who is holding which tiles, and the
 * three rules that move them (doc.md → Coop).
 *
 * `useGame` owns the map as state and puts every change on the wire as a
 * `PickEvent`; what an event MEANS is here, so the rules can be read and
 * tested without a Realtime channel. Compete sends nothing, but runs the same
 * rules locally over a map holding only the player's own picks.
 */

/** Who has picked what: one entry per player holding tiles, in pick order. A
 *  player holding none is absent rather than present-and-empty. */
export type PickMap = ReadonlyMap<string, string[]>

/**
 * A change to the shared picks, as it travels over the connections channel.
 * The `type` words are the wire's.
 *
 * `unpick` carries no user id on purpose: a tile comes out of whoever's
 * picks hold it, which is the coop click rule and not something the sender
 * needs to know.
 */
export type PickEvent =
  | { type: 'pick'; tile: string; userId: string }
  | { type: 'unpick'; tile: string }
  | { type: 'clear' }

/**
 * Apply one event to the map.
 *
 * Idempotent in all three directions — picking a tile its holder already
 * has, putting back one nobody holds, clearing an empty map — so an echo of
 * our own broadcast is safe. An event that changes nothing returns the SAME
 * map object, so a caller handing this to `setState` doesn't re-render on
 * echoes.
 */
export function applyPickEvent(prev: PickMap, event: PickEvent): PickMap {
  if (event.type === 'clear') return prev.size === 0 ? prev : new Map()

  if (event.type === 'pick') {
    const list = prev.get(event.userId) ?? []
    if (list.includes(event.tile)) return prev
    const next = new Map(prev)
    next.set(event.userId, [...list, event.tile])
    return next
  }

  const next = new Map(prev)
  let mutated = false
  for (const [userId, list] of next) {
    if (!list.includes(event.tile)) continue
    const filtered = list.filter((t) => t !== event.tile)
    if (filtered.length === 0) next.delete(userId)
    else next.set(userId, filtered)
    mutated = true
  }
  return mutated ? next : prev
}

/** Every held tile, flattened in pick order — what Submit sends, and what the
 *  board draws as the guess being assembled. */
export function unionTiles(picks: PickMap): string[] {
  const union: string[] = []
  for (const list of picks.values()) {
    for (const tile of list) if (!union.includes(tile)) union.push(tile)
  }
  return union
}

/**
 * What clicking `tile` does, or `null` for a click that does nothing.
 *
 * The rule is on the UNION, not on one player's picks: a tile anyone holds
 * comes out, and an unheld one joins mine — unless four are already up across
 * the table, which is a full guess and the click is refused.
 */
export function eventForClick(
  picks: PickMap,
  tile: string,
  userId: string,
): PickEvent | null {
  for (const list of picks.values()) {
    if (list.includes(tile)) return { type: 'unpick', tile }
  }
  let held = 0
  for (const list of picks.values()) held += list.length
  if (held >= TILES_PER_CATEGORY) return null
  return { type: 'pick', tile, userId }
}
