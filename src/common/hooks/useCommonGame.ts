import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
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
  gametype: string
  title: string
  setup: { timer?: TimerMode } & Record<string, unknown>
  is_active: boolean
  status_summary: Record<string, unknown> | null
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
 * The one common-side realtime entry point for a game page —
 * owns the **shared room** for this game across all peers.
 *
 * What "shared room" means: presence + manual-pause Broadcast
 * need every connected player on the SAME Realtime channel name
 * (presence rosters are per-channel-name; broadcasts only reach
 * channel-name peers). This hook opens a stable-name channel
 * (`game:${gameId}`) for that purpose. Per-gametype hooks
 * (`useWordknitGame`, etc.) open their own UUID-suffixed
 * channels for postgres-changes on their game-specific tables —
 * those don't need to coordinate across peers, so a per-tab
 * channel is fine and avoids supabase-js's
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
      const [{ data: gameData }, { data: playerRows }] = await Promise.all([
        commonDb
          .from('games')
          .select(
            'id, club_id, gametype, title, setup, is_active, status_summary, started_at, ended_at',
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

      setCommonGame({
        ...gameData,
        setup: gameData.setup as CommonGame['setup'],
        status_summary:
          gameData.status_summary as CommonGame['status_summary'],
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
    // refetch on is_active flip, ended_at set, status_summary
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

    // Presence: dedupe to user_ids so multiple tabs of the same
    // user don't double-count.
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
      setPresentUserIds(ids)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        load()
        ch.track({ user_id: session.user.id })
      }
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChannel(ch)

    load()

    return () => {
      mounted = false
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

  // Presence-pause + manual-pause unify into a single `paused`
  // flag. The two sources can coexist; the union truthy-ness is
  // what consumers care about.
  const { paused: presencePaused, missing } = computePause(
    presentUserIds,
    members,
  )
  const manuallyPausedBy = manuallyPausedById
    ? members.find((m) => m.user_id === manuallyPausedById) ?? null
    : null
  const paused = presencePaused || manuallyPausedBy !== null

  // Timer. Anchored to common.games.started_at; mode from setup.
  // Pre-load (commonGame null) feeds placeholder values so the
  // hook stays callable; consumers gate the display on
  // commonGame !== null below.
  const timer = useGameTimer({
    startedAt: commonGame?.started_at ?? new Date().toISOString(),
    paused,
    mode: commonGame?.setup.timer ?? { kind: 'none' },
  })

  return {
    commonGame,
    members,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    timer,
    loading,
  }
}
