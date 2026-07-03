import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Member } from '../../common/lib/games'
import type { Board, CategoryRank } from '../lib/board'

/**
 * One player in a connections game. Today connections doesn't add any
 * per-player game state beyond what's on a Member (no seats, no
 * personal scores), so the Player type is a straight re-export.
 *
 * Why we expose it anyway: cross-game vocabulary consistency.
 * Every game's hook file exposes a Player type — codenamesduet's adds
 * `seat: 'A' | 'B'`; psychicnum's is a re-export like this.
 * A reader scanning per-game folders sees the same parallel
 * everywhere, and a future "per-player tile-rate" stat (or
 * similar) has a named home to land in without a cascade rename.
 */
export type Player = Member

// Narrower than Database[...]['Row']. The board jsonb column is
// read once on load and stays put; mode + created_at are also
// immutable. Mutable per-player state (mistake_count) lives on
// the players table, not here. play_state lives on common.games
// and arrives via ctx.
type GameRow = Pick<
  Database['connections']['Tables']['games']['Row'],
  'id' | 'club_handle' | 'mode' | 'board' | 'created_at' | 'puzzle_date'
>

export type GuessRow = {
  id: string
  user_id: string
  tiles: string[]
  result: 'correct' | 'oneAway' | 'wrong'
  matched_category_rank: number | null
  guessed_at: string
}

/** One row from `connections.players` — per-player mistake counter
 *  (lock-step across all rows in coop, independent in compete). */
export type PlayerRow = {
  user_id: string
  mistake_count: number
  /** The player's own categories-found count (public; drives the compete
   *  "Found" opponent strip). See connections.players.matched_count. */
  matched_count: number
}

/**
 * One matched category, derived from a `result='correct'` guess
 * row joined with the static board.categories. In coop the partial
 * unique index on `(game_id, matched_category_rank) where
 * result='correct' and mode='coop'` enforces one match per rank
 * per game; in compete the index extends to include user_id so
 * each player can independently solve every category. The FE
 * just projects whatever it can see.
 */
export type MatchedCategory = {
  rank: CategoryRank
  name: string
  tiles: string[]
  matched_at: string
}

export type ConnectionsGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  board: Board
  /** The puzzle's NYT date (`YYYY-MM-DD`), or null for a non-NYT puzzle. The
   *  most identifying setup choice — *which* daily puzzle this game is. */
  puzzleDate: string | null
  /** Server-stamped game-start timestamp, ISO. Mirrored from the
   *  per-gametype row (which carries its own created_at). */
  created_at: string
}

/**
 * Broadcast event shape carried over the connections-specific
 * realtime channel for shared-selection mutations.
 */
type SelectionEvent =
  | { type: 'select'; tile: string; userId: string }
  | { type: 'deselect'; tile: string }
  | { type: 'clear' }

export type SelectionMap = ReadonlyMap<string, string[]>

