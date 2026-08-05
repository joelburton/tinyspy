import { useMemo, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Coord } from '../lib/board'
import { db } from '../db'

/** A guess's verdict. Null on a hint row — a hint isn't judged. */
export type GuessResult =
  'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'

/** What every `strands.events` row carries, whatever kind it is. */
type EventBase = {
  id: string
  game_id: string
  user_id: string
  /** The cells this row is about: a guess's traced route, or a hint's revealed
   *  word. The one column both kinds share, meaning the same thing in each. */
  path: Coord[]
  created_at: string
}

/**
 * One row of `strands.events` — the game's append-only log, discriminated on
 * `kind`.
 *
 * A **guess** is a submitted path with a word and a verdict. A **hint** is a
 * cashed token: it has coords (so the history viewer can re-ring it exactly as
 * it looked) but deliberately no word — a hint has never said its word, and the
 * log is the one place that would outlive the on-board ring being retired.
 *
 * Discriminated rather than all-optional so `row.word` only type-checks after
 * `row.kind === 'guess'`, which is the property that keeps a hint row from
 * silently rendering as an empty word.
 */
export type EventRow =
  | (EventBase & { kind: 'guess'; word: string; result: GuessResult })
  | (EventBase & { kind: 'hint'; word: null; result: null })

/** The answer key — null for the whole game, filled in at the reveal. */
export type StrandsSolution = {
  spangram: { word: string; coords: Coord[] }
  themeWords: Array<{ word: string; coords: Coord[] }>
}

/** Projected from `strands.games_state` — the puzzle, immutable during play. */
export type StrandsGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  puzzle_date: string | null
  /** 8 rows of 6 letters. */
  board: string[]
  /** The theme prompt — shown from the first second; not a spoiler. */
  clue: string
  /** What a hint costs, in valid non-theme words. */
  hint_cost: number
  min_word_length: number
  band: number
  /** NULL until `common.games.solution_revealed`. */
  solution: StrandsSolution | null
}

/**
 * One row of `strands.players_state` — a player's working state.
 *
 * `hint_points` and `active_hint_coords` are **null for a rival mid-game**: the
 * bar's fill proxies how many valid words they've found, and their revealed
 * word is part of the answer. `hints_spent` is never null — it's compete's
 * ranking metric, and the one number the OpponentStrip shows.
 */
export type StrandsPlayer = {
  game_id: string
  user_id: string
  hints_spent: number
  solved: boolean
  solved_at: string | null
  hint_points: number | null
  active_hint_coords: Coord[] | null
}

/**
 * strands' per-gametype data hook.
 *
 * **Both halves refetch**, which is the difference from wordiply/boggle, where
 * the header loads once. `strands.games` is genuinely mutable during play — the
 * hint bar fills, a hint appears, the solution arrives at the reveal — and the
 * hint pool is SHARED in coop, so a peer spending a hint has to land on
 * everyone's screen. Treating the header as immutable here would freeze the bar
 * at whatever it read on mount.
 *
 * There is **no Broadcast channel**, deliberately. A peer sees your word when
 * you SUBMIT it; nobody watches anyone else's tiles light up mid-trace. That is
 * the opposite of connections (which shares partial selection so coop players
 * build a guess together), and it means postgres_changes on the three strands
 * tables (plus common.games) carries everything. Recorded here so the absence
 * doesn't read as an oversight.
 */
export function useGame(gameId: string, selfId: string): {
  game: StrandsGame | null
  /** Every player's row (rivals' private fields arrive null mid-game). */
  players: StrandsPlayer[]
  /** The caller's own row — the hint bar and solved flag the UI acts on. */
  me: StrandsPlayer | null
  /** EVERY row — the turn log wants the rejects and the spent hints too. */
  events: EventRow[]
  /** Just the found theme words + spangram: the board's persistent paths. */
  found: EventRow[]
  loading: boolean
  /** True once the event rows have loaded at least once. Distinct from
   *  `loading`, which tracks the game row. */
  rowsLoaded: boolean
} {
  const [game, setGame] = useState<StrandsGame | null>(null)
  const [players, setPlayers] = useState<StrandsPlayer[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)

  useRealtimeRefetch({
    tables: [
      { schema: 'strands', table: 'events', filter: `game_id=eq.${gameId}` },
      // Per-player state: the hint bar, a spent hint, and a rival's
      // hints-used ticking up mid-race.
      { schema: 'strands', table: 'players', filter: `game_id=eq.${gameId}` },
      // The replay touch (replay_board DELETEs events, which realtime filters
      // don't reliably match).
      { schema: 'strands', table: 'games', filter: `id=eq.${gameId}` },
      // COMMON's row too, which is unusual for a per-game hook. It's needed
      // because the shield's gate lives there: `games_state.solution` is
      // `case when common.games.solution_revealed …`, and both writers of that
      // flag (common.end_game on a win, common.reveal_solution on the ask)
      // touch ONLY common.games. Without this subscription the flag flips, the
      // shell re-renders with solutionRevealed=true, and this hook keeps
      // serving the stale `solution: null` it fetched before the reveal — so
      // the answer never appears. Found by clicking Reveal and watching
      // nothing happen.
      { schema: 'common', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'strands',
    id: gameId,
    load: async ({ mounted }) => {
      const [{ data: g }, { data: rows }, { data: ps }] = await Promise.all([
        db
          .from('games_state')
          .select(
            'id, club_handle, mode, puzzle_date, board, clue,'
            + ' hint_cost, min_word_length, band, solution',
          )
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('events')
          .select('id, game_id, user_id, kind, word, path, result, created_at')
          .eq('game_id', gameId)
          .order('created_at', { ascending: true }),
        db
          .from('players_state')
          .select('game_id, user_id, hints_spent, solved, solved_at, hint_points, active_hint_coords')
          .eq('game_id', gameId),
      ])
      if (!mounted()) return
      if (g) setGame(g as unknown as StrandsGame)
      setEvents((rows ?? []) as EventRow[])
      setPlayers((ps ?? []) as unknown as StrandsPlayer[])
      setLoading(false)
      setRowsLoaded(true)
    },
  })

  // Split once, here, so no consumer has to remember which results are the ones
  // that persist on the board.
  //
  // In COMPETE the rows are already scoped to the caller by RLS mid-game, and
  // open up at terminal — at which point `found` would suddenly include rivals'
  // finds and paint their words on your board. So the filter is explicit rather
  // than leaning on the policy, and stays correct across the transition. (The
  // same reasoning spellingbee records for its compete score.)
  const found = useMemo(
    () =>
      events.filter(
        (e) =>
          (e.result === 'theme' || e.result === 'spangram')
          && (game?.mode === 'coop' || e.user_id === selfId),
      ),
    [events, game?.mode, selfId],
  )

  const me = useMemo(
    () => players.find((p) => p.user_id === selfId) ?? null,
    [players, selfId],
  )

  return { game, players, me, events, found, loading, rowsLoaded }
}
