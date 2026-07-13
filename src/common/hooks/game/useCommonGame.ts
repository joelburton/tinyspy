import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'
import { navigate } from '../../lib/routing/router'
import { supabase } from '../../lib/supabase/supabase'
import { computePause } from '../../lib/game/pause'
import type { GamePlayer, Member, TimerMode } from '../../lib/games'
import { useGameTimer } from './useGameTimer'

/**
 * Subset of common.games we surface to game pages. Mirrors the
 * row shape; the manifests can read setup-derived chrome (timer,
 * future Boggle "5x5" badges) without dipping into per-gametype
 * row state.
 */
export type CommonGame = {
  id: string
  /** The owning club's handle. Lets the GamePage header render
   *  Back-to-club as a real `<Link>` (with browser-visible href
   *  on hover, middle-click-to-open-in-new-tab, etc.) without a
   *  deferred fetch. Since clubs are now keyed by handle (no
   *  separate uuid), this IS the column on common.games. */
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
  /** Gametype-specific play state. `'playing'` is the standard
   *  non-terminal value; some gametypes have additional non-
   *  terminal states. Gate on `is_terminal` below — it's the
   *  materialized "any terminal play_state" boolean. */
  play_state: string
  /** Materialized "is any terminal play_state" — `common.end_game`
   *  flips this to true alongside writing the terminal play_state.
   *  Lets consumers gate on a uniform boolean without needing to
   *  know each gametype's vocabulary. */
  is_terminal: boolean
  /** Free-form per-gametype outcome detail. Each gametype writes
   *  its own shape; the matching manifest's `labelFor` reads
   *  it back to render the club-page listing row. Kept current
   *  by every state-transitioning RPC via common.update_state /
   *  common.end_game — not just a terminal-time snapshot. */
  status: Record<string, unknown> | null
  started_at: string
  ended_at: string | null
  /** Whose turn it is, for the opt-in turn-by-turn coop mode
   *  (setup coopStyle='turns'). NULL for free-for-all games (the
   *  default) — i.e. every game that doesn't opt in. Rotated
   *  server-side by common._advance_turn; the FE reads it only to
   *  gate input + render the waiting line. Compare to
   *  session.user.id (see the hook's `isMyTurn` below). Scrabble
   *  compete does NOT use this — it keeps its own seat pointer. */
  current_turn_user_id: string | null
}


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
 * Per-gametype `useGame` hooks open their own UUID-suffixed
 * channels for postgres-changes on their game-specific tables —
 * those don't need to coordinate across peers, so a per-tab
 * channel is fine and avoids supabase-js's "attach-all-.on()-
 * before-.subscribe()" rule (no other hook needs to attach
 * handlers to *this* channel after it subscribes).
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
 *   - `players` — common.game_players ⨯ profiles
 *   - `paused` — union of presence-pause + manual-pause
 *   - `missing` — players whose presence isn't tracked
 *   - `manuallyPausedBy` — the member who clicked Pause (null
 *     if the pause is presence-only)
 *   - `sendManualPause` / `sendManualUnpause` — broadcast senders
 *   - `timer` — `{ displaySeconds, expired }` from useGameTimer
 *   - `loading` — false once initial fetch completes
 *
 * The per-gametype `useGame` hooks stay focused on selection
 * broadcasts + per-gametype row data on their own separate
 * channel — they don't repeat the presence / pause / timer /
 * members machinery that lives here.
 */
