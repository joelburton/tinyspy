// cs-blessed-psychicnum

import { useMemo, useState } from 'react'
import { useRefetchOnGameUpdate } from '@/common/game-page/useRefetchOnGameUpdate'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { solvedByMe } from '@/common/reveal/describeReveal'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { EndOutcome, GameEnding, PlayerEndedReason } from '@/common/terminal/gameEnding'
import { db } from '../db'
import type { GamePlayer, Member } from '@/common/members/member'
import type { SetupRow } from '@/common/setup-form/setupRows'
import type { PsychicnumSetup } from '../lib/setup'
import { makeSetupRows } from '../lib/setupRows'
import type { PsychicnumGameStatus, PsychicnumPlayerStatus } from '../lib/statuses'
import type { TileResults, TileWord } from '../lib/tileResults'

/**
 * One row from `psychicnum.events`. In coop the FE receives
 * every player's guess; in compete the RLS policy filters
 * server-side so the FE only ever receives its own user_id's
 * rows. PlayArea renders them the same way either way; the
 * filtering is invisible to the FE.
 */
export type EventRow = {
  // The row's own id, and the order of play.
  id: number
  user_id: string
  // The text this row carries. For 'guess'/'spoiler' it's a `TileWord`; for
  // 'hint' it's the CLUE text (or "No hint available"), which is why this is
  // a plain string.
  word: string
  is_correct: boolean
  // 'guess' = a real guess (colors the board, counts toward the win);
  // 'spoiler' = a secret word handed over (the answer);
  // 'hint' = a clue for a secret.
  kind: 'guess' | 'hint' | 'spoiler'
  created_at: string
}

/** One player of this game, as `gd` holds them: who they are (a `Member`, so
 *  a player can go wherever a member is taken), and this game's facts about
 *  them. */
export type PsychicnumPlayer = Member & {
  // Null while this player plays on; set once their play ended while the game
  // went on — out of guesses in compete, or conceded.
  playerEnding: {
    at: string
    reason: PlayerEndedReason
    reasonDetail: string
  } | null
  // How they came out; both null until the game ends.
  outcome: EndOutcome | null
  finalRanking: number | null
  solvedAt: string | null
  // Their own counts, in both modes; coop's team numbers are the sums.
  foundSecretsCount: number
  guessesUsed: number
  // They found every secret the board hides: the win, in compete.
  foundAllSecrets: boolean
}

/**
 * **`gd`, the game data** — everything the play surface knows about THIS
 * game, in one object grouped by what each value means. Where a value came
 * from (the page's `common.games` row, a status copy, psychicnum's own tables)
 * is `makeGameData`'s business, never the reader's.
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
  setup: PsychicnumSetup
  // The setup's choices as rows, built ONCE for both readers — the info column
  // renders them as <li>s, the printout prints the same array
  // (common/setup-form/doc.md → Setup rows). Literally the same object, which
  // beats "both call the same function": this is the game whose two
  // hand-written lists had drifted into reporting different facts on paper
  // than on screen.
  setupRows: SetupRow[]
  // The three secret words; null until the game ends (the view hands them
  // over then).
  secrets: TileWord[] | null
  // The state line's four counts ("1/3 found · 4/7 guesses used").
  readout: {
    // How many secrets the board hides.
    requiredSecretsCount: number
    // The guess budget: the team's in coop, each player's own in compete.
    maxGuesses: number
    // The counts that apply to me: the team's in coop, my own in compete.
    // SPECTATING: a club member watching a compete game has none, so reads as
    // nothing found and the budget spent.
    foundSecretsCount: number
    guessesUsed: number
  }
  isTurnBased: boolean
  // The turn pointer as stored; a record, not a claim — it outlives the end.
  turnHolderId: string | null
  // The player it names; null in a free-for-all game.
  turnHolder: PsychicnumPlayer | null
  // How the game ended; null while it is played.
  gameEnding: GameEnding | null
  isGameEnded: boolean
  // Compete's winner, the one who completed the set; null until someone has,
  // and always null in coop, where the team wins together.
  winner: PsychicnumPlayer | null
  board: {
    // The words shown as tiles; three of them are the secrets.
    words: TileWord[]
    // Each guessed word, and whether it was a secret — the board's permanent
    // green and red. Hint and spoiler rows mark no tile.
    tileResults: TileResults
    // Each guessed word → who guessed it.
    decidedBy: ReadonlyMap<TileWord, PsychicnumPlayer>
    // How many guesses have been made — what tells the attention flash a
    // board changed by being played into.
    guessCount: number
  }
  // The log: guesses, hints and spoilers, in the order of play. RLS scopes it
  // to my own rows in compete until the game ends.
  events: EventRow[]
  // The players in seat order, and the same objects keyed by user id.
  players: PsychicnumPlayer[]
  playersById: Record<string, PsychicnumPlayer>
  // My entry in `playersById`; null for a club member watching.
  me: PsychicnumPlayer | null
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
    // I completed the puzzle — in coop, my team did (docs/win-lose.md →
    // `solved`). Finding all three IS the win here, so it is also the win
    // that is mine.
    hasSolved: boolean
  }
}

/** What psychicnum's own reads bring back: the `games_state` view's board and
 *  secrets, and the log. */
