// cs-blessed-scratchpad

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { readRows, runRpc } from '../supabase/dbResult'
import { reportUnhandled } from '../supabase/dbEnvelope'

const commonDb = supabase.schema('common')

const FLUSH_MS = 300 // debounce before the full-text write
const HEARTBEAT_MS = 1000 // re-assert the lock this often while editing
const HOLD_WINDOW_MS = 3000 // auto-release the lock this long after your last edit
const GRACE_MS = 1500 // can't steal the lock within this of the holder's last assert
const STALE_MS = 4000 // a holder silent this long is treated as gone

/** Who currently holds the shared-pad edit lock (from Broadcast). */
type Holder = { userId: string; at: number }

type LockEvent =
  | { type: 'claim'; userId: string; at: number }
  | { type: 'release'; userId: string }

/** What a pad's textarea binds to: the text, the setter, and the lock as the
 *  local player sees it. */
export type ScratchpadApi = {
  body: string
  setBody: (text: string) => void
  loading: boolean
  // Whether the local player may type right now: a private pad, or the shared
  // lock is theirs or free.
  canEdit: boolean
  // The user id of the OTHER player editing the shared pad, or null. The
  // caller names them from its roster.
  editingBy: string | null
  // Whether the local player may claim the lock from an idle holder.
  canTakeOver: boolean
  takeOver: () => void
}

/** What `common.set_scratchpad` puts in `data`. The version is the point: the
 *  caller keeps the highest one seen, so an out-of-order flush cannot roll the
 *  pad backwards. Nullable because the RPC's not-ok arms arrive through a
 *  raise. */
type SavedPad = { result: 'saved'; version: number } | null

/**
 * A game's scratchpad, kept in sync for as long as the hook is mounted. Pass
 * `ownerId` null for the shared coop pad, or a user id for that player's
 * private compete pad.
 *
 * The body is the table's: every write is a debounced full-text flush through
 * `set_scratchpad`, and rows arriving over Realtime apply newest-version-wins,
 * with the local edit shown at once. The shared pad also has a lock, which is
 * peers agreeing over Broadcast on the same channel: typing claims it, the
 * holder re-asserts it while editing and releases it when idle, and everyone
 * else is read-only until it frees or they take it over. The whole shape:
 * doc.md → Intro to area.
 */
