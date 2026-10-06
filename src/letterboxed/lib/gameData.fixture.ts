// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GSetup, GTile } from '../types'

/** setup.psql's board: four sides of three, in alphabetical order. */
export const ZTest_SIDES = 'abcdefghijkl'
/** The seeded pair: ADGJBEHK ends on K, KCFIL starts on it, and between them
 *  they cover all twelve. */
export const ZTest_SOLUTION = ['adgjbehk', 'kcfil']
/** Every word the board accepts — the pair, the short words the tests play,
 *  and `qat`. */
export const ZTest_WORDS = ['adgjbehk', 'kcfil', 'adg', 'gjb', 'beh', 'kcf', 'ila', 'qat']
/** The accepted words a hint may not offer. A FACT here: the must-reach
 *  filter lives only in SQL. */
export const ZTest_UNCLEAN_WORDS = ['ila']

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their hints and spoilers are their own rows in the
 * log.
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
  // A racer's own chain; empty unless said. In coop every seat shows the
  // shared chain, which is `ZTest_GameDataFacts.chain`'s.
  chain?: string[]
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on setup.psql's board, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  title?: string
  clubHandle?: string
  setup?: GSetup
  maxWords?: number
  // Every word the board accepts, and the ones a hint may not offer.
  words?: string[]
  uncleanWords?: string[]
  // The shared coop chain; a compete racer's is on their own facts.
  chain?: string[]
  // The whole log — every player's rows, as the blob carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Who holds the turn in a turn-order game; `undefined` is a free-for-all.
  turnHolderId?: string
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

/** How many of the twelve a chain covers, as `letterboxed._covered` counts
 *  them: the distinct letters across its words. */
export function ZTest_covered(chain: string[]): number {
  return new Set(chain.join('')).size
}

/** The box's twelve tiles in side order, as `letterboxed._make_json_tiles`
 *  writes them: each letter its own id. */
export function ZTest_makeTiles(sides: string = ZTest_SIDES): GTile[] {
  return [...sides].map((letter, i) => ({ id: letter, letter, side: Math.floor(i / 3) }))
}

/** A row of the log. A word, an undo and a clear take a turn; a hint and a
 *  spoiler do not. */
export function ZTest_event(
  id: number,
  userId: string,
  kind: GEventRaw['kind'],
  word: string | null,
  nCoveredLetters: number,
): GEventRaw {
  return {
    id,
    userId,
    kind,
    word,
    nCoveredLetters,
    tookTurn: kind === 'word' || kind === 'undo' || kind === 'clear',
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
  }
}

/**
 * Build the `game_data` blob `letterboxed._rebuild_data_cols` would write from
 * these facts: each seat's chain — the shared one in coop, each racer's own in
 * compete — a racer's two counts off it and coop's on the team, each player's
 * hints and spoilers off their rows in the log, the solution once ended, and
 * where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    title = 'ABC-DEF-GHI-JKL',
    clubHandle = 'testclub',
    setup = { extra_words: 3, legal_band: 5, timer: { kind: 'none' } },
    maxWords = 5,
    words = ZTest_WORDS,
    uncleanWords = ZTest_UNCLEAN_WORDS,
    chain: sharedChain = [],
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined
  const countOf = (p: ZTest_PlayerFacts, kind: GEventRaw['kind']) =>
    events.filter((e) => e.userId === p.id && e.kind === kind).length

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const chain = coop ? sharedChain : (p.chain ?? [])
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
      maxWords,
      nHintsUsed: countOf(p, 'hint'),
      nSpoilersUsed: countOf(p, 'spoiler'),
      board: { words: chain },
      ...(coop ? {} : { nWordsUsed: chain.length, nCoveredLetters: ZTest_covered(chain) }),
    }
  })

  return {
    id,
    gametype: `letterboxed_${mode}`,
    brand: 'SnakeBox',
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
    puzzle: {
      tiles: ZTest_makeTiles(),
      words,
      uncleanWords,
      nParWords: 2,
      solution: ended ? ZTest_SOLUTION : null,
    },
    team: coop ? { nWordsUsed: sharedChain.length, nCoveredLetters: ZTest_covered(sharedChain) } : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands letterboxed's `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeLetterboxedCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: what
  // create fixed, the board included, in the static one; the rest, the seeded
  // pair included, in game_data.
  const { id, gametype, brand, club, mode, coop, compete, oneBoard, setup, puzzle, ...changing } = raw
  const { solution, ...board } = puzzle
  return ZTest_makePlayAreaLoaderProps({
    gameId: raw.id,
    gametype: raw.gametype,
    title: raw.title,
    clubHandle: raw.club.handle,
    ended: raw.ended,
    players: raw.players.map((p) => ({
      id: p.id, username: p.username, color: p.color, ai: p.ai, stillPlaying: p.stillPlaying,
    })),
    gameData: { ...changing, puzzle: { solution } },
    staticGameData: { id, gametype, brand, club, mode, coop, compete, oneBoard, setup, puzzle: board },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