/**
 * connections's per-gametype data hook.
 *
 * Follows the **broadcast-coupled** realtime pattern documented in
 * `docs/code-conventions.md` → "Realtime data hooks" — broadcast
 * needs a stable-name channel so peers merge into the same room,
 * and postgres-changes ride along on that same channel rather
 * than opening a second UUID-suffixed one via `useRealtimeRefetch`.
 *
 * Two responsibilities split across two channels (one per hook):
 *   1. **This hook** owns the gametype-specific channel. It
 *      subscribes to postgres-changes on `connections.{games,
 *      guesses, players}` AND (coop only) carries the shared-
 *      selection Broadcast events. Compete keeps selections local
 *      — each player's tile picks are private to them, so the
 *      Broadcast send is suppressed.
 *   2. **useCommonGame** (mounted by `<GamePage>`) owns the
 *      common-side channel — presence, manual-pause Broadcast,
 *      common.games row changes, the timer.
 *
 * Mode-aware projections (compete only meaningful in compete mode;
 * coop falls back to lock-step shared values):
 *   - `mistakeCount` — caller's row's mistake_count. In coop,
 *     equals every other row's; in compete, the caller's own.
 *   - `opponentFound` — Map<user_id, categories-found> excluding
 *     caller. Drives the compete "Found" OpponentStrip; empty in coop.
 *   - `isEliminated` — caller's mistake_count >= 4. Compete-only
 *     meaningful (in coop the whole game would already be terminal
 *     once mistakes hit 4); always false in coop pre-game-over.
 *
 * Returns:
 *   - game / guesses / matchedCategories — postgres-derived state.
 *   - mistakeCount / opponentFound / isEliminated — see above.
 *   - selections / unionTiles — shared peer-selection state
 *     (coop only; compete's map only ever contains caller's own).
 *   - toggleTile / sendClear — emit selection events.
 *   - loading — false once initial fetch completes.
 *
 * Pause/timer/members/presence are NOT here — see useCommonGame.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: ConnectionsGame | null
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  mistakeCount: number
  opponentFound: ReadonlyMap<string, number>
  isEliminated: boolean
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  loading: boolean
} {
  const [game, setGame] = useState<ConnectionsGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
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

  // Join this game's connections-specific Realtime room: load the
  // game row + guesses + players, attach postgres-changes on
  // connections.{games, guesses, players}, attach the shared-selection
  // Broadcast handler (coop semantics — compete senders short-
  // circuit in `broadcast()` below, so foreign events shouldn't
  // arrive in compete; the handler is registered unconditionally
  // because the channel is built before mode is known).
  useEffect(function joinConnectionsRoom() {
    let mounted = true

    async function load() {
      const [gameRes, guessesRes, playersRes] = await Promise.all([
        db
          .from('games')
          .select('id, club_handle, mode, board, created_at, puzzle_date')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('guesses')
          .select(
            'id, user_id, tiles, result, matched_category_rank, guessed_at',
          )
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
        db
          .from('players')
          .select('user_id, mistake_count, matched_count')
          .eq('game_id', gameId),
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
        club_handle: row.club_handle,
        mode: row.mode as 'coop' | 'compete',
        board: row.board as Board,
        puzzleDate: row.puzzle_date,
        created_at: row.created_at,
      })
      setGuesses(
        (guessesRes.data ?? []).map((g) => ({
          ...g,
          result: g.result as GuessRow['result'],
        })),
      )
      setPlayers(playersRes.data ?? [])

      setLoading(false)
    }

    // Stable channel name — selection Broadcast (coop) needs a
    // shared room across peers, so a UUID-suffix would defeat the
    // purpose. StrictMode's double-mount is handled by the
    // removeChannel(ch) in the effect cleanup. See useGame for
    // codenamesduet/psychicnum's UUID-suffixed approach when broadcast
    // isn't in play.
    const ch = supabase.channel(`connections:${gameId}`)

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'connections', table: 'games', filter: `id=eq.${gameId}` },
      load,
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'connections', table: 'guesses', filter: `game_id=eq.${gameId}` },
      load,
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'connections', table: 'players', filter: `game_id=eq.${gameId}` },
      load,
    )
    ch.on('broadcast', { event: 'selection' }, ({ payload }) =>
      applySelection(payload as SelectionEvent),
    )

    // SUBSCRIBED fires on initial subscribe AND on every reconnect,
    // so this single hook covers both the mount-time fetch and the
    // missed-events-on-reconnect refetch.
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
  }, [applySelection, gameId])

  // Send a broadcast event + apply locally (optimistic). The local
  // apply ensures the clicker sees the change immediately; the
  // echo-back of the broadcast is a no-op due to idempotency
  // inside applySelection.
  //
  // **Compete short-circuit**: each player's selection is private,
  // so we skip the `channel.send` and only apply locally. Peers
  // in compete also short-circuit, so no foreign events should
  // arrive — the `applySelection` map stays caller-only and the
  // Board renders every tile as "mine" (no peer attribution).
  const broadcast = useCallback(
    (event: SelectionEvent) => {
      if (!channel) return
      applySelection(event)
      if (game?.mode === 'compete') return
      channel.send({ type: 'broadcast', event: 'selection', payload: event })
    },
    [applySelection, channel, game?.mode],
  )

  // Toggle handler — see docs/games/connections.md → "Peer selection".
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
  // RLS in compete hides peers' guesses server-side, so a compete
  // caller's projection naturally yields only their own matches.
  // Coop sees every player's matches (one row per rank because of
  // the partial unique index).
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

  // Caller's mistake_count (defaults to 0 if the players row
  // hasn't arrived yet — pre-load state). In coop every row has
  // the same value; in compete this is the caller's own.
  const selfPlayer = players.find((p) => p.user_id === session.user.id)
  const mistakeCount = selfPlayer?.mistake_count ?? 0

  // Opponents' categories-found counts (public via players.matched_count) —
  // drives the compete "Found" opponent strip. Empty Map in coop (the caller's
  // own found is matchedCategories.length; a coop opponent comparison is noise).
  const opponentFound = new Map<string, number>()
  if (game?.mode === 'compete') {
    for (const p of players) {
      if (p.user_id === session.user.id) continue
      opponentFound.set(p.user_id, p.matched_count)
    }
  }

  // Eliminated in compete: caller's 4-mistake limit reached.
  // (Coop hits this threshold only on the game-ending guess, so
  // the play_state guard upstream catches it — keeping this
  // false in coop until terminal lines up with how PlayArea
  // gates its "you're out" branch on mode === 'compete'.)
  const isEliminated = game?.mode === 'compete' && mistakeCount >= 4

  return {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentFound,
    isEliminated,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
  }
}
