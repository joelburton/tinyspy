// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type {
  GCatRank,
  GCategory,
  GEventRaw,
  GGameDataRaw,
  GMatchedCat,
  GPlayerRaw,
  GPuzzle,
  GSetup,
  GGuessResult,
} from '../types'

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — so a test sets the facts and never hand-writes an answer
 * the builder could not give. Their two counts are counted off their own
 * rows in the log, as `submit_guess` keeps them.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  ai?: boolean
  seat?: number | null
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
  solvedAt?: string | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play, viewed by its one player, `u1`, on the four-letter puzzle. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  puzzle?: GPuzzle
  // The whole log — every player's rows, as the blob carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A 4-category / 16-tile puzzle, its tiles in rank order. */
export const ZTest_PUZZLE: GPuzzle = {
  date: '2026-06-15',
  cats: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-06-15T00:02:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** A racer out on their fourth mistake — `lost` at once, as `submit_guess`
 *  writes it. */
export const ZTest_ELIMINATED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-06-15T00:02:00Z', reason: 'resource_exhausted', detail: 'mistakes' },
  outcome: 'lost',
}

let nextEventId = 1
/** A guess row for the log. A correct one names its category's rank; the
 *  ids count up across a test file, so a filter cannot confuse two rows. */
export function ZTest_guess(
  userId: string,
  tiles: string[],
  result: GGuessResult,
  matchedCatRank: GCatRank | null = null,
): GEventRaw {
  const id = nextEventId++
  return {
    id,
    userId,
    tiles,
    result,
    matchedCatRank,
    at: `2026-06-15T00:01:${String(id % 60).padStart(2, '0')}Z`,
  }
}

/** A correct guess of this category, by `userId`. */
export function ZTest_matchOf(cat: GCategory, userId = 'u1'): GEventRaw {
  return ZTest_guess(userId, cat.tiles, 'correct', cat.rank)
}

/**
 * Build the `game_data` blob `connections._rebuild_data_cols` would write from
 * these facts: each player's own counts off their rows, the team's summed
 * from them in coop, each seat's board folded from the log in the mode's
 * scope, and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = '2026-06-15: a-b',
    clubHandle = 'testclub',
    setup = { puzzle_id: 'p1', timer: { kind: 'none' }, coop_style: 'free-for-all' },
    puzzle = ZTest_PUZZLE,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const catByRank = new Map(puzzle.cats.map((c) => [c.rank, c]))

  const ownRows = (p: ZTest_PlayerFacts) => events.filter((e) => e.userId === p.id)
  const nMatchedOf = (p: ZTest_PlayerFacts) => ownRows(p).filter((e) => e.result === 'correct').length
  const nMistakesOf = (p: ZTest_PlayerFacts) => ownRows(p).filter((e) => e.result !== 'correct').length
  const team = coop
    ? {
        nMatchedCats: playerFacts.reduce((sum, p) => sum + nMatchedOf(p), 0),
        nMistakes: playerFacts.reduce((sum, p) => sum + nMistakesOf(p), 0),
      }
    : null

  // The board a seat shows: the bands of the rows in the mode's scope, in
  // the order they were matched, and the tiles left in the puzzle's order.
  function boardOf(p: ZTest_PlayerFacts) {
    const shown = events.filter((e) => coop || e.userId === p.id)
    const matchedCats: GMatchedCat[] = shown
      .filter((e) => e.result === 'correct')
      .map((e) => ({ ...catByRank.get(e.matchedCatRank!)!, matchedAt: e.at }))
    const banded = new Set(matchedCats.flatMap((c) => c.tiles))
    return { matchedCats, tilesLeft: puzzle.tileOrder.filter((t) => !banded.has(t)) }
  }

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: p.ai ?? false,
      seat: p.seat ?? (turnBased ? i : null),
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: p.solvedAt ?? null,
      conceded: p.ending?.reason === 'conceded',
      solved: (p.solvedAt ?? null) !== null,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      nMatchedCats: nMatchedOf(p),
      nMistakes: nMistakesOf(p),
      maxMistakes: 4,
      board: boardOf(p),
    }
  })

  return {
    id,
    gametype: `connections_${mode}`,
    brand: 'WordKnit',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: coop,
    title,
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    puzzle,
    team,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands connections' `PlayArea`, from the game's facts:
 * the `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeConnectionsCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: raw,
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
