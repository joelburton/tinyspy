import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/supabase'

const commonDb = supabase.schema('common')

const FLUSH_MS = 300 // debounce before the full-text write
const HEARTBEAT_MS = 1000 // re-assert the lock this often while editing
const HOLD_WINDOW_MS = 3000 // auto-release the lock this long after your last edit
const GRACE_MS = 1500 // can't steal the lock within this of the holder's last assert
const STALE_MS = 4000 // a holder silent this long is treated as gone

/** Who currently holds the shared-pad edit lock (from Broadcast). */
type Holder = { userId: string; username: string; at: number }

type LockEvent =
  | { type: 'claim'; userId: string; username: string; at: number }
  | { type: 'release'; userId: string }

export type ScratchpadApi = {
  body: string
  setBody: (text: string) => void
  loading: boolean
  /** Whether the local user may type right now (private pad, or they hold the
   *  shared lock / it's free). */
  canEdit: boolean
  /** The name of the OTHER player currently editing the shared pad, or null. */
  editingBy: string | null
  /** Whether the local user can claim the lock from a stale/idle holder. */
  canTakeOver: boolean
  takeOver: () => void
}

/**
 * The per-game scratchpad body + (for the shared coop pad) a Realtime
 * takeover lock. `ownerId` null = the shared pad (locked); a user id = a
 * private compete pad (no lock — you're the only writer).
 *
 * Body sync: DB-backed, applied directly from CDC "newer wins" (per-row
 * `version`), with the local edit echoed optimistically + a debounced
 * full-text flush via `set_scratchpad`. Lock: on a STABLE-name Broadcast
 * channel (shared room), the holder re-asserts a claim while editing and
 * auto-releases when idle / disconnected; others read-only until they take
 * over.
 */
export function useScratchpad(
  gameId: string,
  ownerId: string | null,
  myId: string,
  username: string,
  editingDisabled: boolean, // e.g. terminal — read-only
): ScratchpadApi {
  const shared = ownerId === null
  const [body, setBodyState] = useState('')
  const [loading, setLoading] = useState(true)
  const [holder, setHolder] = useState<Holder | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const versionRef = useRef(-1)
  const bodyRef = useRef('')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEditRef = useRef(0)
  const holderRef = useRef<Holder | null>(null)
  useEffect(() => {
    holderRef.current = holder
  })

  // Merge an authoritative body in, newer-wins.
  const applyBody = useCallback((nextBody: string, nextVersion: number) => {
    if (nextVersion <= versionRef.current) return
    versionRef.current = nextVersion
    bodyRef.current = nextBody
    setBodyState(nextBody)
  }, [])

  // ── Load + realtime (body CDC + lock Broadcast) on ONE stable channel ──
  useEffect(() => {
    let active = true

    async function load() {
      const q = commonDb
        .from('game_scratchpads')
        .select('body, version')
        .eq('game_id', gameId)
      const { data } = await (ownerId === null ? q.is('owner_id', null) : q.eq('owner_id', ownerId))
      if (!active) return
      const row = data?.[0]
      if (row) applyBody(row.body, row.version)
      setLoading(false)
    }

    const ch = supabase.channel(`scratchpad:${gameId}`)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'common', table: 'game_scratchpads', filter: `game_id=eq.${gameId}` },
      (payload) => {
        const r = payload.new as { owner_id: string | null; body: string; version: number }
        const rowOwner = r.owner_id ?? null
        if (rowOwner !== ownerId) return // not our pad
        // While I hold the shared lock, MY local text is authoritative — ignore
        // incoming CDC bodies (crossplay: "when we DO hold it, we ignore incoming
        // text"). Without this, a body write that outruns my own flush's RPC
        // response — my echo, or a racing non-holder's stray flush — lands mid-
        // keystroke and visibly reverts what I've typed during the flush RTT
        // (caret jumps to end). My next flush re-propagates my text (version
        // bumps monotonically), so dropping the event is safe and self-heals.
        // My own writes still advance versionRef via the flush RPC response.
        if (shared && holderRef.current?.userId === myId) return
        applyBody(r.body, r.version)
      },
    )
    if (shared) {
      ch.on('broadcast', { event: 'lock' }, ({ payload }) => {
        const ev = payload as LockEvent
        if (ev.userId === myId) return // ignore our own echo
        if (ev.type === 'claim') {
          setHolder({ userId: ev.userId, username: ev.username, at: ev.at })
        } else {
          setHolder((h) => (h && h.userId === ev.userId ? null : h))
        }
      })
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void load()
    })
    channelRef.current = ch

    return () => {
      active = false
      // Release the lock on unmount so peers aren't stuck waiting.
      if (shared && holderRef.current?.userId === myId) {
        ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'release', userId: myId } })
      }
      channelRef.current = null
      void supabase.removeChannel(ch)
    }
  }, [gameId, ownerId, shared, myId, applyBody])

  // Staleness/grace re-render tick (only meaningful for the shared pad).
  useEffect(() => {
    if (!shared) return
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [shared])

  // Heartbeat: re-assert the lock while recently editing; auto-release when idle.
  useEffect(() => {
    if (!shared) return
    const t = setInterval(() => {
      const ch = channelRef.current
      if (!ch) return
      const iHold = holderRef.current?.userId === myId
      if (!iHold) return
      if (Date.now() - lastEditRef.current < HOLD_WINDOW_MS) {
        const at = Date.now()
        setHolder({ userId: myId, username, at })
        ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'claim', userId: myId, username, at } })
      } else {
        setHolder(null)
        ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'release', userId: myId } })
      }
    }, HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [shared, myId, username])

  const flush = useCallback(
    (text: string) => {
      void commonDb
        // p_owner is a nullable uuid (null = the shared pad), but the generated
        // arg type is non-null. PostgREST passes null through fine.
        .rpc('set_scratchpad', { target_game: gameId, p_owner: ownerId as string, p_body: text })
        .then(({ data, error }) => {
          // Don't silently swallow a failed flush (keep-logs ethos): notes typed
          // in the last debounce window before the game turns terminal ride on
          // this write, and a dropped one is only visible locally + lost on
          // reload. No retry — the next keystroke re-flushes the full body.
          if (error) {
            console.warn('[scratchpad] flush failed:', error.message)
            return
          }
          if (typeof data === 'number' && data > versionRef.current) versionRef.current = data
        })
    },
    [gameId, ownerId],
  )

  const claim = useCallback(() => {
    const ch = channelRef.current
    const at = Date.now()
    setHolder({ userId: myId, username, at })
    ch?.send({ type: 'broadcast', event: 'lock', payload: { type: 'claim', userId: myId, username, at } })
  }, [myId, username])

  // Derived lock view.
  const foreign =
    shared && holder && holder.userId !== myId && nowTick - holder.at < STALE_MS ? holder : null
  const editingBy = foreign ? foreign.username : null
  const canEdit = !editingDisabled && (!shared || editingBy === null)
  const canTakeOver = !editingDisabled && foreign !== null && nowTick - foreign.at > GRACE_MS

  const setBody = useCallback(
    (text: string) => {
      if (!canEdit) return
      bodyRef.current = text
      setBodyState(text)
      lastEditRef.current = Date.now()
      if (shared && holderRef.current?.userId !== myId) claim()
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => flush(text), FLUSH_MS)
    },
    [canEdit, shared, myId, claim, flush],
  )

  const takeOver = useCallback(() => {
    lastEditRef.current = Date.now()
    claim()
  }, [claim])

  return { body, setBody, loading, canEdit, editingBy, canTakeOver, takeOver }
}
