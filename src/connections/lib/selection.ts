// cs-fixed-connections

import { TILES_PER_CATEGORY } from './board'

/**
 * The shared selection on a coop board — who is holding which tiles, and the
 * three rules that move it (doc.md → Coop).
 *
 * `useGame` owns the map as state and puts every change on the wire as a
 * `SelectionEvent`; what an event MEANS is here, so the rules can be read and
 * tested without a Realtime channel. Compete sends nothing, but runs the same
 * rules locally over a map holding only the player's own picks.
 */

/** Who has picked what: one entry per player holding tiles, in pick order. A
 *  player holding none is absent rather than present-and-empty. */
export type SelectionMap = ReadonlyMap<string, string[]>

/**
 * A shared-selection change, as it travels over the connections channel.
 *
 * `deselect` carries no user id on purpose: a tile comes out of whoever's
 * picks hold it, which is the coop click rule and not something the sender
 * needs to know.
 */
export type SelectionEvent =
  | { type: 'select'; tile: string; userId: string }
  | { type: 'deselect'; tile: string }
  | { type: 'clear' }

/**
 * Apply one event to the map.
 *
 * Idempotent in all three directions — selecting a tile its holder already
 * has, deselecting one nobody holds, clearing an empty map — so an echo of our
 * own broadcast is safe. An event that changes nothing returns the SAME map
 * object, so a caller handing this to `setState` doesn't re-render on echoes.
 */
export function applySelectionEvent(
  prev: SelectionMap,
  event: SelectionEvent,
): SelectionMap {
  if (event.type === 'clear') return prev.size === 0 ? prev : new Map()

  if (event.type === 'select') {
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
export function unionTiles(selections: SelectionMap): string[] {
  const union: string[] = []
  for (const list of selections.values()) {
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
  selections: SelectionMap,
  tile: string,
  userId: string,
): SelectionEvent | null {
  for (const list of selections.values()) {
    if (list.includes(tile)) return { type: 'deselect', tile }
  }
  let held = 0
  for (const list of selections.values()) held += list.length
  if (held >= TILES_PER_CATEGORY) return null
  return { type: 'select', tile, userId }
}
