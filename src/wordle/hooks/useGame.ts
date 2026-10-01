// cs-blessed-wordle

import { useMemo, useState } from 'react'
import { useRefetchOnGameUpdate } from '@/common/game-page/useRefetchOnGameUpdate'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { solvedByMe } from '@/common/reveal/describeReveal'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { EndOutcome, GameEnding, PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { Member } from '@/common/members/member'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { db } from '../db'
import type { WordleSetup } from '../lib/setup'
import { makeSetupRows } from '../lib/setupRows'
import type { WordleGameStatus, WordlePlayerStatus } from '../lib/statuses'

/**
 * One row from `wordle.events`. In coop the FE receives every player's
 * guess (the shared board); in compete RLS filters server-side so the
 * FE only sees its own rows until the game ends (then opponents open
 * up). `colors` is the 5-char g/y/x feedback.
 */
export type EventRow = {
  // The row's own id, and the order of play — the database hands them out in
  // the order the rows were written, which is what the read below orders by.
  id: number
  user_id: string
  // The five-letter word guessed.
  word: string
  colors: string
  is_correct: boolean
}

/** One player of this game, as `gd` holds them: who they are (a `Member`, so
 *  a player can go wherever a member is taken), and this game's facts about
 *  them. */
export type WordlePlayer = Member & {
  // Null while this player plays on; set once their play ended while the game
  // went on — solved or out of guesses in compete, or conceded.
  playerEnding: {
    at: string
    reason: PlayerEndedReason
    reasonDetail: string
  } | null
  // How they came out. A compete player's is written when they end (a solve
  // is `neutral` until the others finish); otherwise both are null until the
  // game ends.
  outcome: EndOutcome | null
  finalRanking: number | null
  // When they typed the target; in coop, when the team did.
  solvedAt: string | null
  // Guesses spent: the team's in coop, the same on every player; their own in
  // compete.
  guessesUsed: number
  // Compete: the earlier solve, not the guess count, placed them against the
  // winner (the winner themselves when another solver matched their count).
  // Null in coop and until the game ends.
  isTieBrokenByClock: boolean | null
}

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object grouped by what each value means. Where a value came
 * from (the page's `common.games` row, a status copy, wordle's own tables) is
 * `makeGameData`'s business, never the reader's.
 */
export type GameData = {
  gameId: string
  mode: 'coop' | 'compete'
  isCompete: boolean
  title: string
  // The setup form's record: New game replays it.
  setup: WordleSetup
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows).
  setupRows: SetupRow[]
  // The answer; null until the game ends (the view hands it over then).
  target: string | null
  // The state line's counts ("3/6 guesses").
  readout: {
    // The guess budget: the team's in coop, each player's own in compete.
    maxGuesses: number
    // The count that applies to me: the team's in coop, my own in compete.
    // SPECTATING: a club member watching a compete game has none, so reads as
    // the budget spent.
    guessesUsed: number
  }
  isTurnBased: boolean
  // The turn pointer as stored; a record, not a claim — it outlives the end.
  turnHolderId: string | null
  // The player it names; null in a free-for-all game.
  turnHolder: WordlePlayer | null
  // How the game ended; null while it is played.
  gameEnding: GameEnding | null
  isGameEnded: boolean
  // Compete's winner, ranked first by fewest guesses and then the earlier
  // solve; null until the game ends, and always null in coop, where the team
  // wins together.
  winner: WordlePlayer | null
  // The rows on the board I play: every guess on coop's shared board, only my
  // own in compete.
  boardGuesses: EventRow[]
  // The log: every guess I may see, in the order of play. RLS scopes it to my
  // own rows in compete until the game ends.
  events: EventRow[]
  // The players in seat order, and the same objects keyed by user id.
  players: WordlePlayer[]
  playersById: Record<string, WordlePlayer>
  // My entry in `playersById`; null for a club member watching.
  me: WordlePlayer | null
  // Where I stand (docs/win-lose.md → Where a player stands), as the page
  // worked it out.
  standing: {
    isPlayer: boolean
    isConceded: boolean
    isPlayerEnded: boolean
    isStillPlaying: boolean
    isMyTurn: boolean
    isWaitingForTurn: boolean
    isBoardInteractive: boolean
    // I typed the target — in coop, my team did (docs/win-lose.md →
    // `solved`). Not the win in compete, where fewer guesses can beat it.
    hasSolved: boolean
  }
}

/** What wordle's own reads bring back: the answer from the `games_state`
 *  view, and the log. */
type GameRows = {
  target: string | null
  events: EventRow[]
}

/**
 * The page's players as `gd` holds them, keyed by user id. Each one's count
 * and ending reason come from their `player_status`, the rest from
 * `common.game_players`.
 */
export function makePlayersById(
  gamePlayers: GamePageCtx['players'],
): Record<string, WordlePlayer> {
  const players = gamePlayers.map(function makePlayer(p): WordlePlayer {
    const playerStatus = p.player_status as unknown as WordlePlayerStatus
    const endedReason = playerStatus.player_ended_reason
    return {
      user_id: p.user_id,
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
      guessesUsed: playerStatus.guesses_used,
      isTieBrokenByClock: playerStatus.tie_broken_by_clock,
    }
  })
  return Object.fromEntries(players.map((p) => [p.user_id, p]))
}

