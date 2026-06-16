import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { navigate } from '../lib/router'
import { supabase } from '../lib/supabase'
import { computePause } from '../lib/pause'
import type { SetupMember, TimerMode } from '../lib/games'
import { useGameTimer } from './useGameTimer'

/**
 * Subset of common.games we surface to game pages. Mirrors the
 * row shape; the manifests can read setup-derived chrome (timer,
 * future Boggle "5x5" badges) without dipping into per-gametype
 * row state.
 */
export type CommonGame = {
  id: string
  club_id: string
  /** The owning club's URL handle, eagerly resolved here so the
   *  GamePage header can render Back-to-club as a real `<Link>`
   *  (with browser-visible href on hover, middle-click-to-open-
   *  in-new-tab, etc.) rather than a click-handler button doing
   *  a deferred fetch. */
  club_handle: string
  gametype: string
  title: string
  setup: { timer?: TimerMode } & Record<string, unknown>
  /** True when this game is the club's current view (the one
   *  whose URL members auto-route into). At most one per club —
   *  guarded by a partial unique index. Orthogonal to play_state:
   *  a current-view game can be terminal (a club still reviewing
   *  the end-state); a non-current game can be non-terminal (a
   *  suspended game waiting to be resumed). See docs/states.md. */
  is_current_view: boolean
  /** Gametype-specific play state — `'playing'` (and tinyspy's
   *  `'sudden_death'`) are non-terminal; everything else is
   *  terminal. See `is_terminal` for the materialized boolean. */
  play_state: string
  /** Materialized "is any terminal play_state" — `common.end_game`
   *  flips this to true alongside writing the terminal play_state.
   *  Lets consumers gate on a uniform boolean without needing to
   *  know each gametype's vocabulary. */
  is_terminal: boolean
  /** Free-form per-gametype outcome details (matched/mistakes for
   *  wordknit, greens_found/turns_used for tinyspy, etc.). Kept
   *  current by every state-transitioning RPC via common.update_state
   *  / common.end_game — not just a terminal-time snapshot. The
   *  matching manifest's labelFor reads this shape to render the
   *  club-page listing row. */
  status: Record<string, unknown> | null
  /** Server-tracked accumulator of wall-clock time during which
   *  no one was viewing this game. Maintained by
   *  common.set_current_view / unset_current_view. Fed into the
   *  timer hook so countdown timers don't tick when nobody's
   *  watching. See common.games column comments for the full
   *  invariant. */
  total_idle_seconds: number
  started_at: string
  ended_at: string | null
}

export type Member = SetupMember

/**
 * Broadcast event shape for the manual-pause feature. Pauser's
 * user_id rides along so peers can render "Bea paused the game"
 * overlay copy; the receiver looks up the member by id (no need
 * to ship usernames over the wire).
 *
 * Any-player-resume: there's no privileged "original pauser"
 * check. Any connected player can fire `manualUnpause`.
 */
type ManualPauseEvent =
  | { type: 'manualPause'; userId: string }
  | { type: 'manualUnpause' }

/**
 * Broadcast payload sent when one peer accepts the suspend-
 * confirm modal. Every connected peer (including the sender)
 * navigates themselves back to the club page in response. No
 * userId field needed — the action is uniform; we don't need to
 * label "Bea suspended" in the UI (the disappearance into the
 * club page is itself the signal).
 *
 * Symmetry note: the matching unset_current_view write happens
 * naturally via each peer's useCommonGame cleanup-on-unmount as
 * they navigate out. The last-leaver's cleanup wins; the others
 * see an empty presence set after they untrack and either no-op
 * (someone already cleared the flag) or harmlessly re-clear it.
 */
type SuspendEvent = { type: 'suspend' }