export function useCommonGame(
  gameId: string,
  session: Session,
): {
  commonGame: CommonGame | null
  players: GamePlayer[]
  paused: boolean
  missing: Member[]
  manuallyPausedBy: Member | null
  sendManualPause: () => void
  sendManualUnpause: () => void
  sendSuspend: () => void
  timer: { displaySeconds: number; expired: boolean }
  /** True when the caller may act right now under turn-order. Always
   *  true for free-for-all games (the pointer is null) and for solo,
   *  so games that don't opt in are unaffected — they can gate on
   *  this unconditionally. Turn games AND-it into their existing
   *  input gate (canGuess/readOnly/etc.). Pre-load (commonGame null)
   *  it's true, matching the pre-load "nothing to gate yet" posture. */
  isMyTurn: boolean
  loading: boolean
} {
  const [commonGame, setCommonGame] = useState<CommonGame | null>(null)
  const [players, setPlayers] = useState<GamePlayer[]>([])
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

  // Join this game's shared Realtime room: load the row + roster,
  // attach the postgres-changes / broadcast / presence handlers,
  // subscribe, and assert current-view on connect. The matching
  // cleanup leaves the room (unset_current_view if last viewer,
  // untrack, removeChannel). See the hook docstring above for the
  // "shared room" framing this name echoes.
  useEffect(function joinGameRoom() {
    let mounted = true
    // Monotonic generation for out-of-order protection: this effect fires
    // overlapping loads (initial + on-SUBSCRIBED + one per postgres-changes
    // event), which can resolve out of order. Each `load()` stamps a
    // generation and commits only if it's still the newest — so a slow initial
    // load landing after a fast event-load can't regress play_state / is_terminal
    // / the roster. Same fix as useRealtimeRefetch's factory.
    let generation = 0

    async function load() {
      const myGen = ++generation
      // Common-side row + player roster + profile usernames.
      // Two queries instead of an embed: game_players → profiles
      // is on user_id, easy enough to read directly with explicit
      // column control.
      //
      // No need to embed clubs(handle) anymore — common.games.
      // club_handle IS the club's handle (post-uuid-PK-drop), so
      // GamePage can build the Back-to-club href from the row
      // directly.
      const [{ data: gameData }, { data: playerRows }] = await Promise.all([
        commonDb
          .from('games')
          .select(
            'id, club_handle, gametype, title, setup, is_current_view, play_state, is_terminal, status, started_at, ended_at, current_turn_user_id',
          )
          .eq('id', gameId)
          .maybeSingle(),
        commonDb
          .from('game_players')
          .select('user_id, conceded, conceded_at, result')
          .eq('game_id', gameId),
      ])
      if (!mounted || myGen !== generation) return

      if (!gameData) {
        setCommonGame(null)
        setPlayers([])
        setLoading(false)
        return
      }

      let playerList: GamePlayer[] = []
      const userIds = (playerRows ?? []).map((r) => r.user_id)
      if (userIds.length > 0) {
        const { data: profileData } = await commonDb
          .from('profiles')
          .select('user_id, username, color')
          .in('user_id', userIds)
        if (!mounted || myGen !== generation) return
        // Merge the profile (username/color) with the per-player
        // game_players bits (conceded/result) into one GamePlayer.
        const byId = new Map(
          (playerRows ?? []).map((r) => [r.user_id, r]),
        )
        playerList = (profileData ?? []).map((prof) => {
          const gp = byId.get(prof.user_id)
          return {
            ...(prof as Member),
            conceded: gp?.conceded ?? false,
            conceded_at: gp?.conceded_at ?? null,
            result: (gp?.result as GamePlayer['result']) ?? null,
          }
        })
      }

      clubHandleRef.current = gameData.club_handle
      setCommonGame({
        ...gameData,
        setup: gameData.setup as CommonGame['setup'],
        status: gameData.status as CommonGame['status'],
      })
      setPlayers(playerList)
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

    // Postgres-changes on common.game_players for this game. A
    // mid-game concede (common.concede) flips a player's `conceded`
    // WITHOUT touching common.games, so the games listener above
    // wouldn't fire — but every peer's OpponentStrip needs to see
    // the drop-out. This makes any per-player change (concede now,
    // end-of-game `result` writes too) refetch the roster.
    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'common',
        table: 'game_players',
        filter: `game_id=eq.${gameId}`,
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
  useEffect(function rebroadcastManualPause() {
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
  // the terminal result (GameOverModal + per-game review state).
  // Without this, a terminal-during-pause edge case (stale-tab
  // peer fires submit_timeout, etc.) would leave the overlay
  // stuck up over a game that's already done.
  // Conceded players are dropped from the presence-pause roster: a
  // conceder has willfully quit the race, so their leaving the tab
  // must NOT wedge everyone else behind a "Waiting for <quitter>…"
  // overlay. This is the documented contract (docs/common.md: a
  // conceder drops out "while the others keep racing"). Invited-but-
  // not-yet-joined players stay counted — that presence-pause IS
  // deliberate; only a real concede removes someone.
  const activePlayers = players.filter((p) => !p.conceded)
  const { paused: presencePaused, missing } = computePause(
    presentUserIds,
    activePlayers,
  )
  const manuallyPausedBy: Member | null = manuallyPausedById
    ? players.find((m) => m.user_id === manuallyPausedById) ??
      // The pauser can be a club member spectating (on the game page without
      // having joined as a player), so they're not in `players`. Resolve to a
      // labeled pseudo-member so the pause still TAKES EFFECT (and the overlay
      // reads "Someone paused") instead of silently no-opping — clicking Pause
      // was otherwise a dead control for a non-player. Unknown color falls
      // through to body-text in colorVarFor.
      { user_id: manuallyPausedById, username: 'Someone', color: '' }
    : null
  const paused =
    (presencePaused || manuallyPausedBy !== null)
    && commonGame?.ended_at == null

  // Timer. The additive tick clock (common.timers) — mode from
  // setup; `running` gates the per-second driver so the count only
  // advances during live, unpaused play. Pre-load (commonGame null)
  // → running=false, so the hook stays callable but idle until the
  // game loads.
  const timer = useGameTimer({
    gameId,
    paused,
    mode: commonGame?.setup.timer ?? { kind: 'none' },
    running: commonGame != null && !commonGame.is_terminal,
  })

  // Turn-order gate. Null pointer ⇒ free-for-all (or solo, where the
  // sole player always is the pointer) ⇒ everyone may act. Otherwise
  // only the named player may. Derived here (the hook already has the
  // session) so every game page gets it without new plumbing.
  const isMyTurn =
    commonGame?.current_turn_user_id == null ||
    commonGame.current_turn_user_id === session.user.id

  return {
    commonGame,
    players,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    sendSuspend,
    timer,
    isMyTurn,
    loading,
  }
}