/** The page's `game_status`, as wordle's builder writes it. */
export function readGameStatus(ctx: GamePageCtx): WordleGameStatus {
  return ctx.gameStatus as unknown as WordleGameStatus
}

/** The page's setup blob, as wordle's setup form wrote it. */
export function readSetup(ctx: GamePageCtx): WordleSetup {
  return ctx.setup as unknown as WordleSetup
}

/**
 * Build `gd` from the page's values and wordle's own rows. A fact the
 * statuses carry is read from them (the budget from `game_status`, each
 * player's count from their `player_status`, in `makePlayersById`);
 * everything else from the tables. `playersById` and `setupRows` are handed
 * in, already built, so the caller can hold their identity across renders.
 */
export function makeGameData(
  ctx: GamePageCtx,
  rows: GameRows,
  playersById: Record<string, WordlePlayer>,
  setupRows: SetupRow[],
): GameData {
  const isCompete = ctx.mode === 'compete'
  const maxGuesses = readGameStatus(ctx).max_guesses
  const me = playersById[ctx.authSession.user.id] ?? null
  const players = Object.values(playersById)
  // Coop writes the team's count on every player, so any one of them carries
  // it; a game always has at least one player.
  const teamGuessesUsed = players[0]!.guessesUsed

  return {
    gameId: ctx.gameId,
    mode: ctx.mode,
    isCompete,
    title: ctx.title,
    setup: readSetup(ctx),
    setupRows,
    target: rows.target,
    readout: {
      maxGuesses,
      guessesUsed: isCompete
        ? (me?.guessesUsed ?? maxGuesses)
        : teamGuessesUsed,
    },
    isTurnBased: ctx.isTurnBased,
    turnHolderId: ctx.turnHolderId,
    turnHolder: ctx.turnHolderId === null
      ? null
      : (playersById[ctx.turnHolderId] ?? null),
    gameEnding: ctx.gameEnding,
    isGameEnded: ctx.gameEnding !== null,
    winner: isCompete
      ? (players.find((p) => p.outcome === 'won') ?? null)
      : null,
    boardGuesses: isCompete
      ? rows.events.filter((e) => e.user_id === ctx.authSession.user.id)
      : rows.events,
    events: rows.events,
    players,
    playersById,
    me,
    standing: {
      isPlayer: ctx.isPlayer,
      isConceded: ctx.isConceded,
      isPlayerEnded: ctx.isLocallyTerminal,
      isStillPlaying: ctx.isStillPlaying,
      isMyTurn: ctx.isMyTurn,
      isWaitingForTurn: ctx.isWaitingForTurn,
      isBoardInteractive: ctx.isBoardInteractive,
      hasSolved: solvedByMe({
        isCompete,
        gameOutcome: ctx.gameEnding?.outcome ?? null,
        mine: me !== null && me.solvedAt !== null,
      }),
    },
  }
}

/**
 * Per-gametype data hook for wordle (both modes share it): `gd`, the game
 * data, built from the page's values and wordle's own two reads — the
 * `games_state` view (the answer, once ended) and `events` (the log; RLS
 * scopes it to the caller in compete).
 *
 * It keeps no subscription: `useRefetchOnGameUpdate` reruns the reads when
 * the page's `common.games` row moves (`commonGameUpdatedAt`) or the page's
 * channel rejoins (`resubscribeCount`), both from `GamePageCtx`.
 */
export function useGame(ctx: GamePageCtx): {
  // Null until the reads are in, and when the game is absent.
  gd: GameData | null
  loading: boolean
  // Set when a read FAILED, which is not the same as the game being absent.
  // The loader renders `<EnvelopeErrorPage>` for this, and `<NoSuchGamePage>`
  // for a game that is absent.
  failure: NotOkEnvelope | null
} {
  const { gameId } = ctx
  const [rows, setRows] = useState<GameRows | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRefetchOnGameUpdate({
    commonGameUpdatedAt: ctx.commonGameUpdatedAt,
    resubscribeCount: ctx.resubscribeCount,
    load: async ({ isCurrent }) => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `game_id` is the
      // PK, so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games_state')
          .select('target')
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
          .select('id, user_id, word, colors, is_correct')
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
        target: gameRow.target,
        events: eventsRes.data as EventRow[],
      })
      setLoading(false)
    },
  })

  // `gd` is rebuilt every render — a handful of assignments — but what an
  // effect may depend on keeps its identity: the players and the setup rows are
  // rebuilt only when the page's players or setup change, and the log only
  // when a read lands.
  const playersById = useMemo(() => makePlayersById(ctx.players), [ctx.players])
  const setup = readSetup(ctx)
  const setupRows = useMemo(
    () => makeSetupRows(setup, ctx.mode, ctx.players),
    [setup, ctx.mode, ctx.players],
  )
  const gd = rows === null
    ? null
    : makeGameData(ctx, rows, playersById, setupRows)

  return { gd, loading, failure }
}
