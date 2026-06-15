import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Shape of a Broadcast payload carrying a single selection-state
 * change. The split into discrete `select` / `deselect` / `clear`
 * events (rather than a single "here is my full selection" frame)
 * means every client can apply the same delta to its local map
 * and converge — no "did A miss the diff?" ambiguity.
 */
type SelectionEvent =
  | { type: 'select'; tile: string; userId: string }
  | { type: 'deselect'; tile: string }
  | { type: 'clear' }

/**
 * Per-game shared selection state, driven by Supabase Broadcast.
 *
 * Selection semantics (per the design discussion in chat):
 *
 *   Click semantics operate on the **union** of all players'
 *   selections, not on each player's private list.
 *
 *   - If the tile is in some player's selection (mine or someone
 *     else's), clicking removes it. Broadcasting `deselect`
 *     causes every client to drop the tile from its local map.
 *   - Else if the union has 4 tiles, clicking is a no-op
 *     (the union is full; you'd need to deselect one first).
 *   - Else, clicking adds the tile to MY contribution.
 *     Broadcasting `select` causes every client to record it.
 *
 *   Submit and explicit "deselect all" broadcast a `clear`
 *   event; every client empties its local map.
 *
 * State lives in a `Map<userId, tiles[]>` driven entirely by
 * Broadcast events (including echoes of our own broadcasts,
 * which we handle idempotently — adding a tile twice is a
 * no-op).
 *
 * Pause behavior: when the host renders a FrozenOverlay
 * (because someone is disconnected, per `useGameFreeze`),
 * the BoardScreen disables click handlers and the selection
 * is cleared. We don't drive that clear from inside this
 * hook — the BoardScreen calls `sendClear()` when it
 * transitions into the frozen state, and the broadcast
 * propagates to all peers (including the dropping one once
 * they're back).
 */
export type SelectionMap = ReadonlyMap<string, string[]>

export function useSharedSelection(
  channel: RealtimeChannel | null,
  selfUserId: string,
): {
  /** Map of user_id → tiles they've contributed to the union. */
  selections: SelectionMap
  /** Flat union of all selected tiles, in no particular order. */
  unionTiles: string[]
  /** Click-toggle a tile by name. Routes to select / deselect /
   *  no-op depending on current union state. */
  toggleTile: (tile: string) => void
  /** Clear everyone's selection. Use on submit and explicit
   *  "Deselect all" actions. */
  sendClear: () => void
} {
  const [selections, setSelections] = useState<Map<string, string[]>>(
    () => new Map(),
  )

  // Apply an incoming event to local state. Idempotent — adding
  // an already-present tile is a no-op, deselecting an absent
  // tile is a no-op — so echoes of our own broadcasts are safe.
  const apply = useCallback((event: SelectionEvent) => {
    setSelections((prev) => {
      const next = new Map(prev)
      if (event.type === 'clear') {
        if (next.size === 0) return prev
        next.clear()
        return next
      }
      if (event.type === 'select') {
        const list = next.get(event.userId) ?? []
        if (list.includes(event.tile)) return prev
        next.set(event.userId, [...list, event.tile])
        return next
      }
      // event.type === 'deselect'
      let mutated = false
      for (const [uid, list] of next) {
        if (list.includes(event.tile)) {
          const filtered = list.filter((t) => t !== event.tile)
          if (filtered.length === 0) next.delete(uid)
          else next.set(uid, filtered)
          mutated = true
        }
      }
      return mutated ? next : prev
    })
  }, [])

  // Subscribe to the Broadcast events. Re-runs only on channel
  // identity change. The channel is created + cleaned up by
  // `useGame`; we just attach a listener and a no-op cleanup
  // (removing the listener happens automatically when the
  // channel itself is torn down).
  useEffect(() => {
    if (!channel) return
    channel.on('broadcast', { event: 'selection' }, ({ payload }) =>
      apply(payload as SelectionEvent),
    )
  }, [channel, apply])

  // Compute the flat union on each render. Cheap (at most 4
  // tiles in practice; the cap is what makes submit possible
  // at all) and keeps the value in sync with selections.
  const unionTiles: string[] = []
  for (const list of selections.values()) {
    for (const t of list) {
      if (!unionTiles.includes(t)) unionTiles.push(t)
    }
  }

  // toggleTile reads `selections` directly. The dependency keeps
  // the callback fresh as state changes, which is fine — onClick
  // handlers aren't memoized further downstream, so re-creating
  // this callback per state change doesn't trigger extra renders.
  const toggleTile = useCallback(
    (tile: string) => {
      if (!channel) return
      // Is the tile already in some player's selection? If so,
      // any click on it removes from the union.
      let alreadySelected = false
      for (const list of selections.values()) {
        if (list.includes(tile)) {
          alreadySelected = true
          break
        }
      }
      if (alreadySelected) {
        // Optimistic local apply + broadcast. The owner client
        // will receive the same event and apply it too, so this
        // converges regardless of who's calling.
        const event: SelectionEvent = { type: 'deselect', tile }
        apply(event)
        channel.send({ type: 'broadcast', event: 'selection', payload: event })
        return
      }
      // Union not full?
      let unionSize = 0
      for (const list of selections.values()) unionSize += list.length
      if (unionSize >= 4) return
      // Add to my own contribution.
      const event: SelectionEvent = {
        type: 'select',
        tile,
        userId: selfUserId,
      }
      apply(event)
      channel.send({ type: 'broadcast', event: 'selection', payload: event })
    },
    [apply, channel, selections, selfUserId],
  )

  const sendClear = useCallback(() => {
    if (!channel) return
    const event: SelectionEvent = { type: 'clear' }
    apply(event)
    channel.send({ type: 'broadcast', event: 'selection', payload: event })
  }, [apply, channel])

  return { selections, unionTiles, toggleTile, sendClear }
}
