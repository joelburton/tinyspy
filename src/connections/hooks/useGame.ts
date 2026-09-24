// cs-blessed-connections

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import { onPostgresAttached } from '@/common/realtime/postgresAttached'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { Outcome } from '@/common/outcomes/outcomes'
import { eventToOutcome, type GuessResult } from '../lib/answer'
import { db } from '../db'
import type { Database } from '@/types/db'
import type { Member } from '@/common/members/member'
import { MISTAKE_BUDGET, type Board, type CategoryRank } from '../lib/board'
import {
  applySelectionEvent,
  eventForClick,
  unionTiles,
  type SelectionEvent,
  type SelectionMap,
} from '../lib/selection'

/** One player in a connections game — a `Member` as-is. What this game keeps
 *  per player lives on `connections.players` (`PlayerRow`), not on the person. */
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

/**
 * One guess from `connections.events`, as the board reads it: the columns this
 * game needs, plus the three readings of that guess — `outcome`, `result` and
 * `matched` — derived once where the rows are loaded so no consumer re-decides
 * any of them.
 */
export type EventRow = {
  // The row's own id, and the order of play: the database hands them out in
  // the order the rows were written, which is what the read below orders by.
  id: number
  user_id: string
  tiles: string[]
  // How this guess READS — the shared vocabulary, from `lib/answer.ts`, the
  // one place that decides it. Never the wire word: a tile fill, a log row and
  // a PDF cell all want the same colors the rest of the app uses.
  outcome: Outcome
  // What this guess WAS — the three-value wire word the column stores. Carried
  // beside the outcome because some readers need the FACT rather than the
  // color: the history viewer's tint has exactly three classes, and a
  // seven-value vocabulary cannot key them.
  result: GuessResult
  // Whether this guess MATCHED a category — the rules question, answered once
  // here so downstream asks neither the wire word nor a color.
  matched: boolean
  matched_category_rank: number | null
  created_at: string
}

/** One row from `connections.players` — per-player mistake counter
 *  (lock-step across all rows in coop, independent in compete). */
export type PlayerRow = {
  user_id: string
  mistake_count: number
  // The player's own categories-found count (public; drives the compete
  // "Found" opponent strip). See connections.players.matched_count.
  matched_count: number
}

/**
 * One matched category — a `result = 'correct'` guess row joined to the
 * board's category by rank.
 */
export type MatchedCategory = {
  rank: CategoryRank
  name: string
  tiles: string[]
  matched_at: string
}

/**
 * A connections game as the frontend holds it: the setup facts from
 * `connections.games`, all of them fixed once the game is created. Play state,
 * pause and the timer are the common row's and reach a component through
 * `ctx`, not through here.
 */
export type ConnectionsGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  board: Board
  // The puzzle's NYT date (`YYYY-MM-DD`), or null for a non-NYT puzzle. The
  // most identifying setup choice — *which* daily puzzle this game is.
  puzzleDate: string | null
  // Server-stamped game-start timestamp, ISO. Mirrored from the
  // per-gametype row (which carries its own created_at).
  created_at: string
}

/**
 * connections' per-game data hook: the game row, the guess log, the player
 * rows and, in coop, the shared selection — one Realtime room per game.
 *
 * Broadcast-coupled (docs/code-conventions.md → Realtime data hooks): the
 * room is the stable `connections:${gameId}` so peers share it for the
 * selection Broadcast, and the postgres-changes on
 * `connections.{games, events, players}` ride the same channel. Compete keeps
 * every pick local — `broadcast()` applies and never sends.
 *
 * What it projects: `matchedCategories` from the correct rows joined to the
 * board; `mistakeCount` from the caller's own row (equal across rows in
 * coop); `opponentFound` for compete's Found strip, empty in coop;
 * `isEliminated` for a racer who has spent the budget. Pause, timer, members
 * and presence are `useCommonGame`'s.
 */