type GameRows = {
  words: TileWord[]
  secrets: TileWord[] | null
  events: EventRow[]
}

/**
 * The page's players as `gd` holds them, keyed by user id. Each one's counts
 * and ending reason come from their `player_status`, the rest from
 * `common.game_players`.
 */
export function makePlayersById(
  gamePlayers: GamePlayer[],
  requiredSecretsCount: number,
): Record<string, PsychicnumPlayer> {
  const players = gamePlayers.map(function makePlayer(p): PsychicnumPlayer {
    const playerStatus = p.player_status as unknown as PsychicnumPlayerStatus
    const endedReason = playerStatus.player_ended_reason
    return {
      id: p.id,
      username: p.username,
      color: p.color,
      playerEnding:
        endedReason !== null && p.player_ended_at !== null
          ? { at: p.player_ended_at, reason: endedReason, reasonDetail: p.player_ended_reason_detail ?? '' }
          : null,
      outcome: p.outcome,
      finalRanking: p.final_ranking,
      solvedAt: p.solved_at,
      foundSecretsCount: playerStatus.found_secrets_count,
      guessesUsed: playerStatus.guesses_used,
      foundAllSecrets: playerStatus.found_secrets_count >= requiredSecretsCount,
    }
  })
  return Object.fromEntries(players.map((p) => [p.id, p]))
}

/** The page's `game_status`, as psychicnum's builder writes it. */
export function readGameStatus(ctx: PlayAreaLoaderProps): PsychicnumGameStatus {
  return ctx.cg.game_status as unknown as PsychicnumGameStatus
}

/** The page's setup blob, as psychicnum's setup form wrote it. */
export function readSetup(ctx: PlayAreaLoaderProps): PsychicnumSetup {
  return ctx.cg.setup as unknown as PsychicnumSetup
}

/**
 * Build `gd` from the page's values and psychicnum's own rows. A fact the
 * statuses carry is read from them (the budget and the secret count from
 * `game_status`, each player's from their `player_status`, in
 * `makePlayersById`); everything else from the tables. `playersById` and
 * `setupRows` are handed in, already built, so the caller can hold their
 * identity across renders.
 */
