// cs-unmet

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import type { GCursor, GPlayer } from '../types'

type PeerCursor = { row: number; col: number; color: string }

type CursorMsg = { userId: string; row: number; col: number; color: string }
/** "Read the setter's note together" — crossplay's `showNotes`. Carries only
 *  the sender so a peer ignores its own echo. */
type ShowNoteMsg = { userId: string }

/** Cursor-broadcast throttle window (leading + trailing), so arrow-key
 *  auto-repeat doesn't fire one Broadcast per repeat (crossplay throttles the
 *  same). */
const CURSOR_THROTTLE_MS = 80

type PeerCursorsApi = {
  // peer userId → their cursor cell + color; the caller draws a frame.
  peers: Map<string, PeerCursor>
  // Ask teammates to open the setter's note ("read it together"), mirroring
  // crossplay's `showNotes`. A no-op in compete.
  broadcastNote: () => void
}

/**
 * Live coop presence on the SHARED grid: teammates' cursors, and the "open the
 * note" ask. Both ride one stable-name Realtime Broadcast channel, plus
 * Presence so a disconnected peer's cursor frame is dropped. Compete has
 * private grids, so none of this applies — pass `enabled=false` there and
 * the map stays empty. A teammate's letter and its flash come in the blob
 * (`useTeammateFills`), not here.
 */
export function usePeerCursors(
  gameId: string,
  enabled: boolean,
  cursor: GCursor | null,
  me: GPlayer,
  // Called when a teammate broadcasts "open the note" (crossplay's showNotes).
  // PlayArea wires this to open its CrosswordsNoteCompanion. Read via a ref so a changing
  // callback identity doesn't re-subscribe the channel.
  onPeerShowNote?: () => void,
): PeerCursorsApi {
  const myId = me.id
  const myColor = me.color
  const [peers, setPeers] = useState<Map<string, PeerCursor>>(() => new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  // Latest onPeerShowNote, so the broadcast handler below stays out of the
  // subscribe effect's deps (changing it must not tear down the channel).
  // Synced in an effect (not during render — refs are write-after-commit).
  const onPeerShowNoteRef = useRef(onPeerShowNote)
  useEffect(() => {
    onPeerShowNoteRef.current = onPeerShowNote
  }, [onPeerShowNote])
  // Cursor-broadcast throttle bookkeeping (leading + trailing edge).
  const lastCursorSent = useRef(0)
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const room = `crosswords:cursors:${gameId}`
    let canceled = false

    function join() {
      // Guards the deferred path only — the effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      const ch = supabase.channel(room, {
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
      ch.on('broadcast', { event: 'showNotes' }, ({ payload }) => {
        const p = payload as ShowNoteMsg
        if (p.userId === myId) return // don't reopen my own note broadcast
        onPeerShowNoteRef.current?.()
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
    }

    // Stable ROOM name (peer presence + cursor Broadcast need every peer on
    // the same topic), so a remount inside the previous mount's leave
    // round-trip would otherwise be handed the dying channel. See
    // common/realtime/channelTeardown.ts.
    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      canceled = true
      const ch = channelRef.current
      channelRef.current = null
      if (ch) void releaseChannel(ch) // null if we tore down before joining
    }
  }, [gameId, enabled, myId])

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

  const broadcastNote = useCallback(() => {
    if (!enabled) return
    channelRef.current?.send({
      type: 'broadcast',
      event: 'showNotes',
      payload: { userId: myId } satisfies ShowNoteMsg,
    })
  }, [enabled, myId])

  return { peers, broadcastNote }
}
