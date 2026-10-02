// cs-blessed-connections

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import { useRefetchOnGameUpdate } from '@/common/game-page/useRefetchOnGameUpdate'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { EndOutcome, GameEnding, PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { GamePlayer, Member } from '@/common/members/member'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { db } from '../db'
import { eventToOutcome, type GuessResult } from '../lib/answer'
import type { Board, CategoryRank } from '../lib/board'
import {
  applyPickEvent,
  eventForClick,
  unionTiles,
  type PickEvent,
  type PickMap,
} from '../lib/picks'
import type { ConnectionsSetup } from '../lib/setup'
import { makeSetupRows } from '../lib/setupRows'
import type { ConnectionsGameStatus, ConnectionsPlayerStatus } from '../lib/statuses'

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

/** One player of this game, as `gd` holds them: who they are (a `Member`, so
 *  a player can go wherever a member is taken), and this game's facts about
 *  them. */
export type ConnectionsPlayer = Member & {
  // Null while this player plays on; set once their play ended while the game
  // went on — out on mistakes or conceded, in compete.
  playerEnding: {
    at: string
    reason: PlayerEndedReason
    reasonDetail: string
  } | null
  // How they came out. A compete player's is written when they end; otherwise
  // both are null until the game ends.
  outcome: EndOutcome | null
  finalRanking: number | null
  // When they matched their fourth category; in coop, when the team did.
  solvedAt: string | null
  // The categories this player matched themselves, in both modes.
  foundCategoriesCount: number
  // Mistakes charged to them: the team's in coop, the same on every player;
  // their own in compete.
  mistakeCount: number
}

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object grouped by what each value means. Where a value came
 * from (the page's `common.games` row, a status copy, connections' own tables,
 * the picks room) is `makeGameData`'s business, never the reader's.
 */
export type GameData = {
  gameId: string
  mode: 'coop' | 'compete'
  isCompete: boolean
  // The players are working one board together: coop with more than one of
  // them. Solo, and in compete, each board is one player's own.
  isSharedBoard: boolean
  title: string
  // The setup form's record: New game replays it.
  setup: ConnectionsSetup
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  // The puzzle this game is played on.
  puzzle: {
    // Its NYT date (`YYYY-MM-DD`); null for a puzzle that is not one of theirs.
    date: string | null
    // The four categories and the sixteen tiles in their display order, as
    // `connections.games.board` holds them.
    board: Board
    // The tiles still loose on my board, in the board's order: every tile not
    // in one of `matchedCategories`.
    remainingTiles: string[]
  }
  // The state line's counts ("2/4 categories · 1/4 mistakes").
  readout: {
    requiredCategoriesCount: number
    maxMistakes: number
    // The matches that count for me: the team's in coop, my own in compete.
    // SPECTATING: a club member watching a compete game has none, so reads 0.
    foundCount: number
    // The mistakes that count for me: the team's in coop, my own in compete.
    // SPECTATING: a club member watching a compete game has none, so reads as
    // the budget spent.
    mistakeCount: number
  }
  // The guess being assembled: who holds which tiles, and the two senders.
  // Coop shares them over the picks room; compete keeps them on this client.
  picks: {
    // One entry per player holding tiles, in pick order.
    byUser: PickMap
    // Every held tile, flattened in pick order — what Submit sends.
    union: string[]
    // Who holds each held tile.
    ownerByTile: ReadonlyMap<string, string>
    toggleTile: (tile: string) => void
    sendClear: () => void
  }
  turns: {
    isTurnBased: boolean
    // The turn pointer as stored; a record, not a claim — it outlives the end.
    turnHolderId: string | null
    // The player it names; null in a free-for-all game.
    turnHolder: ConnectionsPlayer | null
  }
  // How the game ended; null while it is played.
  gameEnding: GameEnding | null
  isGameEnded: boolean
  // Compete's winner, the racer who matched all four first; null until the
  // game ends, and always null in coop, where the team wins together.
  winner: ConnectionsPlayer | null
  // The rows on the board I play: every guess on coop's shared board, only my
  // own in compete — at the end every racer's rows arrive, and the board stays
  // mine.
  boardEvents: EventRow[]
  // The categories on my board, in the order they were matched: a projection
  // of `boardEvents`.
  matchedCategories: MatchedCategory[]
  // The log: every guess I may see, in the order of play. RLS scopes it to my
  // own rows in compete until the game ends.
  events: EventRow[]
  // The players in seat order, and the same objects keyed by user id.
  players: ConnectionsPlayer[]
  playersById: Record<string, ConnectionsPlayer>
  // My entry in `playersById`; null for a club member watching.
  me: ConnectionsPlayer | null
  // Where I stand (docs/win-lose.md → Where a player stands), as the page
  // worked it out, plus connections' two.
  standing: {
    isConceded: boolean
    isLocallyTerminal: boolean
    isStillPlaying: boolean
    isMyTurn: boolean
    isWaitingForTurn: boolean
    isBoardInteractive: boolean
    // I matched all four — in coop, my team did (docs/win-lose.md → `solved`).
    hasSolved: boolean
    // Compete: I spent the mistake budget, so I am out while the race goes on.
    // Coop reaches the budget only on the guess that ends the game, so this
    // stays false there.
    isEliminated: boolean
  }
}

/** What connections' own reads bring back: the puzzle off `connections.games`
 *  and the log. */
type GameRows = {
  board: Board
  puzzleDate: string | null
  events: EventRow[]
}

/**
 * The page's players as `gd` holds them, keyed by user id. Each one's counts
 * and ending reason come from their `player_status`, the rest from
 * `common.game_players`.
 */
export function makePlayersById(
  gamePlayers: GamePlayer[],
): Record<string, ConnectionsPlayer> {
  const players = gamePlayers.map(function makePlayer(p): ConnectionsPlayer {
    const playerStatus = p.player_status as unknown as ConnectionsPlayerStatus
    const endedReason = playerStatus.player_ended_reason
    return {
      id: p.id,
      username: p.username,
      color: p.color,
      playerEnding:
        endedReason !== null && p.player_ended_at !== null
          ? {
              at: p.player_ended_at,
              reason: endedReason,
              reasonDetail: p.player_ended_reason_detail ?? '',
            }
          : null,
      outcome: p.outcome,
      finalRanking: p.final_ranking,
      solvedAt: p.solved_at,
      foundCategoriesCount: playerStatus.found_categories_count,
      mistakeCount: playerStatus.mistake_count,
    }
  })
  return Object.fromEntries(players.map((p) => [p.id, p]))
}

/** The page's `game_status`, as connections' builder writes it. */
export function readGameStatus(ctx: PlayAreaLoaderProps): ConnectionsGameStatus {
  return ctx.cg.game_status as unknown as ConnectionsGameStatus
}

/** The page's setup blob, as connections' setup form wrote it. */
export function readSetup(ctx: PlayAreaLoaderProps): ConnectionsSetup {
  return ctx.cg.setup as unknown as ConnectionsSetup
}

/**
 * THE INBOUND SEAM: the wire word is read through `lib/answer.ts` here and
 * never travels further. `matched` is derived here too, so no downstream rule
 * has to ask a color whether a category was found.
 */
function readEventRow(
  row: Omit<EventRow, 'outcome' | 'matched' | 'result'> & { result: string },
): EventRow {
  const result = row.result as GuessResult
  return {
    id: row.id,
    user_id: row.user_id,
    tiles: row.tiles,
    outcome: eventToOutcome({ result }),
    result,
    matched: result === 'correct',
    matched_category_rank: row.matched_category_rank,
    created_at: row.created_at,
  }
}

/** The categories the given rows matched, joined to the board by rank, in the
 *  order they were matched. */
function makeMatchedCategories(events: EventRow[], board: Board): MatchedCategory[] {
  const categoryByRank = new Map<number, Board['categories'][number]>()
  for (const c of board.categories) categoryByRank.set(c.rank, c)
  const matched: MatchedCategory[] = []
  for (const e of events) {
    if (!e.matched || e.matched_category_rank === null) continue
    // A correct row names a rank `submit_guess` checked against 0..3, and the
    // board carries all four.
    const category = categoryByRank.get(e.matched_category_rank)!
    matched.push({
      rank: category.rank,
      name: category.name,
      tiles: category.tiles,
      matched_at: e.created_at,
    })
  }
  return matched
}

/** What `makeGameData` is handed beside the page's values. */
export type GameDataInputs = {
  ctx: PlayAreaLoaderProps
  rows: GameRows
  // Built already, so the caller can hold their identity across renders.
  playersById: Record<string, ConnectionsPlayer>
  setupRows: SetupRow[]
  // The picks as the hook keeps them, and its two senders.
  picks: PickMap
  toggleTile: (tile: string) => void
  sendClear: () => void
}

/**
 * Build `gd` from the page's values, connections' own rows and the picks. A
 * fact the statuses carry is read from them (the two table-facts from
 * `game_status`, each player's counts from their `player_status`, in
 * `makePlayersById`); everything else from the tables.
 */
export function makeGameData({
  ctx,
  rows,
  playersById,
  setupRows,
  picks,
  toggleTile,
  sendClear,
}: GameDataInputs): GameData {
  const { cg } = ctx
  const myId = ctx.auth.user.id
  const isCompete = cg.mode === 'compete'
  const gameStatus = readGameStatus(ctx)
  const me = playersById[myId] ?? null
  const players = Object.values(playersById)
  // Coop writes the team's mistakes on every player, so any one of them
  // carries them; a game always has at least one player.
  const teamMistakeCount = players[0]!.mistakeCount
  // Each match is one player's and a category is matched once, so the team's
  // matches are the sum.
  const teamFoundCount = players.reduce((sum, p) => sum + p.foundCategoriesCount, 0)

  const boardEvents = isCompete
    ? rows.events.filter((e) => e.user_id === myId)
    : rows.events
  const matchedCategories = makeMatchedCategories(boardEvents, rows.board)
  const matchedTiles = new Set(matchedCategories.flatMap((m) => m.tiles))

  const ownerByTile = new Map<string, string>()
  for (const [userId, tiles] of picks) {
    for (const tile of tiles) ownerByTile.set(tile, userId)
  }

  return {
    gameId: cg.id,
    mode: cg.mode,
    isCompete,
    isSharedBoard: !isCompete && players.length > 1,
    title: cg.title,
    setup: readSetup(ctx),
    setupRows,
    puzzle: {
      date: rows.puzzleDate,
      board: rows.board,
      remainingTiles: rows.board.tileOrder.filter((t) => !matchedTiles.has(t)),
    },
    readout: {
      requiredCategoriesCount: gameStatus.required_categories_count,
      maxMistakes: gameStatus.max_mistakes,
      foundCount: isCompete ? (me?.foundCategoriesCount ?? 0) : teamFoundCount,
      mistakeCount: isCompete
        ? (me?.mistakeCount ?? gameStatus.max_mistakes)
        : teamMistakeCount,
    },
    picks: {
      byUser: picks,
      union: unionTiles(picks),
      ownerByTile,
      toggleTile,
      sendClear,
    },
    turns: {
      isTurnBased: cg.turns.isTurnBased,
      turnHolderId: cg.turns.turnHolderId,
      turnHolder: cg.turns.turnHolderId === null
        ? null
        : (playersById[cg.turns.turnHolderId] ?? null),
    },
    gameEnding: cg.gameEnding,
    isGameEnded: cg.isGameEnded,
    winner: isCompete
      ? (players.find((p) => p.outcome === 'won') ?? null)
      : null,
    boardEvents,
    matchedCategories,
    events: rows.events,
    players,
    playersById,
    me,
    standing: {
      isConceded: cg.me.isConceded,
      isLocallyTerminal: cg.me.isLocallyTerminal,
      isStillPlaying: cg.me.isStillPlaying,
      isMyTurn: cg.me.isOnTurn,
      isWaitingForTurn: cg.me.isWaitingForTurn,
      isBoardInteractive: cg.me.isBoardInteractive,
      hasSolved: cg.me.hasSolved,
      isEliminated:
        isCompete && me !== null && me.mistakeCount >= gameStatus.max_mistakes,
    },
  }
}

/**
 * Per-gametype data hook for connections (both modes share it): `gd`, the
 * game data, built from the page's values, connections' own two reads — the
 * puzzle off `games` and `events` (the log; RLS scopes it to the caller in
 * compete until the end) — and the picks.
 *
 * The tables have no subscription here: `useRefetchOnGameUpdate` reruns the
 * reads when the page's `common.games` row moves (`cg.updated_at`) or the
 * page's channel rejoins (`resubscribeCount`).
 *
 * The picks are the one thing this hook keeps a channel for. Coop's are
 * shared, so every peer joins the stable room `connections:${gameId}` and each
 * change travels as a `PickEvent` on the `pick` Broadcast; what an event means
 * is `lib/picks.ts`'s. Compete's picks are private: no room is joined, and the
 * senders apply locally.
 */
export function useGame(ctx: PlayAreaLoaderProps): {
  // Null until the reads are in, and when the game is absent.
  gd: GameData | null
  loading: boolean
  // Set when a read FAILED, which is not the same as the game being absent.
  // The loader renders `<EnvelopeErrorPage>` for this, and `<NoSuchGamePage>`
  // for a game that is absent.
  failure: NotOkEnvelope | null
} {
  const { cg } = ctx
  const gameId = cg.id
  const myId = ctx.auth.user.id
  const isCompete = cg.mode === 'compete'
  const [rows, setRows] = useState<GameRows | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)
  const [picks, setPicks] = useState<PickMap>(() => new Map())
  // The picks room, once coop has joined it; `broadcast` below sends on it.
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  useRefetchOnGameUpdate({
    commonGameUpdatedAt: cg.updated_at,
    resubscribeCount: ctx.resubscribeCount,
    load: async ({ isCurrent }) => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `game_id` is the
      // PK, so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games')
          .select('board, puzzle_date')
          .eq('game_id', gameId),
      )
      if (!isCurrent()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure, so an outage that
      // ends takes its sentence with it. Cleared HERE, before the zero-rows
      // return below, so a game deleted during the outage reads as "not found"
      // rather than as the outage.
      setFailure(null)

      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const gameRow = gameRes.data[0]
      if (!gameRow) {
        setRows(null)
        setLoading(false)
        return
      }

      const eventsRes = await readRows(
        db
          .from('events')
          .select('id, user_id, tiles, result, matched_category_rank, created_at')
          .eq('game_id', gameId)
          .order('id', { ascending: true }),
      )
      if (!isCurrent()) return
      if (eventsRes.type === 'not-ok') {
        setFailure(eventsRes)
        setLoading(false)
        return
      }

      setRows({
        board: gameRow.board as Board,
        puzzleDate: gameRow.puzzle_date,
        events: eventsRes.data.map(readEventRow),
      })
      setLoading(false)
    },
  })

  // Fold a pick event into the picks; the rules (and why an echo of our own
  // broadcast is safe) are `lib/picks.ts`'s.
  const applyPick = useCallback((event: PickEvent) => {
    setPicks((prev) => applyPickEvent(prev, event))
  }, [])

  // Coop joins the picks room; see channelTeardown.ts for the join-after-leave
  // shape a stable-named room needs.
  useEffect(function joinPicksRoom() {
    if (isCompete) return
    const room = `connections:${gameId}`
    let canceled = false
    // Assigned by `join`, which may run after this effect body returns (the
    // join waits on any in-flight teardown of this room), so the cleanup reads
    // it from here.
    let ch: RealtimeChannel | null = null

    function join() {
      // Guards the deferred path only — the effect can tear down again while
      // the previous channel is still leaving.
      if (canceled) return
      ch = supabase.channel(room)
      ch.on('broadcast', { event: 'pick' }, ({ payload }) =>
        applyPick(payload as PickEvent),
      )
      ch.subscribe()
      // The channel IS the external system being synced into state.
      setChannel(ch)
    }

    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      canceled = true
      setChannel(null)
      if (ch) void releaseChannel(ch) // null if we tore down before joining
    }
  }, [applyPick, gameId, isCompete])

  // Apply a pick event here, then put it on the wire in coop. The local apply
  // is what makes the click land at once; the echo of our own broadcast is a
  // no-op (`applyPickEvent` is idempotent). Compete has no room and sends
  // nothing. The channel is null before a deferred join lands.
  const broadcast = useCallback(
    (event: PickEvent) => {
      applyPick(event)
      if (isCompete || channel === null) return
      void channel.send({ type: 'broadcast', event: 'pick', payload: event })
    },
    [applyPick, isCompete, channel],
  )

  // What a click does is `eventForClick`'s (doc.md → Coop); `null` is the
  // refused click on a full guess, which sends nothing.
  const toggleTile = useCallback(
    (tile: string) => {
      const event = eventForClick(picks, tile, myId)
      if (event) broadcast(event)
    },
    [broadcast, picks, myId],
  )

  const sendClear = useCallback(() => {
    broadcast({ type: 'clear' })
  }, [broadcast])

  // `gd` is rebuilt every render — a handful of assignments — but what an
  // effect may depend on keeps its identity: the players and the setup rows
  // are rebuilt only when the page's players or setup change, and the log only
  // when a read lands.
  const playersById = useMemo(() => makePlayersById(cg.players), [cg.players])
  const setup = readSetup(ctx)
  const puzzleDate = rows?.puzzleDate ?? null
  const setupRows = useMemo(
    () => makeSetupRows(setup, cg.mode, cg.players, puzzleDate),
    [setup, cg.mode, cg.players, puzzleDate],
  )
  const gd = rows === null
    ? null
    : makeGameData({ ctx, rows, playersById, setupRows, picks, toggleTile, sendClear })

  return { gd, loading, failure }
}