/**
 * The one common-side realtime entry point for a game page —
 * owns the **shared room** for this game across all peers.
 *
 * What "shared room" means: presence + manual-pause Broadcast
 * need every connected player on the SAME Realtime channel name
 * (presence rosters are per-channel-name; broadcasts only reach
 * channel-name peers). This hook opens a stable-name channel
 * (`game:${gameId}`) for that purpose. The stability is
 * non-negotiable, not a convenience: this channel is the FE-side
 * meeting place for the **one-current-view-per-club** invariant
 * the DB-side partial unique index enforces. If peers ended up on
 * differently-named channels (a UUID suffix per tab), presence
 * sets wouldn't merge, the unset_current_view cleanup wouldn't
 * know whether it was the last viewer leaving, and the invariant
 * would surface as either stuck pointers (nobody clears) or
 * thrash (everyone clears).
 *
 * Per-gametype hooks (`useWordknitGame`, etc.) open their own
 * UUID-suffixed channels for postgres-changes on their game-
 * specific tables — those don't need to coordinate across peers,
 * so a per-tab channel is fine and avoids supabase-js's
 * "attach-all-.on()-before-.subscribe()" rule (no other hook
 * needs to attach handlers to *this* channel after it subscribes).
 *
 * What this hook owns:
 *   - common.games row + common.game_players + their profiles
 *     (members list)
 *   - Postgres-changes on common.games for this gameId
 *   - Presence-tracking (`presentUserIds` derivation)
 *   - Manual-pause Broadcast (send + receive + idempotent apply)
 *   - useGameTimer running against `commonGame.setup.timer`
 *     (anchored to common.games.started_at)
 *   - Paused-union state: presence-missing OR manually paused
 *
 * Returns:
 *   - `commonGame` — the common.games row, or null while loading
 *   - `members` — common.game_players ⨯ profiles
 *   - `paused` — union of presence-pause + manual-pause
 *   - `missing` — players whose presence isn't tracked
 *   - `manuallyPausedBy` — the member who clicked Pause (null
 *     if the pause is presence-only)
 *   - `sendManualPause` / `sendManualUnpause` — broadcast senders
 *   - `timer` — `{ displaySeconds, expired }` from useGameTimer
 *   - `loading` — false once initial fetch completes
 *
 * Phase B replaces each per-gametype useGame's
 * presence/broadcast/timer/members machinery with this hook.
 * Wordknit and tinyspy keep their own gametype-side useGame
 * for selection broadcasts + per-gametype row data (on their own
 * separate channel).
 */