export function makeGameData(
  ctx: PlayAreaLoaderProps,
  rows: GameRows,
  playersById: Record<string, PsychicnumPlayer>,
  setupRows: SetupRow[],
): GameData {
  const { cg } = ctx
  const gameStatus = readGameStatus(ctx)
  const isCompete = cg.mode === 'compete'
  const maxGuesses = gameStatus.max_guesses
  const me = playersById[ctx.authSession.user.id] ?? null
  const players = Object.values(playersById)

  // No secret can be found twice and each guess is one player's, so coop's
  // sums count every find and every guess once.
  const teamFoundSecretsCount = players.reduce((sum, p) => sum + p.foundSecretsCount, 0)
  const teamGuessesUsed = players.reduce((sum, p) => sum + p.guessesUsed, 0)

  // The board's marks come from the guess rows alone. A revealed secret is not
  // among them, which is what keeps it dot-less: nobody guessed it.
  const guesses = rows.events.filter((e) => e.kind === 'guess')

  return {
    gameId: cg.id,
    mode: cg.mode,
    isCompete,
    isSharedBoard: !isCompete && players.length > 1,
    title: cg.title,
    setup: readSetup(ctx),
    setupRows,
    secrets: rows.secrets,
    readout: {
      requiredSecretsCount: gameStatus.required_secrets_count,
      maxGuesses,
      foundSecretsCount: isCompete ? (me?.foundSecretsCount ?? 0) : teamFoundSecretsCount,
      guessesUsed: isCompete ? (me?.guessesUsed ?? maxGuesses) : teamGuessesUsed,
    },
    isTurnBased: cg.turns.isTurnBased,
    turnHolderId: cg.turns.turnHolderId,
    turnHolder: cg.turns.turnHolderId === null
      ? null
      : (playersById[cg.turns.turnHolderId] ?? null),
    gameEnding: cg.gameEnding,
    isGameEnded: cg.isGameEnded,
    winner: isCompete ? (players.find((p) => p.outcome === 'won') ?? null) : null,
    board: {
      words: rows.words,
      tileResults: new Map(guesses.map((guess) => [guess.word, guess.is_correct])),
      // Every guess is a seated player's: a player's rows go with their
      // profile (`on delete cascade`), so the lookup cannot miss.
      decidedBy: new Map(guesses.map((guess) => [guess.word, playersById[guess.user_id]!])),
      guessCount: guesses.length,
    },
    events: rows.events,
    players,
    playersById,
    me,
    standing: {
      isPlayer: cg.standing.isPlayer,
      isConceded: cg.standing.isConceded,
      isPlayerEnded: cg.standing.isLocallyTerminal,
      isStillPlaying: cg.standing.isStillPlaying,
      isMyTurn: cg.standing.isMyTurn,
      isWaitingForTurn: cg.standing.isWaitingForTurn,
      isBoardInteractive: cg.standing.isBoardInteractive,
      hasSolved: solvedByMe({
        isCompete,
        gameOutcome: cg.gameEnding?.outcome ?? null,
        mine: me?.foundAllSecrets ?? false,
      }),
    },
  }
}

/**
 * Per-gametype data hook for psychicnum (both modes share it): `gd`, the game
 * data, built from the page's values and psychicnum's own two reads — the
 * `games_state` view (the board, and the secrets once ended) and `events`
 * (the log; RLS scopes it to the caller in compete).
 *
 * It keeps no subscription: `useRefetchOnGameUpdate` reruns the reads when
 * the page's `common.games` row moves (`cg.updated_at`) or the page's channel
 * rejoins (`resubscribeCount`).
 *
 * The cross-cutting machinery (members, presence, manual-pause,
 * timer) lives on `useCommonGame` inside `GamePage` — see
 * `src/common/game-page/useCommonGame.ts`.
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
  const [rows, setRows] = useState<GameRows | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRefetchOnGameUpdate({
    commonGameUpdatedAt: cg.updated_at,
    resubscribeCount: ctx.resubscribeCount,
    load: async ({ isCurrent }) => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `game_id` is the
      // PK, so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games_state')
          .select('words, secrets')
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
      // A load that worked clears a previous one's failure: this refetches on
      // every move and every rejoin, so an outage that ends should take its
      // sentence with it rather than leaving the surface behind a stale
      // explanation. Cleared HERE, before the zero-rows return below, so a game
      // deleted during the outage reads as "not found" rather than as the
      // outage.
      setFailure(null)

      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const gameData = gameRes.data[0]
      if (!gameData) {
        setRows(null)
        setLoading(false)
        return
      }

      const eventsRes = await readRows(
        db
          .from('events')
          .select('id, user_id, word, is_correct, kind, created_at')
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
        words: gameData.words as TileWord[],
        secrets: gameData.secrets as TileWord[] | null,
        events: eventsRes.data as EventRow[],
      })
      setLoading(false)
    },
  })

  // `gd` is rebuilt every render — a handful of assignments — but what an
  // effect may depend on keeps its identity: the players and the setup rows are
  // rebuilt only when the page's players or setup change, and the board and
  // the log only when a read lands.
  const requiredSecretsCount = readGameStatus(ctx).required_secrets_count
  const playersById = useMemo(
    () => makePlayersById(cg.players, requiredSecretsCount),
    [cg.players, requiredSecretsCount],
  )
  const setup = readSetup(ctx)
  const setupRows = useMemo(
    () => makeSetupRows(setup, cg.mode, cg.players),
    [setup, cg.mode, cg.players],
  )
  const gd = rows === null ? null : makeGameData(ctx, rows, playersById, setupRows)

  return { gd, loading, failure }
}
