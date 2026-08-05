import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a letterboxed game. Any club member who joined may play, so
 * Player is a straight re-export of Member (the per-game vocabulary
 * convention — naming.md → player).
 */
export type Player = Member

/**
 * The board header, projected from `letterboxed.games_state`. Immutable for
 * the life of the game (play state lives on common.games), so it loads once —
 * which matters here because `playableWords` can be a few thousand entries and
 * has no business being re-downloaded on every move.
 */
export type LetterboxedGame = {
  id: string
  club_handle: string
  /** Denormalized from `letterboxed.games.mode`; drives the compete
   *  OpponentStrip + the win-vs-loss verdict branching. */
  mode: 'coop' | 'compete'
  /** Twelve letters in SIDE ORDER — positions 0-2 are one side, 3-5 the next,
   *  and so on. See lib/board.ts. */
  sides: string
  /** Every word playable on this board. Shipped so the FE can reject a bad
   *  word instantly, and (later) run the hint search locally. */
  playableWords: string[]
  /** The seeded two-word solution. Shipped from the start, RENDERED only at
   *  terminal — the board's own word list would give it away anyway, so
   *  hiding it server-side would guard nothing. */
  solution: string[]
  /** The chain-length cap. */
  max_words: number
  legal_band: number
  created_at: string
}

/**
 * One row of `letterboxed.players_state`. The chain is per-player in compete
 * and lock-stepped across players in coop, so "my row" is always the right one
 * to read — the view handles the difference.
 */
export type PlayerRow = {
  game_id: string
  user_id: string
  /** NULL for a compete rival mid-race; the view masks it. */
  chain: string[] | null
  /** Always visible — the numbers a race is allowed to publish. */
  word_count: number
  letters_covered: number
  hints_used: number
  solved: boolean
  solved_at: string | null
}

/** One row of `letterboxed.events` — the turn log, retreats included. */
export type EventRow = {
  id: number
  game_id: string
  user_id: string
  kind: 'played' | 'undone' | 'cleared' | 'hint' | 'spoiler'
  word: string | null
  letters_covered: number
  created_at: string
}

/**
 * letterboxed's per-gametype data hook. Two data lifecycles, the shape
 * wordwheel/boggle/wordiply use:
 *
 *   - **The header loads ONCE.** `letterboxed.games` is immutable during play,
 *     and it carries the big payload (the playable word list), so it must not
 *     re-fetch per move.
 *   - **players + events refetch on realtime events.** Every move rewrites a
 *     players row and appends an events row; both are published, so a peer's
 *     move wakes this hook — including replay_board, whose players UPDATE is
 *     what tells everyone the board restarted (its events DELETEs alone would
 *     not: postgres_changes filters don't reliably match deletes).
 *
 * `selfId` comes from the caller (GamePage already holds the session) — the
 * strands shape. players_state masks a rival's chain to null, and "my row" is
 * the one whose chain is authoritative, so the id picks it out.
 */
export function useGame(gameId: string, selfId: string): {
  game: LetterboxedGame | null
  /** Every visible player row, including rivals' (chain masked). */
  playerRows: PlayerRow[]
  /** The caller's own row — the chain the board renders. */
  myRow: PlayerRow | null
  /** The turn log, oldest first. */
  events: EventRow[]
  loading: boolean
  /** True once the move rows have loaded at least once — distinct from
   *  `loading` (which flips on the HEADER fetch). Peer narration gates on this
   *  so a rejoin doesn't replay the backlog as a burst of pills. */
  rowsLoaded: boolean
} {
  const [game, setGame] = useState<LetterboxedGame | null>(null)
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)

  // The immutable header — fetched once per game. `loading` gates the PlayArea
  // render, so it flips here.
  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('games_state')
        .select('id, club_handle, mode, sides, playable_words, solution, max_words, legal_band, created_at')
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return
      if (data) {
        setGame({
          id: data.id as string,
          club_handle: data.club_handle as string,
          mode: data.mode as 'coop' | 'compete',
          sides: data.sides as string,
          playableWords: (data.playable_words as string[]) ?? [],
          solution: (data.solution as string[]) ?? [],
          max_words: data.max_words as number,
          legal_band: data.legal_band as number,
          created_at: data.created_at as string,
        })
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [gameId])

  const load = useCallback(
    async ({ mounted }: { mounted: () => boolean }) => {
      const [{ data: pData }, { data: eData }] = await Promise.all([
        db
          .from('players_state')
          .select('game_id, user_id, chain, word_count, letters_covered, hints_used, solved, solved_at')
          .eq('game_id', gameId),
        db
          .from('events')
          .select('id, game_id, user_id, kind, word, letters_covered, created_at')
          .eq('game_id', gameId)
          .order('id', { ascending: true }),
      ])
      if (!mounted()) return
      setPlayerRows((pData ?? []) as PlayerRow[])
      setEvents((eData ?? []) as EventRow[])
      setRowsLoaded(true)
    },
    [gameId],
  )

  useRealtimeRefetch({
    tables: [
      { schema: 'letterboxed', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'letterboxed', table: 'events', filter: `game_id=eq.${gameId}` },
      // The games row never changes mid-play, so this binding is quiet today —
      // kept so any future write to it wakes clients rather than silently not.
      // It obliges games' membership in the publication (the central
      // realtime_publication_test pins all three: one unpublished bound table
      // kills the WHOLE channel).
      { schema: 'letterboxed', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'letterboxed',
    id: gameId,
    load,
  })

  const myRow = useMemo(
    () => playerRows.find((r) => r.user_id === selfId) ?? null,
    [playerRows, selfId],
  )

  return { game, playerRows, myRow, events, loading, rowsLoaded }
}