export function useCommonGame(
  gameId: string,
  session: Session,
): {
  commonGame: CommonGame | null
  members: Member[]
  paused: boolean
  missing: Member[]
  manuallyPausedBy: Member | null
  sendManualPause: () => void
  sendManualUnpause: () => void
  sendSuspend: () => void
  timer: { displaySeconds: number; expired: boolean }
  loading: boolean
} {
  const [commonGame, setCommonGame] = useState<CommonGame | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
  )
  // user_id of whoever clicked the most recent un-resolved manual
  // pause. null when no manual pause is in effect.
  const [manuallyPausedById, setManuallyPausedById] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  // Held in state so a new effect run (StrictMode double-mount,
  // gameId change) gets a fresh channel and re-renders consumers.
  // The setChannel-in-effect below is intentional — the realtime
  // channel IS the external system being synced into React state.
  const [channel, setChannel] = useState<
    ReturnType<typeof supabase.channel> | null
  >(null)

  // Mirror of presentUserIds the cleanup callback can read at
  // unmount time without being a stale closure capture. Written
  // alongside setPresentUserIds inside the presence-sync handler
  // (not during render); the hook fires unset_current_view IFF
  // this ref says I'm the only viewer at the moment of unmount
  // — see the effect's cleanup below for the full story.
  const presentUserIdsRef = useRef<Set<string>>(new Set())

  // Mirror of commonGame.club_handle that the suspend-broadcast
  // handler can read at receive time. The handler is registered
  // once on subscribe (before commonGame loads); a ref decouples
  // it from the load-time setState. Written by `load()` below
  // alongside setCommonGame.
  const clubHandleRef = useRef<string>('')

  // Idempotent apply for manual-pause events — handles echoes of
  // our own broadcasts via React's referential-equality setState
  // bail-out.
  const applyManualPause = useCallback((event: ManualPauseEvent) => {
    if (event.type === 'manualPause') {
      setManuallyPausedById(event.userId)
    } else {
      setManuallyPausedById(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function load() {
      // Common-side row + player roster + profile usernames.
      // PostgREST's schema cache doesn't resolve cross-schema FKs
      // (this all sits in common, so it's same-schema joins).
      // Two queries instead of an embed because game_players →
      // profiles is on user_id, which PostgREST resolves cleanly
      // but we want explicit control over the columns selected.
      // Eager-join to common.clubs for the URL handle, so GamePage
      // can render Back-to-club as a real <Link>. PostgREST resolves
      // the games.club_id → clubs.id FK automatically.
      const [{ data: gameData }, { data: playerRows }] = await Promise.all([
        commonDb
          .from('games')
          .select(
            'id, club_id, gametype, title, setup, is_current_view, play_state, is_terminal, status, total_idle_seconds, started_at, ended_at, clubs(handle)',
          )
          .eq('id', gameId)
          .maybeSingle(),
        commonDb
          .from('game_players')
          .select('user_id')
          .eq('game_id', gameId),
      ])
      if (!mounted) return

      if (!gameData) {
        setCommonGame(null)
        setMembers([])
        setLoading(false)
        return
      }

      let memberList: Member[] = []
      const userIds = (playerRows ?? []).map((r) => r.user_id)
      if (userIds.length > 0) {
        const { data: profileData } = await commonDb
          .from('profiles')
          .select('user_id, username')
          .in('user_id', userIds)
        if (!mounted) return
        memberList = (profileData ?? []) as Member[]
      }

      const clubHandle =
        (gameData.clubs as { handle: string } | null)?.handle ?? ''

      clubHandleRef.current = clubHandle
      setCommonGame({
        ...gameData,
        club_handle: clubHandle,
        setup: gameData.setup as CommonGame['setup'],
        status: gameData.status as CommonGame['status'],
      })
      setMembers(memberList)
      setLoading(false)
    }

    // Stable channel name: every connected peer for this game
    // joins the same Realtime "room." Required for presence to
    // see everyone and broadcasts to reach all peers. StrictMode
    // double-mount is handled by the cleanup-then-recreate cycle
    // in this effect; removeChannel(ch) clears the supabase-js
    // per-client cache before the second effect run.
    const ch = supabase.channel(`game:${gameId}`)

    // Postgres-changes on common.games for this gameId. Drives
    // refetch on is_current_view flip, ended_at set, status jsonb
    // populate — the cross-cutting transitions every consumer
    // cares about.
    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'common',
        table: 'games',
        filter: `id=eq.${gameId}`,
      },
      load,
    )

    // Manual-pause Broadcast. Idempotent apply handles echoes of
    // our own sends.
    ch.on('broadcast', { event: 'manualPause' }, ({ payload }) =>
      applyManualPause(payload as ManualPauseEvent),
    )

    // Suspend Broadcast. When one peer accepts the suspend-
    // confirm modal, every connected peer (including the
    // sender, via echo) navigates back to the club page. The
    // resulting cascade of unmounts feeds last-viewer-leaves
    // into unset_current_view; whichever cleanup runs last
    // clears the flag. The clubHandleRef indirection is so the
    // handler resolves the current handle at receive-time
    // rather than at register-time (load() runs later).
    ch.on('broadcast', { event: 'suspend' }, () => {
      const handle = clubHandleRef.current
      if (!handle) return
      navigate(`/c/${handle}`)
    })

    // Presence: dedupe to user_ids so multiple tabs of the same
    // user don't double-count. We also mirror to a ref so the
    // unmount cleanup can read the latest snapshot — see the
    // cleanup return below.
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<
        string,
        Array<{ user_id?: string }>
      >
      const ids = new Set<string>()
      for (const list of Object.values(state)) {
        for (const entry of list) {
          if (entry.user_id) ids.add(entry.user_id)
        }
      }
      presentUserIdsRef.current = ids
      setPresentUserIds(ids)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        load()
        ch.track({ user_id: session.user.id })
        // First-viewer-mount write: flip this game to the
        // club's current view (and vacate any prior one).
        // Idempotent server-side — re-mounting an already-
        // current game is a no-op. Fires on every SUBSCRIBED
        // (including reconnects), which is what we want: a
        // member who reconnects re-asserts they're viewing.
        // See docs/states.md → "Lifecycle: when is_current_view
        // flips" and the matching common.set_current_view RPC.
        //
        // Fragile: errors are logged-and-swallowed. The RPC is
        // idempotent (its `is_current_view = false` guard absorbs
        // double-fires), and the next SUBSCRIBED reconnect re-
        // asserts state — so transient failures self-heal at the
        // next network blip. A persistent failure (RLS broken,
        // RPC dropped) goes unnoticed by the user. Acceptable
        // under the friends-alpha posture; revisit when there's a
        // user-visible error-surface story.
        // See docs/code-review-2026-06-16.md §1.2 +
        // docs/deferred.md → Common.
        commonDb
          .rpc('set_current_view', { target_game: gameId })
          .then((res) => {
            if (res.error) {
              console.error('set_current_view failed', res.error)
            }
          })
      }
    })
    setChannel(ch)

    load()

    return () => {
      mounted = false

      // Last-viewer-leave write. Fire unset_current_view IFF
      // the latest presence snapshot says I'm the only viewer
      // — `{me}` or the not-yet-synced empty set (which covers
      // the StrictMode quick-mount-unmount cycle where presence
      // never propagated; the RPC's `is_current_view = true`
      // guard makes a stale-fire harmless). A presence set with
      // other user_ids means someone else is still viewing —
      // they'll fire unset themselves when they become last.
      //
      // The two-peers-leave-simultaneously race (both see
      // {me, you}, both skip the unset) is a known acceptable
      // gap: the next club-page visit re-establishes the
      // pointer via set_current_view's vacate-others step.
      const ids = presentUserIdsRef.current
      const iAmLastOrUnknown =
        ids.size === 0 || (ids.size === 1 && ids.has(session.user.id))
      if (iAmLastOrUnknown) {
        // Fragile, same shape as set_current_view above: errors
        // logged-and-swallowed. The RPC is idempotent (its
        // `is_current_view = true` guard absorbs no-ops). A
        // persistent failure leaves the club's pointer stuck on
        // a stale game — recoverable by the next set_current_view
        // (its vacate-others step clears stragglers), but the gap
        // until then is silent. Same friends-alpha tradeoff as
        // above; revisit alongside that one.
        commonDb
          .rpc('unset_current_view', { target_game: gameId })
          .then((res) => {
            if (res.error) {
              console.error('unset_current_view failed', res.error)
            }
          })
      }

      try {
        ch.untrack()
      } catch {
        // ignore — channel may already be closed
      }
      supabase.removeChannel(ch)
      setChannel(null)
    }
  }, [applyManualPause, gameId, session.user.id])

  // Re-broadcast active manual-pause whenever the set of connected
  // peers changes, so a peer joining mid-pause (or reconnecting
  // after the original pauser closed their tab) lands in the same
  // paused state instead of seeing a phantom-resumed board.
  useEffect(() => {
    if (!channel || manuallyPausedById === null) return
    channel.send({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: manuallyPausedById },
    })
  }, [channel, manuallyPausedById, presentUserIds])

  // Manual-pause broadcasters. Optimistic local apply + broadcast.
  const sendManualPause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = {
      type: 'manualPause',
      userId: session.user.id,
    }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel, session.user.id])

  const sendManualUnpause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = { type: 'manualUnpause' }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel])

  // Suspend-now broadcaster. Called by GamePage when the local
  // user accepts the suspend-confirm modal. Fires the broadcast
  // first so peers start navigating, then navigates self — the
  // broadcast handler above also fires on the local channel
  // (Realtime echoes broadcasts back to the sender), so the
  // local navigate would happen anyway; calling it directly
  // here keeps the self-navigation path independent of the
  // self-echo timing.
  const sendSuspend = useCallback(() => {
    if (!channel) return
    const event: SuspendEvent = { type: 'suspend' }
    channel.send({ type: 'broadcast', event: 'suspend', payload: event })
    const handle = clubHandleRef.current
    if (handle) navigate(`/c/${handle}`)
  }, [channel])

  // Presence-pause + manual-pause unify into a single `paused`
  // flag. The two sources can coexist; the union truthy-ness is
  // what consumers care about.
  //
  // Short-circuit on game-end: once `ended_at` is populated,
  // pause is moot — the game is over. Forcing paused=false in
  // this case lets PauseBoundary remount PlayArea so it renders
  // the terminal result (ResultBanner, GameOverBanner, etc.).
  // Without this, a terminal-during-pause edge case (stale-tab
  // peer fires submit_timeout, etc.) would leave the overlay
  // stuck up over a game that's already done.
  const { paused: presencePaused, missing } = computePause(
    presentUserIds,
    members,
  )
  const manuallyPausedBy = manuallyPausedById
    ? members.find((m) => m.user_id === manuallyPausedById) ?? null
    : null
  const paused =
    (presencePaused || manuallyPausedBy !== null)
    && commonGame?.ended_at == null

  // Timer. Anchored to common.games.started_at; mode from setup;
  // idle_seconds folded in so countdowns don't tick while nobody's
  // viewing. Pre-load (commonGame null) feeds placeholder values
  // so the hook stays callable; consumers gate the display on
  // commonGame !== null below.
  const timer = useGameTimer({
    startedAt: commonGame?.started_at ?? new Date().toISOString(),
    paused,
    mode: commonGame?.setup.timer ?? { kind: 'none' },
    idleSeconds: commonGame?.total_idle_seconds ?? 0,
  })

  return {
    commonGame,
    members,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    sendSuspend,
    timer,
    loading,
  }
}
