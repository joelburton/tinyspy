// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import { BOARD_SIZE, cellIndex } from './board'
import type { GAiLevel, GEventRaw, GGameDataRaw, GPlayerRaw, GSetup } from '../types'

/** A rack of seven, the default for every rack a test does not name. */
export const ZTest_RACK = ['c', 'a', 't', 's', 'e', 'r', '?']

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their score is off their rows in the log.
 */
export type ZTest_PlayerFacts = {
  id: string
  username: string
  color?: string
  // A bot's strength; a person when absent.
  aiLevel?: GAiLevel
  seat?: number | null
  // Compete: this player's rack; `ZTest_RACK` when absent. Ignored in coop.
  rack?: string[]
  ending?: PlayerRaw['ending']
  outcome?: PlayerRaw['outcome']
  finalRanking?: number | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on an empty board, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  version?: number
  nBagTiles?: number
  clubHandle?: string
  setup?: GSetup
  // Coop: the team's rack; `ZTest_RACK` when absent. Ignored in compete.
  teamRack?: string[]
  // The whole log — every player's rows, as the blob carries it. The board
  // is the words' placements laid down in order, as the server builds it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Who holds the turn; `undefined` is a coop free-for-all. Compete always
  // has one, the first player when absent.
  turnHolderId?: string
  ending?: GameDataRaw['ending']
  outcome?: GameDataRaw['outcome']
}

/** A player's ending columns, as `common._concede` writes them. */
export const ZTest_CONCEDED: Pick<ZTest_PlayerFacts, 'ending' | 'outcome'> = {
  ending: { at: '2026-09-03T00:00:00Z', reason: 'conceded', detail: 'conceded' },
  outcome: 'lost',
}

const at = (id: number) => `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`

/** A word play: its placements as the blob writes them (`"x,y:c"`, a capital
 *  for a blank), the words it formed and their score. It takes the player's
 *  go; `tile_count` is an exchange's, so a word's is null. */
export function ZTest_word(
  id: number,
  userId: string,
  placements: string[],
  words: string[],
  score: number,
): GEventRaw {
  return {
    id, userId, kind: 'word', placements, words, score,
    nTiles: null, tookTurn: true, at: at(id),
  }
}

/** An exchange of `nTiles` tiles. It takes the player's go. */
export function ZTest_exchange(id: number, userId: string, nTiles: number): GEventRaw {
  return {
    id, userId, kind: 'exchange', placements: null, words: null, score: null,
    nTiles, tookTurn: true, at: at(id),
  }
}

/** A pass. It takes the player's go. */
export function ZTest_pass(id: number, userId: string): GEventRaw {
  return {
    id, userId, kind: 'pass', placements: null, words: null, score: null,
    nTiles: null, tookTurn: true, at: at(id),
  }
}

/** A rack's leftovers at the end: `score` is negative. The ending wrote it, so
 *  it took no go. */
export function ZTest_leftovers(id: number, userId: string, score: number, nTiles: number): GEventRaw {
  return {
    id, userId, kind: 'leftovers', placements: null, words: null, score,
    nTiles, tookTurn: false, at: at(id),
  }
}

/** The going-out bonus: the others' leftovers, positive. */
export function ZTest_wentOut(id: number, userId: string, score: number): GEventRaw {
  return {
    id, userId, kind: 'went_out', placements: null, words: null, score,
    nTiles: null, tookTurn: false, at: at(id),
  }
}

/** The board string the words lay down, in the order of play. */
function makeLetters(events: readonly GEventRaw[]): string {
  const cells = Array<string>(BOARD_SIZE * BOARD_SIZE).fill('.')
  for (const e of events) {
    for (const p of e.placements ?? []) {
      const [xy, ch] = p.split(':')
      const [x, y] = xy.split(',').map(Number)
      cells[cellIndex(x, y)] = ch
    }
  }
  return cells.join('')
}

const sumScores = (rows: readonly GEventRaw[]) => rows.reduce((n, e) => n + (e.score ?? 0), 0)

/**
 * Build the `game_data` blob `scrabble._rebuild_data_cols` would write from
 * these facts: the board laid down by the words, each player's score off
 * their rows in the log (a coop table's leftovers are the team's alone), the
 * team's score the players' sum and the leftovers, and where every player
 * stands derived. Every rack is in it, as the builder writes it.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    version = 0,
    nBagTiles = 86,
    clubHandle = 'testclub',
    setup = { dict_2: 3, dict_3plus: 3, timer: { kind: 'none' }, ai_count: 0, ai_level: 'strong', coop_style: 'free-for-all' },
    teamRack = ZTest_RACK,
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId = mode === 'compete' ? playerFacts[0].id : undefined,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const rows = events.filter((e) => e.userId === p.id && (!coop || e.kind !== 'leftovers'))
    const rack = coop ? null : p.rack ?? ZTest_RACK
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: p.aiLevel !== undefined,
      seat: p.seat ?? (turnBased ? i : null),
      ending: p.ending ?? null,
      outcome: p.outcome ?? null,
      finalRanking: p.finalRanking ?? null,
      solvedAt: null,
      conceded: p.ending?.reason === 'conceded',
      solved: false,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      aiLevel: p.aiLevel ?? null,
      score: sumScores(rows),
      rack,
      nRackTiles: rack === null ? null : rack.length,
    }
  })

  return {
    id,
    gametype: `scrabble_${mode}`,
    brand: 'RackAttack',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    oneBoard: true,
    title: `#${id.slice(0, 6).toUpperCase()}`,
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    version,
    nBagTiles,
    board: { letters: makeLetters(events) },
    team: coop
      ? {
        rack: teamRack,
        score: players.reduce((n, p) => n + p.score, 0)
          + sumScores(events.filter((e) => e.kind === 'leftovers')),
        nRackTiles: teamRack.length,
      }
      : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands scrabble's `PlayArea`, from the game's facts:
 * the `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeScrabbleCtx(
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
