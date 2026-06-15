import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db as commonDb } from '../../common/db'
import { computeFreeze } from '../../common/hooks/useGameFreeze'
import type { SetupMember } from '../../common/lib/games'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Board, GroupLevel } from '../lib/board'

// Narrower than Database[...]['Row']. The board jsonb column is
// read once on load and stays put — only mutable fields (status,
// mistakes) appear on the realtime update payloads we care about.
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  'id' | 'club_id' | 'status' | 'mistakes' | 'board' | 'created_at'
>

export type GuessRow = {
  id: string
  user_id: string
  tiles: string[]
  result: 'correct' | 'oneAway' | 'wrong'
  matched_level: number | null
  guessed_at: string
}

export type FoundGroupRow = {
  level: GroupLevel
  group_name: string
  members: string[]
  found_at: string
}

export type WordknitGame = {
  id: string
  club_id: string
  status: 'in_progress' | 'solved' | 'lost'
  mistakes: number
  board: Board
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
 *   - game / guesses / foundGroups / members — postgres-derived
 *     state, refetched on every realtime row event
 *   - selections / unionTiles — shared peer-selection state
 *     driven by Broadcast events
 *   - toggleTile / sendClear — emit selection events
 *   - frozen / missing — derived from Presence
 *   - loading — false once initial fetch completes
 *
 * See docs/wordknit.md → "Realtime: three subscriptions on one
 * channel" for the architectural picture.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: WordknitGame | null
  guesses: GuessRow[]
  foundGroups: FoundGroupRow[]
  members: Member[]
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  frozen: boolean
  missing: Member[]
  loading: boolean
} {
  const [game, setGame] = useState<WordknitGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [foundGroups, setFoundGroups] = useState<FoundGroupRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selections, setSelections] = useState<Map<string, string[]>>(
    () => new Map(),
  )
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
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
      const [gameRes, guessesRes, foundRes] = await Promise.all([
        db
          .from('games')
          .select('id, club_id, status, mistakes, board, created_at')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('guesses')
          .select('id, user_id, tiles, result, matched_level, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
        db
          .from('found_groups')
          .select('level, group_name, members, found_at')
          .eq('game_id', gameId)
          .order('found_at', { ascending: true }),
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
        mistakes: row.mistakes,
        board: row.board as Board,
      })
      setGuesses(
        (guessesRes.data ?? []).map((g) => ({
          ...g,
          result: g.result as GuessRow['result'],
        })),
      )
      setFoundGroups(
        (foundRes.data ?? []).map((f) => ({
          ...f,
          level: f.level as GroupLevel,
        })),
      )

      // Roster: same cross-schema PostgREST workaround the other
      // games use — two queries, merge in JS.
      const { data: memberRows } = await commonDb
        .from('club_members')
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
    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'wordknit',
        table: 'found_groups',
        filter: `game_id=eq.${gameId}`,
      },
      load,
    )

    // Broadcast: shared selection events. Idempotent apply handles
    // echoes of our own sends.
    ch.on('broadcast', { event: 'selection' }, ({ payload }) =>
      applySelection(payload as SelectionEvent),
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
  }, [applySelection, gameId, session.user.id])

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

  // Flat union for submit + display.
  const unionTiles: string[] = []
  for (const list of selections.values()) {
    for (const t of list) {
      if (!unionTiles.includes(t)) unionTiles.push(t)
    }
  }

  const { frozen, missing } = computeFreeze(presentUserIds, members)

  return {
    game,
    guesses,
    foundGroups,
    members,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    frozen,
    missing,
    loading,
  }
}
