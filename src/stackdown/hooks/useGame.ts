import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Tile } from '../lib/board'

/** One row from `stackdown.players` — the public per-player tally
 *  (found_count is visible to everyone so the compete OpponentStrip can
 *  show "Joel 2, Moth 1"; solved marks a compete winner). */
export type PlayerRow = {
  user_id: string
  found_count: number
  solved: boolean
  solved_at: string | null
}

/** One row from `stackdown.submissions` — the durable word log, valid
 *  AND invalid. Coop RLS shows everyone's; compete RLS shows only the
 *  caller's (until the game is terminal). The right-column log and the
 *  removed-tile set both derive from this. */
export type SubmissionRow = {
  user_id: string
  seq: number
  word: string
  tile_ids: number[]
  valid: boolean
  submitted_at: string
}

export type StackdownGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  tiles: Tile[]
  /** Server-stamped game-start timestamp, ISO. */
  created_at: string
  /** The six solution words, in clearing order — NULL until the game is
   *  terminal (the games_state view gates it). Shown in the game-over
   *  panel as the reveal. */
  solution: string[] | null
}

// games_state, not the base games table: the view gates `solution`
// behind is_terminal, so the FE can read one shape and only ever see the
// answer once the game is over.
type StateRow = Pick<
  Database['stackdown']['Tables']['games']['Row'],
  'id' | 'club_handle' | 'mode' | 'tiles' | 'created_at'
> & { solution: string[] | null }

/**
 * The in-progress word's mutations, carried over the stackdown-specific
 * realtime channel. In coop these broadcast so every seat sees the same
 * collaborative word being built; in compete the senders short-circuit
 * (each player's word is private) and the events stay local.
 *
 *   - append  — a tile was picked up onto the end of the word.
 *   - retract — a tile in the word was clicked, returning it AND every
 *     tile after it to the board (slice to `index`).
 *   - clear   — the word was emptied, tiles RETURNED to the board (an
 *     invalid submit, or an abandoned word).
 *   - commit  — an ACCEPTED word: the word is emptied but its tiles
 *     STAY off the board. Carries the tile ids so every peer can hold
 *     them removed optimistically (their own `pendingRemoved`) until the
 *     valid submission arrives via realtime — without this a peer would
 *     briefly flash the tiles back onto the grid between the `clear` and
 *     the refetch. `clear` and `commit` look identical on the wire
 *     otherwise, so they must be distinct events.
 */
type WordEvent =
  | { type: 'append'; tileId: number }
  | { type: 'retract'; index: number }
  | { type: 'clear' }
  | { type: 'commit'; tileIds: number[] }