export function useScratchpad(
  gameId: string,
  ownerId: string | null,
  myId: string,
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

  // While I hold the shared lock, what I have typed outranks any body that
  // arrives — an event or a refetch that outruns my own flush would otherwise
  // revert the textarea under the caret. My next flush carries my text
  // anyway, and its reply advances the version.
  const myTextIsAuthoritative = useCallback(
    () => shared && holderRef.current?.userId === myId,
    [shared, myId],
  )

  // ── Load + realtime (body CDC + lock Broadcast) on ONE stable channel ──
  useEffect(() => {
    let active = true

    async function load() {
      const q = commonDb
        .from('game_scratchpads')
        .select('body, version')
        .eq('game_id', gameId)
      // `is` rather than `eq` for the SHARED pad: PostgREST needs `is` to match
      // a null, and an `eq` against one matches nothing.
      const res = await readRows(
        ownerId === null ? q.is('owner_id', null) : q.eq('owner_id', ownerId),
      )
      if (!active) return
      // A failed read leaves whatever is on the pad ALONE and stops loading.
      // This runs again on the next SUBSCRIBED or attach, which seeds it then
      // — and blanking a pad someone is typing in would be the one thing worse
      // than showing a stale one. `readRows` has logged it and raised the modal.
      if (res.type === 'not-ok') {
        setLoading(false)
        return
      }
      // ZERO ROWS is a pad nobody has written in yet: there is no row until the
      // first flush, and an empty pad is exactly what it should show.
      const row = res.data[0]
      if (row && !myTextIsAuthoritative()) applyBody(row.body, row.version)
      setLoading(false)
    }

    const room = `scratchpad:${gameId}`
    let canceled = false

    function join() {
      // Guards the deferred path only: the effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      const ch = supabase.channel(room)
      // Applied straight from the payload rather than refetched: a flush lands
      // every pause in typing, and the version is all the merge needs.
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'common', table: 'game_scratchpads', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const r = payload.new as { owner_id: string | null; body: string; version: number }
          const rowOwner = r.owner_id ?? null
          if (rowOwner !== ownerId) return // not our pad
          if (myTextIsAuthoritative()) return
          applyBody(r.body, r.version)
        },
      )
      if (shared) {
        ch.on('broadcast', { event: 'lock' }, ({ payload }) => {
          const ev = payload as LockEvent
          if (ev.userId === myId) return // ignore our own echo
          if (ev.type === 'claim') {
            setHolder({ userId: ev.userId, at: ev.at })
          } else {
            setHolder((h) => (h && h.userId === ev.userId ? null : h))
          }
        })
      }
      // Deaf-window closer: re-read once the postgres_changes attach is
      // confirmed — a pad write committed between SUBSCRIBED (the join ack)
      // and the attach is dropped. See postgresAttached.ts.
      onPostgresAttached(ch, () => void load())
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') void load()
      })
      channelRef.current = ch
    }

    // Stable ROOM name (the shared pad's lock broadcasts need every peer on
    // the same topic), so a fast close→reopen inside the previous mount's
    // leave round-trip would otherwise be handed the dying channel. Nothing
    // pending is the fast path. See channelTeardown.ts.
    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      active = false
      canceled = true
      const ch = channelRef.current
      channelRef.current = null
      if (!ch) return // torn down before our turn to join came round
      // Release the lock on unmount so peers aren't stuck waiting.
      if (shared && holderRef.current?.userId === myId) {
        ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'release', userId: myId } })
      }
      void releaseChannel(ch)
    }
  }, [gameId, ownerId, shared, myId, applyBody, myTextIsAuthoritative])

  // The clock behind the grace and staleness windows. It runs only while a
  // holder is known — with nobody editing there is nothing to age — and a
  // holder whose claim has gone stale is cleared here, which is what ends the
  // interval and keeps the state saying what the screen says. It is not
  // seeded when a holder appears: a fresh claim is newer than any clock this
  // has, so it reads as live and not yet takeable until the first tick.
  const hasHolder = holder !== null
  useEffect(
    function ageTheHolder() {
      if (!hasHolder) return
      const t = setInterval(() => {
        const now = Date.now()
        setNowTick(now)
        const h = holderRef.current
        if (h && now - h.at > STALE_MS) setHolder(null)
      }, 1000)
      return () => clearInterval(t)
    },
    [hasHolder],
  )

  // Heartbeat, only while I hold the lock: re-assert it while recently
  // editing; release it when idle, which is what ends the interval.
  const iHold = shared && holder?.userId === myId
  useEffect(
    function heartbeatWhileHolding() {
      if (!iHold) return
      const t = setInterval(() => {
        const ch = channelRef.current
        if (!ch) return
        if (Date.now() - lastEditRef.current < HOLD_WINDOW_MS) {
          const at = Date.now()
          setHolder({ userId: myId, at })
          ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'claim', userId: myId, at } })
        } else {
          setHolder(null)
          ch.send({ type: 'broadcast', event: 'lock', payload: { type: 'release', userId: myId } })
        }
      }, HEARTBEAT_MS)
      return () => clearInterval(t)
    },
    [iHold, myId],
  )

  const flush = useCallback(
    (text: string) => {
      void runRpc<SavedPad>(
        // p_owner_id is a nullable uuid (null = the shared pad), but the generated
        // arg type is non-null. PostgREST passes null through fine.
        commonDb.rpc('set_scratchpad', { target_game: gameId, p_owner_id: ownerId as string, p_body: text }),
      ).then((res) => {
        if (res.type === 'not-ok') {
          // A fault, and `runRpc` has already raised its modal. The line names
          // which write it was, which the modal cannot. No retry — the next
          // keystroke re-flushes the full body.
          console.error('[scratchpad] flush failed:', res.message)
        } else if (res.type === 'ok' && res.data?.result === 'saved') {
          // Keep the HIGHEST version seen: flushes are debounced and can land
          // out of order, and a slow reply must not roll the pad backwards.
          const { version } = res.data
          if (version > versionRef.current) versionRef.current = version
        } else {
          reportUnhandled('set_scratchpad', res)
        }
      })
    },
    [gameId, ownerId],
  )

  const claim = useCallback(() => {
    const ch = channelRef.current
    const at = Date.now()
    setHolder({ userId: myId, at })
    ch?.send({ type: 'broadcast', event: 'lock', payload: { type: 'claim', userId: myId, at } })
  }, [myId])

  // Derived lock view.
  const foreign =
    shared && holder && holder.userId !== myId && nowTick - holder.at < STALE_MS ? holder : null
  const editingBy = foreign ? foreign.userId : null
  const canEdit = !shared || editingBy === null
  const canTakeOver = foreign !== null && nowTick - foreign.at > GRACE_MS

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
