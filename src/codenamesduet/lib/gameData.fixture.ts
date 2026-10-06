// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { DEFAULT_CODENAMESDUET_SETUP } from './setup'
import type { GEventRaw, GGameDataRaw, GKey, GPlayerRaw, GSetup, GTileRaw } from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — so a test sets the facts and never hand-writes an answer
 * the builder could not give.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/**
 * The facts a test sets up about a game. Everything else is a fresh 9-turn
 * game between `u1` (seat A, who opens) and `u2` (seat B), viewed by `u1`.
 */
export type ZTest_GameDataFacts = {
  id?: string
  title?: string
  clubHandle?: string
  setup?: GSetup
  // The two players, seat A then seat B.
  players?: [ZTest_PlayerFacts, ZTest_PlayerFacts]
  // The 25 words, by position.
  words?: string[]
  // Each seat's key, by position.
  keyA?: GKey[]
  keyB?: GKey[]
  // The turn being played, and the seat holding the clue (null in sudden
  // death and once the game has ended).
  turnNum?: number
  clueSeat?: 'A' | 'B' | null
  // Every clue, guess, pass and hint, in order. The board's marks are read off
  // the guesses, as `submit_guess` writes them.
  events?: GEventRaw[]
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** Seat A's key: agents at 0–8, the assassin at 9, bystanders after. */
export const ZTest_KEY_A: GKey[] = [...'GGGGGGGGGANNNNNNNNNNNNNNN'] as GKey[]
/** Seat B's key: agents at 6–14, the assassin at 15, bystanders elsewhere. */
export const ZTest_KEY_B: GKey[] = [...'NNNNNNGGGGGGGGGANNNNNNNNN'] as GKey[]

const WORDS = Array.from({ length: 25 }, (_, i) => `word${i}`)

/** A clue event, as the blob carries it. */
export function ZTest_clue(
  id: number,
  userId: string,
  turnNum: number,
  word: string,
  count: number,
  fromAi = false,
): GEventRaw {
  return {
    id, userId, kind: 'clue', turnNum, tookTurn: false, at: '2026-06-15T00:01:00Z',
    clueWord: word, clueCount: count, clueFromAi: fromAi, tileId: null, result: null,
    // Written by `ZTest_makeGameDataRaw` from the turn and the budget.
    suddenDeath: false,
  }
}

/** A guess event: the tile and what it turned over as. `tookTurn` when it
 *  ended the turn (a bystander, or anything in sudden death). */
export function ZTest_guess(
  id: number,
  userId: string,
  turnNum: number,
  position: number,
  result: GKey,
  tookTurn = result === 'N',
): GEventRaw {
  return {
    id, userId, kind: 'guess', turnNum, tookTurn, at: '2026-06-15T00:02:00Z',
    clueWord: null, clueCount: null, clueFromAi: null, tileId: String(position), result,
    suddenDeath: false,
  }
}

/**
 * Build the `game_data` blob `codenamesduet._rebuild_data_cols` would write
 * from these facts: the deal with both keys, the table read off the guesses,
 * the team's counts, the turn's holder and clue as `_point_turn` decides them,
 * and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    title = 'WORD0-WORD1-WORD2',
    clubHandle = 'testclub',
    setup = { ...DEFAULT_CODENAMESDUET_SETUP, first_clue_giver_user_id: 'u1' },
    players: [factsA, factsB] = [
      { id: 'u1', username: 'me', color: 'red' },
      { id: 'u2', username: 'leah', color: 'blue' },
    ],
    words = WORDS,
    keyA = ZTest_KEY_A,
    keyB = ZTest_KEY_B,
    turnNum = 1,
    clueSeat = 'A',
    events = [],
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const maxTurns = setup.turns
  const seatOf = (userId: string): 'A' | 'B' => (userId === factsA.id ? 'A' : 'B')
  const idOf = (seat: 'A' | 'B') => (seat === 'A' ? factsA.id : factsB.id)

  // The table, as `submit_guess` writes it: an agent or the assassin is
  // revealed for both; a bystander marks the guesser's seat only.
  const revealedAs: (GKey | null)[] = Array(25).fill(null)
  const neutral = { A: Array(25).fill(false) as boolean[], B: Array(25).fill(false) as boolean[] }
  for (const e of events) {
    if (e.kind !== 'guess') continue
    const pos = Number(e.tileId)
    if (e.result === 'N') neutral[seatOf(e.userId)][pos] = true
    else revealedAs[pos] = e.result
  }

  const tiles: GTileRaw[] = words.map((_, pos) => {
    const shown = revealedAs[pos]
    const markedBy = (['A', 'B'] as const).filter((s) => neutral[s][pos]).map(idOf)
    return {
      id: String(pos),
      revealed: shown !== null
        ? { as: shown, arrows: [] }
        : markedBy.length > 0 ? { as: 'N', arrows: markedBy } : null,
      guessableBy: shown !== null
        ? []
        : (['A', 'B'] as const).filter((s) => !neutral[s][pos]).map(idOf),
    }
  })

  // A seat's agents are the G cells on its own key; it is done when every one
  // is contacted.
  const agentsFound = (key: GKey[]) => key.every((k, pos) => k !== 'G' || revealedAs[pos] === 'G')

  const playedOnTurn = events.some((e) => e.turnNum === turnNum && e.kind !== 'hint')
  const nTurnsUsed = Math.min(turnNum - 1 + (ended && playedOnTurn ? 1 : 0), maxTurns)
  const suddenDeath = turnNum > maxTurns

  const clue = events.find((e) => e.kind === 'clue' && e.turnNum === turnNum) ?? null
  // `_point_turn`'s rule: the clue-giver until the clue is in, then the
  // guesser; in sudden death, the one player with words left, else nobody.
  // An ended game's pointer is not read.
  const doneA = agentsFound(keyA)
  const doneB = agentsFound(keyB)
  const holder = ended
    ? null
    : suddenDeath
      ? doneA === doneB ? null : doneA ? factsA.id : factsB.id
      : clueSeat === null
        ? null
        : clue === null ? idOf(clueSeat) : idOf(clueSeat === 'A' ? 'B' : 'A')

  const players = [factsA, factsB].map(function makePlayer(p, seat): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && holder === p.id
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: false,
      seat,
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: p.solvedAt ?? null,
      conceded: false,
      solved: (p.solvedAt ?? null) !== null,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      clueGiver: !ended && clueSeat === seatOf(p.id),
      allAgentsFound: agentsFound(seat === 0 ? keyA : keyB),
    }
  })

  return {
    id,
    gametype: 'codenamesduet',
    brand: 'TinySpy',
    club: { handle: clubHandle },
    mode: 'coop',
    coop: true,
    compete: false,
    title,
    setup,
    turns: {
      holder,
      num: turnNum,
      currClue: clue === null
        ? null
        : { word: clue.clueWord!, count: clue.clueCount!, fromAi: clue.clueFromAi!, userId: clue.userId },
    },
    ending,
    ended,
    outcome,
    puzzle: {
      tiles: words.map((word, pos) => ({
        id: String(pos),
        word,
        key: { [factsA.id]: keyA[pos]!, [factsB.id]: keyB[pos]! },
      })),
    },
    team: {
      nFoundAgents: revealedAs.filter((r) => r === 'G').length,
      nTurnsUsed,
      maxTurns,
      suddenDeath,
      board: { tiles },
    },
    // A row's turn past the budget was played in sudden death, as the builder writes it.
    events: events.map((e) => ({ ...e, suddenDeath: e.turnNum > maxTurns })),
    players,
  }
}

/**
 * The props `<GamePage>` hands codenamesduet's `PlayArea`, from the game's
 * facts: the `game_data` and `static_game_data` blobs, and shell_data's roster
 * read off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeCodenamesduetCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed, the deal whole, in the static one; the rest in game_data.
  const { id, gametype, brand, club, mode, coop, compete, setup, puzzle, ...changing } = raw
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: changing,
    staticGameData: { id, gametype, brand, club, mode, coop, compete, setup, puzzle },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
