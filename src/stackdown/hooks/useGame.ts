import { useCallback, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
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
  /** 'word' = a played word; 'hint' / 'reveal' = a logged cheat request. A
   *  request carries no tiles, but DOES carry its revealed text in `word`: the
   *  hint clue ('hint') or the revealed word ('reveal'), for the log to show. */
  kind: 'word' | 'hint' | 'reveal'
  word: string | null
  tile_ids: number[] | null
  valid: boolean | null
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
 * The in-progress word's mutations — a small local reducer action set.
 * The word is **private to the player building it** in both modes:
 * selections are never broadcast, so teammates can try words
 * independently rather than taking turns on one shared word. What's
 * shared is the completed result — every submission (found word, bad
 * word, hint/word request) is a `stackdown.submissions` row that reaches
 * peers via postgres-changes (the right-column history) and, for an
 * accepted word, removes its tiles from the shared coop board.
 *
 *   - append  — a tile was picked up onto the end of the word.
 *   - retract — a tile in the word was clicked, returning it AND every
 *     tile after it to the board (slice to `index`).
 *   - clear   — the word was emptied, tiles RETURNED to the board (an
 *     invalid submit, or an abandoned word).
 *   - commit  — an ACCEPTED word: the word is emptied but its tiles
 *     STAY off the board. Carries the tile ids so they're held removed
 *     optimistically (`pendingRemoved`) until the valid submission
 *     arrives via realtime — without this the submitter's grid would
 *     briefly flash the tiles back on between the clear and the refetch.
 *     `clear` and `commit` differ only in this hold.
 */
type WordEvent =
  | { type: 'append'; tileId: number }
  | { type: 'retract'; index: number }
  | { type: 'clear' }
  | { type: 'commit'; tileIds: number[] }

/**
 * stackdown's per-gametype data hook — a postgres-changes realtime hook
 * (docs/code-conventions.md → "Realtime data hooks"): one channel
 * carrying changes to games / players / submissions, plus the player's
 * own local in-progress-word state.
 *
 * **Selections are local, not shared.** Earlier, coop broadcast the
 * in-progress word so the whole table built one word together — which
 * forced players to take turns and wait. Now each player builds their
 * own word privately; only completed submissions are shared, via the
 * `submissions` table + realtime (the history shows the word, and an
 * accepted word's tiles leave the shared coop board). Same model both
 * modes; the only coop/compete difference is RLS on `submissions`
 * (coop = everyone's, compete = own).
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
 * this hook owns the selection state. `appendTile` returns the resulting
 * word so the caller can fire the submit when it reaches five letters.
 */
export function useGame(gameId: string): {
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

  // Apply a word event to the local in-progress word. Idempotent (append
  // skips a tile already in the word, retract/clear are slice/empty,
  // commit's pendingRemoved is deduped into a Set downstream) — handy
  // since the PlayArea can re-fire on rapid clicks.
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

  // Join this game's stackdown room: load games_state + players + submissions
  // on any change to those three tables, via the shared `useRealtimeRefetch`
  // factory. No Broadcast any more — selections are local, so the only
  // cross-client traffic is the durable submission rows (which carry the shared
  // board + history).
  useRealtimeRefetch({
    tables: [
      { schema: 'stackdown', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'stackdown', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'stackdown', table: 'submissions', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'stackdown',
    id: gameId,
    load: async ({ mounted }) => {
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
          .select('user_id, seq, kind, word, tile_ids, valid, submitted_at')
          .eq('game_id', gameId)
          .order('submitted_at', { ascending: true }),
      ])
      if (!mounted()) return
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
      for (const s of subs) if (s.valid && s.tile_ids) for (const id of s.tile_ids) confirmed.add(id)
      setPendingRemoved((prev) => prev.filter((id) => !confirmed.has(id)))

      // A teammate's accepted word may have claimed a tile we were still
      // building with (selections are private now — we don't see each
      // other's in-progress picks). If so our word is stale (its tiles
      // aren't all on the board), so reset it. Our own just-committed
      // word is already empty, so this only fires for a teammate's grab.
      setCurrentWord((prev) => (prev.some((id) => confirmed.has(id)) ? [] : prev))

      setLoading(false)
    },
  })

  // Local tile click: pick the tile up onto the end of the word. Returns
  // the resulting word so the PlayArea can submit when it hits five.
  // Returns null when the word is already full or the tile's already in
  // it (the click is a no-op).
  const appendTile = useCallback(
    (tileId: number): number[] | null => {
      if (currentWord.length >= 5 || currentWord.includes(tileId)) return null
      applyWordEvent({ type: 'append', tileId })
      return [...currentWord, tileId]
    },
    [applyWordEvent, currentWord],
  )

  // Local click on a tile already in the word: return it AND every tile
  // after it to the board (the word is an order, so you can't pull one
  // from the middle without invalidating the rest).
  const retractTo = useCallback(
    (index: number) => applyWordEvent({ type: 'retract', index }),
    [applyWordEvent],
  )

  const clearWord = useCallback(
    () => applyWordEvent({ type: 'clear' }),
    [applyWordEvent],
  )

  // Commit an ACCEPTED word: empty it and hold its tiles removed
  // optimistically so the submitter's grid doesn't flash the tiles back
  // on between the word clearing and the valid submission arriving via
  // realtime. The hold is pruned in load() once the submission confirms
  // it. (Teammates never had these tiles selected, so they just see them
  // leave the board once on the refetch — no flash to guard against.)
  const commitWord = useCallback(
    (tileIds: number[]) => applyWordEvent({ type: 'commit', tileIds }),
    [applyWordEvent],
  )

  // The durably-removed set: tiles of every valid submission visible to
  // this caller (coop = all, compete = own via RLS) plus the optimistic
  // holds not yet confirmed.
  const removedTileIds = new Set<number>(pendingRemoved)
  for (const s of submissions) {
    if (s.valid && s.tile_ids) for (const id of s.tile_ids) removedTileIds.add(id)
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
