import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase/supabase'
import type { Cursor } from '../lib/cursor'

export type PeerCursor = { row: number; col: number; color: string }

type CursorMsg = { userId: string; row: number; col: number; color: string }
type FillMsg = { userId: string; row: number; col: number; color: string }

/** How long a peer-fill flash lingers before fading (mirrors crossplay). */
const RECENT_FILL_MS = 5000
/** Cursor-broadcast throttle window (leading + trailing), so arrow-key
 *  auto-repeat doesn't fire one Broadcast per repeat (crossplay throttles the
 *  same). Compounds the plan's Realtime-quota watch-item. */
const CURSOR_THROTTLE_MS = 80

export type PeerCursorsApi = {
  /** peer userId → their cursor cell + color; the caller draws a frame. */
  peers: Map<string, PeerCursor>
  /** `${row}:${col}` → color: a teammate JUST filled this cell — flash it. */
  recentFills: Map<string, string>
  /** Announce that I filled `(row, col)` so teammates flash it in my color.
   *  A no-op in compete (private grids). Call it right after a coop set_cell. */
  broadcastFill: (row: number, col: number) => void
}

/**
 * Live coop presence on the SHARED grid: teammates' cursors AND a short flash
 * on cells a teammate just filled. Both ride one stable-name Realtime Broadcast
 * channel (Pattern B), plus Presence so a disconnected peer's cursor frame is
 * dropped. Compete has private grids, so none of this applies — pass
 * `enabled=false` there and every returned map stays empty.
 *
 * Why a fill broadcast at all: unlike crossplay's socket (whose fill message
 * carries the sender's color), our `crosswords.cells` CDC payload has no
 * "who wrote this" color. So the flash needs its own tiny signal — the writer
 * announces the cell here, and `useCells` still applies the letter via CDC.
 * The two are independent: the letter is authoritative (CDC), the flash is
 * cosmetic (Broadcast, best-effort, self-expiring).
 */
export function usePeerCursors(
  gameId: string,
  enabled: boolean,
  cursor: Cursor | null,
  myId: string,
  myColor: string,
): PeerCursorsApi {
  const [peers, setPeers] = useState<Map<string, PeerCursor>>(() => new Map())
  const [recentFills, setRecentFills] = useState<Map<string, string>>(() => new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  // One expiry timer per flashing cell; cleared/reset on a fresh fill + on unmount.
  const fillTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Cursor-broadcast throttle bookkeeping (leading + trailing edge).
  const lastCursorSent = useRef(0)
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Flash a cell in `color`, auto-expiring after RECENT_FILL_MS. A repeat fill
  // of the same cell resets its timer.
  const trackRecentFill = useCallback((row: number, col: number, color: string) => {
    const key = `${row}:${col}`
    const existing = fillTimers.current.get(key)
    if (existing) clearTimeout(existing)
    fillTimers.current.set(
      key,
      setTimeout(() => {
        fillTimers.current.delete(key)
        setRecentFills((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }, RECENT_FILL_MS),
    )
    setRecentFills((prev) => new Map(prev).set(key, color))
  }, [])

  useEffect(() => {
    // Compete has private grids — no peer cursors. (`enabled` is usually
    // stable, but PlayArea defaults mode to 'coop' until `useGame` resolves,
    // so a compete game flips it true→false once; nothing broadcasts while
    // `cursor` is null, so the transient is harmless — the maps stay empty.)
    if (!enabled) return
    const timers = fillTimers.current
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
    ch.on('broadcast', { event: 'fill' }, ({ payload }) => {
      const p = payload as FillMsg
      if (p.userId === myId) return // never flash my own fills
      trackRecentFill(p.row, p.col, p.color)
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
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      void supabase.removeChannel(ch)
    }
  }, [gameId, enabled, myId, trackRecentFill])

  // Broadcast our own cursor when it moves, throttled to CURSOR_THROTTLE_MS.
  // Leading edge: send immediately when the window is idle. Trailing edge:
  // if we're inside the window, schedule the LATEST position to go out when
  // it closes (each new move reschedules, so the trailing send always carries
  // the final resting cell).
  useEffect(() => {
    if (!enabled || !cursor) return
    const { row, col } = cursor
    const sendNow = () => {
      lastCursorSent.current = Date.now()
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { userId: myId, row, col, color: myColor } satisfies CursorMsg,
      })
    }
    const since = Date.now() - lastCursorSent.current
    if (since >= CURSOR_THROTTLE_MS) {
      sendNow()
    } else {
      if (trailingTimer.current) clearTimeout(trailingTimer.current)
      trailingTimer.current = setTimeout(sendNow, CURSOR_THROTTLE_MS - since)
    }
    return () => {
      if (trailingTimer.current) {
        clearTimeout(trailingTimer.current)
        trailingTimer.current = null
      }
    }
  }, [enabled, cursor, myId, myColor])

  const broadcastFill = useCallback(
    (row: number, col: number) => {
      if (!enabled) return
      channelRef.current?.send({
        type: 'broadcast',
        event: 'fill',
        payload: { userId: myId, row, col, color: myColor } satisfies FillMsg,
      })
    },
    [enabled, myId, myColor],
  )

  return { peers, recentFills, broadcastFill }
}
