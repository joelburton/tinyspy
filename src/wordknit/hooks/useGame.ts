import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db as commonDb } from '../../common/db'
import { computePause } from '../../common/lib/pause'
import type { SetupMember } from '../../common/lib/games'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Board, CategoryRank } from '../lib/board'
import type { WordknitSetup } from '../lib/setup'

// Narrower than Database[...]['Row']. The board jsonb column is
// read once on load and stays put — only mutable fields (status,
// mistake_count) appear on the realtime update payloads we care
// about.
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  | 'id'
  | 'club_id'
  | 'status'
  | 'mistake_count'
  | 'board'
  | 'setup'
  | 'created_at'
>

export type GuessRow = {
  id: string
  user_id: string
  tiles: string[]
  result: 'correct' | 'oneAway' | 'wrong'
  matched_category_rank: number | null
  guessed_at: string
}

/**
 * One matched category, derived from a `result='correct'` guess
 * row joined with the static board.categories. There's no longer
 * a separate found_groups table — the partial unique index on
 * `guesses (game_id, matched_category_rank) where
 * result='correct'` enforces "one match per rank per game" at
 * the DB layer, and we project here.
 */
export type MatchedCategory = {
  rank: CategoryRank
  name: string
  tiles: string[]
  matched_at: string
}

export type WordknitGame = {
  id: string
  club_id: string
  status: 'in_progress' | 'solved' | 'lost'
  mistake_count: number
  board: Board
  /** The frozen-at-create-time player choices: timer mode +
   *  (future) puzzle date etc. Read by BoardScreen to drive
   *  useGameTimer; server-side validated in create_game. */
  setup: WordknitSetup
  /** Server-stamped game-start timestamp, ISO. Used as the
   *  anchor for the browser-side countdown timer. */
  created_at: string
}

export type Member = SetupMember

/**
 * Broadcast event shape carried over the realtime channel for
 * shared-selection mutations.
 */
type SelectionEvent =
  | { type: 'select'; tile: string; userId: string }
  | { type: 'deselect'; tile: string }
  | { type: 'clear' }

/**
 * Broadcast event shape for the manual-pause feature. The pauser's
 * user_id rides along so peers can render the "Bea paused the
 * game" overlay copy; the receiver looks up the member by id
 * (no need to ship usernames over the wire).
 *
 * Any-player-resume: there's no privileged "original pauser"
 * check. Any connected player can fire `manualUnpause`.
 */
type ManualPauseEvent =
  | { type: 'manualPause'; userId: string }
  | { type: 'manualUnpause' }

export type SelectionMap = ReadonlyMap<string, string[]>

