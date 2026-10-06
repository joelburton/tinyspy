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
  GPuzzleRaw,
  GSetup,
  GTile,
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
  puzzle?: GPuzzleRaw
  // The whole log — every player's rows, as the blob carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A tile as the builder writes it: the word, which is its id too. */
export const ZTest_tile = (word: string): GTile => ({ id: word, word })

/** A 4-category / 16-tile puzzle, its tiles in rank order. */
export const ZTest_PUZZLE: GPuzzleRaw = {
  date: '2026-06-15',
  cats: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'].map(ZTest_tile) },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'].map(ZTest_tile) },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'].map(ZTest_tile) },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'].map(ZTest_tile) },
  ],
  tiles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'].map(ZTest_tile),
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
  return ZTest_guess(userId, cat.tiles.map((t) => t.id), 'correct', cat.rank)
}

/**
 * Build the `game_data` blob `connections._rebuild_data_cols` would write from
 * these facts: each player's own counts off their rows, the team's facts in
 * coop (the counts summed, the one board), a racer's own board in compete —
 * each board folded from the log — and where every player stands derived.
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
  // A board from its rows: the bands, in the order they were matched, and the
  // tiles left in the puzzle's order.
  function makeBoard(rows: GEventRaw[]) {
    const matchedCats: GMatchedCat[] = rows
      .filter((e) => e.result === 'correct')
      .map((e) => ({ ...catByRank.get(e.matchedCatRank!)!, matchedAt: e.at }))
    const banded = new Set(matchedCats.flatMap((c) => c.tiles.map((t) => t.id)))
    return { matchedCats, tilesLeft: puzzle.tiles.filter((t) => !banded.has(t.id)) }
  }

  const team = coop
    ? {
        nMatchedCats: playerFacts.reduce((sum, p) => sum + nMatchedOf(p), 0),
        nMistakes: playerFacts.reduce((sum, p) => sum + nMistakesOf(p), 0),
        maxMistakes: 4,
        board: makeBoard(events),
      }
    : null

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
      // Coop's one board is the team's.
      board: coop ? null : makeBoard(ownRows(p)),
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
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeConnectionsCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed, the puzzle whole, in the static one; the rest in game_data.
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
