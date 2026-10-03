// cs-unmet

import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import { applyPickEvent, eventForClick, unionTiles } from '../lib/picks'
import { TILES_PER_CATEGORY } from '../lib/board'
import type { GPicks, GPickEvent, GPickMap } from '../types'

/**
 * The guess being assembled: who holds which tiles, and the two senders.
 * Live Broadcast state with no row behind it, which is why it is the board
 * column's and not `gd`'s.
 *
 * Coop's picks are shared, so every peer joins the stable room
 * `connections:${gameId}` and each change travels as a `GPickEvent` on the
 * `pick` Broadcast; what an event means is `lib/picks.ts`'s. Compete's picks
 * are private: no room is joined, and the senders apply locally. The room is
 * keyed on the game alone, so a token refresh does not rebuild it and a new
 * game does.
 */
export function usePicks({
  gameId,
  isCompete,
  myId,
}: {
  gameId: string
  isCompete: boolean
  myId: string
}): GPicks {
  const [picks, setPicks] = useState<GPickMap>(() => new Map())
  // The picks room, once coop has joined it; `broadcast` below sends on it.
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  // Fold a pick event into the picks; the rules (and why an echo of our own
  // broadcast is safe) are `lib/picks.ts`'s.
  const applyPick = useCallback((event: GPickEvent) => {
    setPicks((prev) => applyPickEvent(prev, event))
  }, [])

  // Coop joins the picks room; see channelTeardown.ts for the join-after-leave
  // shape a stable-named room needs.
  useEffect(function joinPicksRoom() {
    if (isCompete) return
    const room = `connections:${gameId}`
    let canceled = false
    // Assigned by `join`, which may run after this effect body returns (the
    // join waits on any in-flight teardown of this room), so the cleanup reads
    // it from here.
    let ch: RealtimeChannel | null = null

    function join() {
      // Guards the deferred path only — the effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      ch = supabase.channel(room)
      ch.on('broadcast', { event: 'pick' }, ({ payload }) =>
        applyPick(payload as GPickEvent),
      )
      ch.subscribe()
      // The channel IS the external system being synced into state.
      setChannel(ch)
    }

    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      canceled = true
      setChannel(null)
      if (ch) void releaseChannel(ch) // null if we tore down before joining
    }
  }, [applyPick, gameId, isCompete])

  // Apply a pick event here, then put it on the wire in coop. The local apply
  // is what makes the click land at once; the echo of our own broadcast is a
  // no-op (`applyPickEvent` is idempotent). Compete has no room and sends
  // nothing. The channel is null before a deferred join lands.
  const broadcast = useCallback(
    (event: GPickEvent) => {
      applyPick(event)
      if (isCompete || channel === null) return
      void channel.send({ type: 'broadcast', event: 'pick', payload: event })
    },
    [applyPick, isCompete, channel],
  )

  // What a click does is `eventForClick`'s (doc.md → Coop); `null` is the
  // refused click on a full guess, which sends nothing.
  const toggleTile = useCallback(
    (tileId: string) => {
      const event = eventForClick(picks, tileId, myId)
      if (event) broadcast(event)
    },
    [broadcast, picks, myId],
  )

  const sendClear = useCallback(() => {
    broadcast({ type: 'clear' })
  }, [broadcast])

  const tileToPickerId = new Map<string, string>()
  for (const [userId, tiles] of picks) {
    for (const tile of tiles) tileToPickerId.set(tile, userId)
  }

  const union = unionTiles(picks)
  return {
    byUser: picks,
    union,
    isComplete: union.length === TILES_PER_CATEGORY,
    tileToPickerId,
    toggleTile,
    sendClear,
  }
}