/**
 * The one realtime entry point for a wordknit game.
 *
 * Why everything lives in one hook: supabase-js requires every
 * `.on('postgres_changes' | 'broadcast' | 'presence', ...)` to
 * be registered BEFORE `.subscribe()`. If we split the channel
 * across multiple hooks, the consumers' effects run later than
 * the owner's — listeners arrive post-subscribe and supabase-js
 * errors out. The pragmatic shape is: one hook owns the channel
 * end-to-end, attaches every handler synchronously in a single
 * effect, then subscribes.
 *
 * Returns:
 *   - game / guesses / matchedCategories / members — postgres-
 *     derived state, refetched on every realtime row event.
 *     matchedCategories is a projection of `guesses` filtered
 *     to result='correct', joined with board.categories.
 *   - selections / unionTiles — shared peer-selection state
 *     driven by Broadcast events
 *   - toggleTile / sendClear — emit selection events
 *   - paused / missing — union of presence-pause + manual-pause;
 *     missing is the presence-side detail (for the overlay copy)
 *   - manuallyPausedBy — the member who clicked Pause (null if
 *     the pause is presence-only); also for overlay copy
 *   - sendManualPause / sendManualUnpause — broadcast handlers
 *     for the Pause / Resume buttons
 *   - loading — false once initial fetch completes
 *
 * See docs/wordknit.md → "Realtime: two subscriptions on one
 * channel" for the architectural picture.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: WordknitGame | null
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  members: Member[]
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  paused: boolean
  missing: Member[]
  manuallyPausedBy: Member | null
  sendManualPause: () => void
  sendManualUnpause: () => void
  loading: boolean
} {
  const [game, setGame] = useState<WordknitGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selections, setSelections] = useState<Map<string, string[]>>(
    () => new Map(),
  )
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
  )
  // user_id of whoever clicked the most recent un-resolved manual
  // pause. null when no manual pause is in effect. The receiver
  // looks up the member by id rather than shipping a full member
  // object over Broadcast — usernames are stable and locally known.
  const [manuallyPausedById, setManuallyPausedById] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(true)

  // The channel handle for sending broadcasts. Held in state so a
  // new effect run (StrictMode double-mount, gameId change) gets a
  // fresh channel and re-renders the BoardScreen. The
  // setChannel-in-effect below is intentional even though the
  // react-hooks rule discourages it: here the external system
  // (the realtime channel) IS what we're syncing into React, and
  // there's no alternative shape that lets us tear down old
  // channels on cleanup without going through state.
  const [channel, setChannel] = useState<
    ReturnType<typeof supabase.channel> | null
  >(null)

  // Apply an incoming manual-pause event. Setter-based so idempotent
  // with echoes of our own sends — re-applying the same state is a
  // no-op via React's referential-equality check on setState.
  const applyManualPause = useCallback((event: ManualPauseEvent) => {
    if (event.type === 'manualPause') {
      setManuallyPausedById(event.userId)
    } else {
      setManuallyPausedById(null)
    }
  }, [])

  // Apply an incoming selection event to local state. Idempotent —
  // adding an already-present tile is a no-op, deselecting an
  // absent tile is a no-op — so echoes of our own broadcasts are
  // safe.
  const applySelection = useCallback((event: SelectionEvent) => {
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
      // event.type === 'deselect' — remove from whoever has it
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

  // Single effect: load data, create channel, attach all
  // listeners, subscribe. Re-runs on gameId change (a different
  // game) or session.user.id change (a different user — rare in
  // practice but defensive).
  useEffect(() => {
    let mounted = true

    async function load() {
      const [gameRes, guessesRes] = await Promise.all([
        db
          .from('games')
          .select(
            'id, club_id, status, mistake_count, board, setup, created_at',
          )
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('guesses')
          .select(
            'id, user_id, tiles, result, matched_category_rank, guessed_at',
          )
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
      ])
      if (!mounted) return
      if (!gameRes.data) {
        setGame(null)
        setLoading(false)
        return
      }
      const row = gameRes.data as GameRow
      setGame({
        id: row.id,
        club_id: row.club_id,
        status: row.status as WordknitGame['status'],
        mistake_count: row.mistake_count,
        board: row.board as Board,
        setup: row.setup as WordknitSetup,
        created_at: row.created_at,
      })
      setGuesses(
        (guessesRes.data ?? []).map((g) => ({
          ...g,
          result: g.result as GuessRow['result'],
        })),
      )

      // Roster: same cross-schema PostgREST workaround the other
      // games use — two queries, merge in JS.
      const { data: memberRows } = await commonDb
        .from('clubs_members')
        .select('user_id')
        .eq('club_id', row.club_id)
      if (!mounted) return
      const ids = (memberRows ?? []).map((r) => r.user_id)
      if (ids.length > 0) {
        const { data: profiles } = await commonDb
          .from('profiles')
          .select('user_id, username')
          .in('user_id', ids)
        if (!mounted) return
        setMembers((profiles ?? []) as Member[])
      } else {
        setMembers([])
      }

      setLoading(false)
    }

    // Create the channel, attach every listener, then subscribe.
    // All `.on()` calls must precede `.subscribe()` — supabase-js
    // rejects late attachments.
    //
    // ┌─ Channel-name pattern, wordknit-specific ──────────────┐
    // │ Tinyspy / psychic-num use a per-effect-run UUID suffix │
    // │ to sidestep supabase-js's per-client channel cache     │
    // │ (StrictMode double-mount workaround). Wordknit can't:  │
    // │ broadcast + presence need every connected player on    │
    // │ the SAME Realtime "room," which is just the channel    │
    // │ name. A UUID per tab puts each player in their own     │
    // │ room and no peer events propagate.                     │
    // │                                                        │
    // │ The cleanup-then-recreate cycle in this effect handles │
    // │ StrictMode's double-mount: removeChannel(ch) clears    │
    // │ the cache before the second effect run. See            │
    // │ docs/code-conventions.md → "Realtime channel names."   │
    // └────────────────────────────────────────────────────────┘
    const ch = supabase.channel(`wordknit:${gameId}`)

    // Postgres Changes: refetch on every row event for this game.
    // Just two tables now — guesses carries every state change
    // the FE needs to see (mistake_count + status flips via
    // games, matched categories via the result='correct' rows
    // on guesses).
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'wordknit', table: 'games', filter: `id=eq.${gameId}` },
      load,
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'wordknit', table: 'guesses', filter: `game_id=eq.${gameId}` },
      load,
    )

    // Broadcast: shared selection events. Idempotent apply handles
    // echoes of our own sends.
    ch.on('broadcast', { event: 'selection' }, ({ payload }) =>
      applySelection(payload as SelectionEvent),
    )

    // Broadcast: manual-pause events (Pause / Resume button clicks).
    // Same idempotent-apply pattern.
    ch.on('broadcast', { event: 'manualPause' }, ({ payload }) =>
      applyManualPause(payload as ManualPauseEvent),
    )

    // Presence: derive `presentUserIds` from the merged state.
    // Several tabs of the same user are fine — we dedupe to
    // user_ids.
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

    // Subscribe. On SUBSCRIBED we refetch (recover from any
    // missed events) and track our own presence.
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
  }, [applyManualPause, applySelection, gameId, session.user.id])

  // Re-broadcast active manual-pause whenever the set of connected
  // peers changes, so a peer joining mid-pause (or reconnecting
  // after the original pauser closed their tab) lands in the same
  // paused state instead of seeing a phantom-resumed board.
  //
  // The "joining" detection is implicit: presentUserIds-change
  // triggers this effect. We rebroadcast on every change rather
  // than diffing the set — broadcasts are cheap, the receiver is
  // idempotent, and the alternative (track "who was here last
  // time" in a ref) is more code for no real benefit.
  //
  // If no manual pause is in effect, this is a no-op. If one is in
  // effect, every connected client re-broadcasts on every presence
  // change — including the original pauser's broadcast — which is
  // fine because applyManualPause is idempotent.
  useEffect(() => {
    if (!channel || manuallyPausedById === null) return
    channel.send({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: manuallyPausedById },
    })
  }, [channel, manuallyPausedById, presentUserIds])

  // Send a broadcast event + apply locally (optimistic). The
  // local apply ensures the clicker sees the change immediately;
  // the echo-back of the broadcast is a no-op due to idempotency
  // inside applySelection.
  const broadcast = useCallback(
    (event: SelectionEvent) => {
      if (!channel) return
      applySelection(event)
      channel.send({ type: 'broadcast', event: 'selection', payload: event })
    },
    [applySelection, channel],
  )

  // Toggle handler — see docs/wordknit.md → "Peer selection".
  const toggleTile = useCallback(
    (tile: string) => {
      // Is the tile already in some player's selection? Any click
      // on it removes from the union.
      let alreadySelected = false
      for (const list of selections.values()) {
        if (list.includes(tile)) {
          alreadySelected = true
          break
        }
      }
      if (alreadySelected) {
        broadcast({ type: 'deselect', tile })
        return
      }
      let unionSize = 0
      for (const list of selections.values()) unionSize += list.length
      if (unionSize >= 4) return
      broadcast({ type: 'select', tile, userId: session.user.id })
    },
    [broadcast, selections, session.user.id],
  )

  const sendClear = useCallback(() => {
    broadcast({ type: 'clear' })
  }, [broadcast])

  // Manual-pause broadcasters. Optimistic local apply + broadcast
  // (same shape as the selection broadcaster); receivers — including
  // ourselves on the echo — apply idempotently.
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

  // Flat union for submit + display.
  const unionTiles: string[] = []
  for (const list of selections.values()) {
    for (const t of list) {
      if (!unionTiles.includes(t)) unionTiles.push(t)
    }
  }

  // Presence-pause + manual-pause unify into a single `paused`
  // flag for consumers. The two sources can coexist (presence-
  // missing AND someone manually paused); the union truthy-ness
  // is what the BoardScreen + PauseBoundary care about.
  const { paused: presencePaused, missing } = computePause(
    presentUserIds,
    members,
  )
  const manuallyPausedBy = manuallyPausedById
    ? members.find((m) => m.user_id === manuallyPausedById) ?? null
    : null
  const paused = presencePaused || manuallyPausedBy !== null

  // Project matched categories from the guess log + static board.
  // The DB enforces at-most-one correct-per-rank-per-game via the
  // partial unique index, so we can index categories[] by rank
  // without worrying about duplicates surfacing here.
  const matchedCategories: MatchedCategory[] = []
  if (game) {
    const categoryByRank = new Map<number, Board['categories'][number]>()
    for (const c of game.board.categories) categoryByRank.set(c.rank, c)
    for (const g of guesses) {
      if (g.result !== 'correct') continue
      if (g.matched_category_rank == null) continue
      const cat = categoryByRank.get(g.matched_category_rank)
      if (!cat) continue
      matchedCategories.push({
        rank: cat.rank,
        name: cat.name,
        tiles: cat.tiles,
        matched_at: g.guessed_at,
      })
    }
  }

  return {
    game,
    guesses,
    matchedCategories,
    members,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    paused,
    missing,
    manuallyPausedBy,
    sendManualPause,
    sendManualUnpause,
    loading,
  }
}
