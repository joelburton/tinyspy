import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Member } from '../../common/lib/games'
import type { Board, CategoryRank } from '../lib/board'

/**
 * One player in a wordknit game. Today wordknit doesn't add any
 * per-player game state beyond what's on a Member (no seats, no
 * personal scores), so the Player type is a straight re-export.
 *
 * Why we expose it anyway: cross-game vocabulary consistency.
 * Every game's hook file exposes a Player type — tinyspy's adds
 * `seat: 'A' | 'B'`; psychic-num's is a re-export like this.
 * A reader scanning per-game folders sees the same parallel
 * everywhere, and a future "per-player tile-rate" stat (or
 * similar) has a named home to land in without a cascade rename.
 */
export type Player = Member

// Narrower than Database[...]['Row']. The board jsonb column is
// read once on load and stays put — only mutable fields
// (mistake_count) appear on the realtime update payloads we care
// about. play_state lives on common.games and arrives via ctx.
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  | 'id'
  | 'club_id'
  | 'mistake_count'
  | 'board'
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
 * row joined with the static board.categories. The partial unique
 * index on `guesses (game_id, matched_category_rank) where
 * result='correct'` enforces "one match per rank per game" at
 * the DB layer; we project that record here.
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
  mistake_count: number
  board: Board
  /** Server-stamped game-start timestamp, ISO. Mirrored from the
   *  per-gametype row (which carries its own created_at). */
  created_at: string
}

/**
 * Broadcast event shape carried over the wordknit-specific
 * realtime channel for shared-selection mutations.
 */
type SelectionEvent =
  | { type: 'select'; tile: string; userId: string }
  | { type: 'deselect'; tile: string }
  | { type: 'clear' }

export type SelectionMap = ReadonlyMap<string, string[]>

/**
 * Wordknit's per-gametype data hook.
 *
 * Follows the **broadcast-coupled** realtime pattern documented in
 * `docs/code-conventions.md` → "Realtime data hooks" — broadcast
 * needs a stable-name channel so peers merge into the same room,
 * and postgres-changes ride along on that same channel rather
 * than opening a second UUID-suffixed one via `useRealtimeRefetch`.
 * Same shape `useCommonGame` uses for its presence + manual-pause
 * + suspend broadcasts; the factory is for refetch-only hooks
 * (tinyspy + psychic-num data hooks). See the conventions doc for
 * the decision rule when porting a new game.
 *
 * Two responsibilities split across two channels (one per hook):
 *   1. **This hook** owns the gametype-specific channel. It
 *      subscribes to postgres-changes on `wordknit.{games,guesses}`
 *      AND carries the shared-selection Broadcast events (`select`,
 *      `deselect`, `clear`). Both peer-side concerns live on the
 *      same channel because selections need a shared room across
 *      peers — same constraint that pushes the common-side hook
 *      onto its own stable channel.
 *   2. **useCommonGame** (mounted by `<GamePage>`) owns the
 *      common-side channel — presence, manual-pause Broadcast,
 *      common.games row changes, the timer.
 *
 * Why this split: supabase-js requires every `.on()` handler to be
 * registered BEFORE `.subscribe()`. One hook per channel keeps
 * each subscriber's registration synchronous. The two hooks use
 * DIFFERENT channel names (`wordknit:${gameId}` vs `game:${gameId}`)
 * so they don't share state across the supabase-js client.
 *
 * Returns:
 *   - game / guesses / matchedCategories — postgres-derived state.
 *   - selections / unionTiles — shared peer-selection state
 *     driven by Broadcast events. "Peer" = another player in
 *     this game from my POV; see naming.md → peer.
 *   - toggleTile / sendClear — emit selection events.
 *   - loading — false once initial fetch completes.
 *
 * Pause/timer/members/presence are NOT here — see useCommonGame.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: WordknitGame | null
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  loading: boolean
} {
  const [game, setGame] = useState<WordknitGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [selections, setSelections] = useState<Map<string, string[]>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(true)
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

  // Join this game's wordknit-specific Realtime room: load the
  // game row + guesses, attach postgres-changes on
  // wordknit.{games,guesses}, attach the shared-selection
  // Broadcast handler. Stable channel name (no UUID suffix)
  // because selection broadcasts need a shared room across peers.
  useEffect(function joinWordknitRoom() {
    let mounted = true

    async function load() {
      const [gameRes, guessesRes] = await Promise.all([
        db
          .from('games')
          .select('id, club_id, mistake_count, board, created_at')
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
        mistake_count: row.mistake_count,
        board: row.board as Board,
        created_at: row.created_at,
      })
      setGuesses(
        (guessesRes.data ?? []).map((g) => ({
          ...g,
          result: g.result as GuessRow['result'],
        })),
      )

      setLoading(false)
    }

    // Stable channel name — selection Broadcast needs a shared
    // room across peers (broadcasts only reach channel-name peers,
    // so a UUID-suffix would put each tab in its own room and
    // selections would never propagate). The cleanup-then-recreate
    // cycle in this effect handles StrictMode's double-mount via
    // removeChannel(ch) before the second effect run.
    //
    // Tradeoff worth naming: this channel ALSO carries the
    // postgres_changes subscriptions for wordknit.{games,guesses}
    // below, which don't need shared-room semantics — each tab
    // could read its own changefeed. Future games that mix
    // broadcast + postgres_changes (e.g. Boggle with shared
    // selection) should consider splitting into two channels — a
    // stable one for broadcast + a UUID-suffixed one for
    // postgres_changes — to avoid the two concerns sharing
    // reconnect semantics. See docs/code-review-2026-06-16.md §4.3
    // and docs/deferred.md → Wordknit.
    const ch = supabase.channel(`wordknit:${gameId}`)

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
    ch.on('broadcast', { event: 'selection' }, ({ payload }) =>
      applySelection(payload as SelectionEvent),
    )

    // SUBSCRIBED fires on initial subscribe AND on every reconnect,
    // so this single hook covers both the mount-time fetch and the
    // missed-events-on-reconnect refetch. (No separate explicit
    // load() after .subscribe() — it would just double-fetch on
    // mount.)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') load()
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChannel(ch)

    return () => {
      mounted = false
      supabase.removeChannel(ch)
      setChannel(null)
    }
  }, [applySelection, gameId, session.user.id])

  // Send a broadcast event + apply locally (optimistic). The local
  // apply ensures the clicker sees the change immediately; the
  // echo-back of the broadcast is a no-op due to idempotency
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
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
  }
}
