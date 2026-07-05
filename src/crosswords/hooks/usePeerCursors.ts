import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase/supabase'
import type { Cursor } from '../lib/cursor'

export type PeerCursor = { row: number; col: number; color: string }

type CursorMsg = { userId: string; row: number; col: number; color: string }

/**
 * Live peer cursors for the SHARED coop grid — everyone sees where their
 * teammates are (the free-for-all doesn't really work blind). Pure Realtime
 * Broadcast on a stable-name channel (Pattern B), plus Presence so a
 * disconnected peer's frame is dropped. Compete has private grids, so peer
 * cursors don't apply — pass `enabled=false` there.
 *
 * Returns a map of peer userId → their cursor cell + color; the caller
 * renders a thin frame on those cells.
 */
export function usePeerCursors(
  gameId: string,
  enabled: boolean,
  cursor: Cursor | null,
  myId: string,
  myColor: string,
): Map<string, PeerCursor> {
  const [peers, setPeers] = useState<Map<string, PeerCursor>>(() => new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    // Compete has private grids — no peer cursors. `enabled` is constant for
    // a game's lifetime (mode never changes), so peers just stays empty.
    if (!enabled) return
    const ch = supabase.channel(`crosswords:cursors:${gameId}`, {
      config: { presence: { key: myId } },
    })
    ch.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const p = payload as CursorMsg
      if (p.userId === myId) return
      setPeers((prev) => {
        const next = new Map(prev)
        next.set(p.userId, { row: p.row, col: p.col, color: p.color })
        return next
      })
    })
    // Presence key = the peer's userId; drop their cursor when they leave.
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      setPeers((prev) => {
        if (!prev.has(key)) return prev
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() })
    })
    channelRef.current = ch

    return () => {
      channelRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [gameId, enabled, myId])

  // Broadcast our own cursor whenever it moves.
  useEffect(() => {
    if (!enabled || !cursor) return
    channelRef.current?.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { userId: myId, row: cursor.row, col: cursor.col, color: myColor } satisfies CursorMsg,
    })
  }, [enabled, cursor, myId, myColor])

  return peers
}