/**
 * StackDown's per-gametype data hook — the broadcast-coupled realtime
 * pattern (docs/code-conventions.md → "Realtime data hooks"), the same
 * shape wordknit uses: one stable-name channel carrying both
 * postgres-changes (games / players / submissions) and the shared
 * in-progress-word Broadcast (coop only).
 *
 * The board the player sees is the static `game.tiles` minus the tiles
 * that have left it. Tiles leave in two ways:
 *   - permanently, once they spell an accepted word — these live in
 *     `removedTileIds`, derived from the valid submissions (plus a brief
 *     optimistic hold so an accepted word doesn't flash back on-board
 *     during the realtime round-trip).
 *   - transiently, while they sit in the word being built — that's
 *     `currentWord`. Both sets are "off the board" for exposure, so the
 *     consumer subtracts `removedTileIds ∪ currentWord` before calling
 *     `exposedIds`.
 *
 * The submit itself lives in the PlayArea (it owns feedback + the RPC);
 * this hook owns the selection state and its broadcast. `appendTile`
 * returns the resulting word so the caller can fire the submit when it
 * reaches five letters — and only the originating client submits
 * (remote peers merely apply the broadcast), so a coop word isn't
 * double-submitted.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: StackdownGame | null
  players: PlayerRow[]
  submissions: SubmissionRow[]
  removedTileIds: Set<number>
  currentWord: number[]
  appendTile: (tileId: number) => number[] | null
  retractTo: (index: number) => void
  clearWord: () => void
  commitWord: (tileIds: number[]) => void
  loading: boolean
} {
  const [game, setGame] = useState<StackdownGame | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [currentWord, setCurrentWord] = useState<number[]>([])
  // Optimistic removed tiles: an accepted word's tiles are held here
  // from the instant the server says "accepted" until the matching
  // valid submission arrives via realtime — so the tiles don't blink
  // back onto the board during the round-trip. Pruned in `load()`.
  const [pendingRemoved, setPendingRemoved] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<
    ReturnType<typeof supabase.channel> | null
  >(null)

  // Apply a word event to local state. Idempotent so the echo of our own
  // broadcast (and any reorder) is harmless: append skips a tile already
  // in the word, retract/clear are slice/empty, commit's pendingRemoved
  // is deduped into a Set downstream (all stable under replay).
  const applyWordEvent = useCallback((event: WordEvent) => {
    if (event.type === 'commit') {
      // Accepted word: hold its tiles removed optimistically (same as the
      // submitter does) AND empty the word. The realtime refetch later
      // prunes pendingRemoved once the valid submission confirms them.
      setPendingRemoved((prev) => [...prev, ...event.tileIds])
      setCurrentWord((prev) => (prev.length === 0 ? prev : []))
      return
    }
    setCurrentWord((prev) => {
      if (event.type === 'clear') return prev.length === 0 ? prev : []
      if (event.type === 'retract') {
        return event.index >= prev.length ? prev : prev.slice(0, event.index)
      }
      // append
      if (prev.includes(event.tileId) || prev.length >= 5) return prev
      return [...prev, event.tileId]
    })
  }, [])

  // Join this game's stackdown room: load games_state + players +
  // submissions, attach postgres-changes on all three, and (coop)
  // carry the shared-word Broadcast. Compete senders short-circuit in
  // the mutators below, so foreign events shouldn't arrive in compete;
  // the handler registers unconditionally because the channel is built
  // before mode is known.
  useEffect(function joinStackdownRoom() {
    let mounted = true

    async function load() {
      const [gameRes, playersRes, subsRes] = await Promise.all([
        db
          .from('games_state')
          .select('id, club_handle, mode, tiles, created_at, solution')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('players')
          .select('user_id, found_count, solved, solved_at')
          .eq('game_id', gameId),
        db
          .from('submissions')
          .select('user_id, seq, word, tile_ids, valid, submitted_at')
          .eq('game_id', gameId)
          .order('submitted_at', { ascending: true }),
      ])
      if (!mounted) return
      if (!gameRes.data) {
        setGame(null)
        setLoading(false)
        return
      }
      const row = gameRes.data as StateRow
      setGame({
        id: row.id,
        club_handle: row.club_handle,
        mode: row.mode as 'coop' | 'compete',
        tiles: row.tiles as unknown as Tile[],
        created_at: row.created_at,
        solution: row.solution,
      })
      setPlayers(playersRes.data ?? [])
      const subs = (subsRes.data ?? []) as SubmissionRow[]
      setSubmissions(subs)
      // Prune optimistic holds the server has now confirmed: any tile
      // that shows up in a valid submission is durably removed, so it no
      // longer needs the local hold.
      const confirmed = new Set<number>()
      for (const s of subs) if (s.valid) for (const id of s.tile_ids) confirmed.add(id)
      setPendingRemoved((prev) => prev.filter((id) => !confirmed.has(id)))

      setLoading(false)
    }

    // Stable channel name — the coop shared-word Broadcast needs every
    // peer in the same room, so no UUID suffix. StrictMode's double
    // mount is handled by removeChannel in cleanup.
    const ch = supabase.channel(`stackdown:${gameId}`)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'stackdown', table: 'games', filter: `id=eq.${gameId}` },
      load,
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'stackdown', table: 'players', filter: `game_id=eq.${gameId}` },
      load,
    )
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'stackdown', table: 'submissions', filter: `game_id=eq.${gameId}` },
      load,
    )
    ch.on('broadcast', { event: 'word' }, ({ payload }) =>
      applyWordEvent(payload as WordEvent),
    )
    // SUBSCRIBED fires on initial subscribe AND every reconnect, so this
    // covers both the mount-time fetch and the missed-events refetch.
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
  }, [applyWordEvent, gameId, session.user.id])

  // Send a word event + apply locally (optimistic). Compete keeps the
  // word private — apply locally only, no broadcast — mirroring
  // wordknit's per-player selection short-circuit.
  const broadcast = useCallback(
    (event: WordEvent) => {
      applyWordEvent(event)
      if (!channel || game?.mode === 'compete') return
      channel.send({ type: 'broadcast', event: 'word', payload: event })
    },
    [applyWordEvent, channel, game?.mode],
  )

  // Local tile click: pick the tile up onto the end of the word. Returns
  // the resulting word so the PlayArea can submit when it hits five (and
  // ONLY the originating client does — remote peers just see the
  // broadcast). Returns null when the word is already full or the tile's
  // already in it (the click is a no-op).
  const appendTile = useCallback(
    (tileId: number): number[] | null => {
      if (currentWord.length >= 5 || currentWord.includes(tileId)) return null
      broadcast({ type: 'append', tileId })
      return [...currentWord, tileId]
    },
    [broadcast, currentWord],
  )

  // Local click on a tile already in the word: return it AND every tile
  // after it to the board (the word is an order, so you can't pull one
  // from the middle without invalidating the rest).
  const retractTo = useCallback(
    (index: number) => broadcast({ type: 'retract', index }),
    [broadcast],
  )

  const clearWord = useCallback(() => broadcast({ type: 'clear' }), [broadcast])

  // Commit an ACCEPTED word: empty it and hold its tiles removed
  // optimistically — locally AND on every coop peer (via the broadcast),
  // so nobody's grid flashes the tiles back on between the word clearing
  // and the valid submission arriving via realtime. The hold is pruned in
  // load() once the submission confirms it.
  const commitWord = useCallback(
    (tileIds: number[]) => broadcast({ type: 'commit', tileIds }),
    [broadcast],
  )

  // The durably-removed set: tiles of every valid submission visible to
  // this caller (coop = all, compete = own via RLS) plus the optimistic
  // holds not yet confirmed.
  const removedTileIds = new Set<number>(pendingRemoved)
  for (const s of submissions) {
    if (s.valid) for (const id of s.tile_ids) removedTileIds.add(id)
  }

  return {
    game,
    players,
    submissions,
    removedTileIds,
    currentWord,
    appendTile,
    retractTo,
    clearWord,
    commitWord,
    loading,
  }
}