export function useGame(
  session: Session,
  gameId: string,
): {
  game: ConnectionsGame | null
  guesses: EventRow[]
  matchedCategories: MatchedCategory[]
  mistakeCount: number
  opponentFound: ReadonlyMap<string, number>
  isEliminated: boolean
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  loading: boolean
  // Why the board cannot be shown, when it cannot — the sentence and the
  // diagnostics line, both built at the moment the load failed.
  //
  // SEPARATE FROM `game === null`, which means the game does not exist. A
  // failed read knows nothing about whether it exists, and saying "Game not
  // found." about a dead connection is a confident wrong answer
  // (docs/envelopes.md → The shape of a call site: the modal is an
  // escalation, and this is what remains once it is dismissed).
  failure: NotOkEnvelope | null
} {
  const [game, setGame] = useState<ConnectionsGame | null>(null)
  const [guesses, setGuesses] = useState<EventRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [selections, setSelections] = useState<SelectionMap>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)
  const [channel, setChannel] = useState<
    ReturnType<typeof supabase.channel> | null
  >(null)
  // Same channel, reachable synchronously from the effect cleanup — the state
  // above is for consumers, but the channel may be created AFTER the effect
  // body returns (the join waits on any in-flight teardown of this room).
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Fold an incoming selection event into local state; the rules (and why an
  // echo of our own broadcast is safe) are `lib/selection.ts`'s.
  const applySelection = useCallback((event: SelectionEvent) => {
    setSelections((prev) => applySelectionEvent(prev, event))
  }, [])

  // Join this game's connections-specific Realtime room: load the
  // game row + events + players, attach postgres-changes on
  // connections.{games, events, players}, attach the shared-selection
  // Broadcast handler (coop semantics — compete senders short-
  // circuit in `broadcast()` below, so foreign events shouldn't
  // arrive in compete; the handler is registered unconditionally
  // because the channel is built before mode is known).
  useEffect(function joinConnectionsRoom() {
    let mounted = true

    async function load() {
      const [gameRes, guessesRes, playersRes] = await Promise.all([
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        readRows(
          db
            .from('games')
            .select('id, club_handle, mode, board, created_at, puzzle_date')
            .eq('id', gameId),
        ),
        readRows(
          db
            .from('events')
            .select(
              'id, user_id, tiles, result, matched_category_rank, created_at',
            )
            .eq('game_id', gameId)
            .order('id', { ascending: true }),
        ),
        readRows(
          db
            .from('players')
            .select('user_id, mistake_count, matched_count')
            .eq('game_id', gameId),
        ),
      ])
      if (!mounted) return
      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the envelope BEHIND it, held as it arrived: it already
      // carries the sentence, the severity, the dbcode, and (in `detail`) which
      // of the three reads died. One branch each, because that last fact is the
      // one nobody can recover afterwards.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      if (guessesRes.type === 'not-ok') {
        setFailure(guessesRes)
        setLoading(false)
        return
      }
      if (playersRes.type === 'not-ok') {
        setFailure(playersRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the board behind a stale explanation.
      setFailure(null)
      // ZERO ROWS is the caller's to read, and here it means what it says: no
      // game with that id, or one this club can't see. `data[0]` types as
      // present, so the cast is what gives the check below something to narrow
      // (code-conventions.md → known gotchas).
      const row = gameRes.data[0] as GameRow | undefined
      if (!row) {
        setGame(null)
        setLoading(false)
        return
      }
      setGame({
        id: row.id,
        club_handle: row.club_handle,
        mode: row.mode as 'coop' | 'compete',
        board: row.board as Board,
        puzzleDate: row.puzzle_date,
        created_at: row.created_at,
      })
      // THE INBOUND SEAM: the wire word is read through `lib/answer.ts` here and
      // never travels further. `matched` is derived here too, so no downstream
      // rule has to ask a color whether a category was found.
      setGuesses(
        guessesRes.data.map((g) => {
          const result = g.result as GuessResult
          return {
            id: g.id,
            user_id: g.user_id,
            tiles: g.tiles,
            outcome: eventToOutcome({ result }),
            result,
            matched: result === 'correct',
            matched_category_rank: g.matched_category_rank,
            created_at: g.created_at,
          }
        }),
      )
      setPlayers(playersRes.data)

      setLoading(false)
    }

    // Stable channel name — selection Broadcast (coop) needs a shared room
    // across peers, so a UUID suffix (what `useRealtimeRefetch` adds when no
    // broadcast is in play) would defeat the purpose. That means a remount
    // inside the previous mount's leave round-trip (StrictMode's double-mount;
    // fast re-entry) must WAIT rather than re-create, or supabase-js hands
    // back the dying channel.
    const room = `connections:${gameId}`
    let canceled = false

    function join() {
      // Guards the deferred path only — the effect can tear down again
      // while the previous channel is still leaving.
      if (canceled) return
      const ch = supabase.channel(room)

      ch.on(
        'postgres_changes',
        { event: '*', schema: 'connections', table: 'games', filter: `id=eq.${gameId}` },
        load,
      )
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'connections', table: 'events', filter: `game_id=eq.${gameId}` },
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

      // Deaf-window closer: re-read once the postgres_changes attach is
      // confirmed — a move committed between SUBSCRIBED (the join ack) and
      // the attach is dropped. See postgresAttached.ts.
      onPostgresAttached(ch, () => load())
      // SUBSCRIBED fires on initial subscribe AND on every reconnect,
      // so this single hook covers both the mount-time fetch and the
      // missed-events-on-reconnect refetch.
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })
      // A sync setState from an effect on the fast path (join() runs inline
      // when no teardown is pending) — deliberate: the channel IS the external
      // system being synced into state.
      setChannel(ch)
      channelRef.current = ch
    }

    // Stable ROOM name (peers must share the topic), so a remount inside the
    // previous mount's leave round-trip would otherwise be handed the dying
    // channel. See common/realtime/channelTeardown.ts.
    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      mounted = false
      canceled = true
      const ch = channelRef.current
      channelRef.current = null
      setChannel(null)
      if (ch) void releaseChannel(ch) // null if we tore down before joining
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

  // What a click does is `eventForClick`'s (doc.md → Coop); `null` is the
  // refused click on a full guess, which sends nothing.
  const toggleTile = useCallback(
    (tile: string) => {
      const event = eventForClick(selections, tile, session.user.id)
      if (event) broadcast(event)
    },
    [broadcast, selections, session.user.id],
  )

  const sendClear = useCallback(() => {
    broadcast({ type: 'clear' })
  }, [broadcast])

  // Flat union for submit + display.
  const union = unionTiles(selections)

  // Project the matched categories from the guess log and the board. In
  // compete RLS hands a caller only their own rows, so these are their own
  // matches; coop sees everyone's.
  const matchedCategories: MatchedCategory[] = []
  if (game) {
    const categoryByRank = new Map<number, Board['categories'][number]>()
    for (const c of game.board.categories) categoryByRank.set(c.rank, c)
    for (const g of guesses) {
      if (!g.matched) continue
      if (g.matched_category_rank == null) continue
      const cat = categoryByRank.get(g.matched_category_rank)
      if (!cat) continue
      matchedCategories.push({
        rank: cat.rank,
        name: cat.name,
        tiles: cat.tiles,
        matched_at: g.created_at,
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

  // Eliminated in compete: the caller has spent the budget. Coop reaches four
  // only on the game-ending guess, so this stays false there.
  const isEliminated = game?.mode === 'compete' && mistakeCount >= MISTAKE_BUDGET

  return {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentFound,
    isEliminated,
    selections,
    unionTiles: union,
    toggleTile,
    sendClear,
    loading,
    failure,
  }
}
