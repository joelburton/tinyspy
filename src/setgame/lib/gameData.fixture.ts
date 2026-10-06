// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type { GEventRaw, GGameDataRaw, GPlayerRaw, GSetup, GTile } from '../types'

/** A twelve-tile table whose first three tiles are a set (same count, color and
 *  fill, all three shapes) — and so is every row of three after them. */
export const ZTest_BOARD_IDS = [
  '1111', '1112', '1113', '1121', '1122', '1123',
  '1131', '1132', '1133', '1211', '1212', '1213',
]

/** Tiles from their ids, as `setgame._make_json_tiles` writes them. */
export function ZTest_makeTiles(ids: readonly string[] = ZTest_BOARD_IDS): GTile[] {
  return ids.map((id) => ({ id }))
}

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their counts are off their rows in the log.
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
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on `ZTest_BOARD_IDS`, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  // The table's tiles, by id, in slot order.
  boardIds?: string[]
  nTilesInDeck?: number
  clubHandle?: string
  setup?: GSetup
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

const at = (id: number) => `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`

/** A claim of three tiles, the table after it as given (unchanged unless
 *  said); a claim takes the claimer's go. */
export function ZTest_claim(
  id: number,
  userId: string,
  tileIds: string[],
  boardAfterIds: readonly string[] = ZTest_BOARD_IDS,
): GEventRaw {
  return {
    id, userId, kind: 'claim', tiles: ZTest_makeTiles(tileIds),
    boardAfter: ZTest_makeTiles(boardAfterIds), tookTurn: true, at: at(id),
  }
}

/** A hint showing one to three tiles; it changes no tile and takes no go. */
export function ZTest_hint(
  id: number,
  userId: string,
  tileIds: string[],
  boardAfterIds: readonly string[] = ZTest_BOARD_IDS,
): GEventRaw {
  return {
    id, userId, kind: 'hint', tiles: ZTest_makeTiles(tileIds),
    boardAfter: ZTest_makeTiles(boardAfterIds), tookTurn: false, at: at(id),
  }
}

/**
 * Build the `game_data` blob `setgame._rebuild_data_cols` would write from
 * these facts: the table, the deck's count, each player's own counts off their
 * rows in the log and coop's summed on the team, and where every player
 * stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    boardIds = ZTest_BOARD_IDS,
    nTilesInDeck = 69,
    clubHandle = 'testclub',
    setup = { timer: { kind: 'none' }, deck: 'full', palette: 'traditional', coop_style: 'free-for-all' },
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined

  const players = playerFacts.map(function makePlayer(p, i): GPlayerRaw {
    const stillPlaying = !ended && (p.ending ?? null) === null
    const onTurn = stillPlaying && (!turnBased || turnHolderId === p.id)
    const rows = events.filter((e) => e.userId === p.id)
    return {
      id: p.id,
      username: p.username,
      color: p.color ?? 'red',
      ai: p.ai ?? false,
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
      nSetsFound: rows.filter((e) => e.kind === 'claim').length,
      nHintsUsed: rows.filter((e) => e.kind === 'hint').length,
    }
  })

  return {
    id,
    gametype: `setgame_${mode}`,
    brand: 'HareTrigger',
    club: { handle: clubHandle },
    mode,
    coop,
    compete: !coop,
    title: `#${id.slice(0, 6).toUpperCase()}`,
    setup,
    turns: turnBased ? { holder: turnHolderId } : null,
    ending,
    ended,
    outcome,
    board: { tiles: ZTest_makeTiles(boardIds) },
    nTilesInDeck,
    team: coop
      ? {
        nSetsFound: players.reduce((n, p) => n + p.nSetsFound, 0),
        nHintsUsed: players.reduce((n, p) => n + p.nHintsUsed, 0),
      }
      : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands setgame's `PlayArea`, from the game's facts:
 * the `game_data` and `static_game_data` blobs, and shell_data's roster read
 * off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeSetgameCtx(
  facts: ZTest_GameDataFacts = {},
  over: Omit<ZTest_PlayAreaFacts, 'players' | 'gameData' | 'staticGameData'> = {},
): PlayAreaLoaderProps {
  const raw = ZTest_makeGameDataRaw(facts)
  // The two blobs the page hands down, split as the builders write them: the
  // common part create fixed in the static one; the rest in game_data.
  const { id, gametype, brand, club, mode, coop, compete, setup, ...changing } = raw
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
    staticGameData: { id, gametype, brand, club, mode, coop, compete, setup },
    auth: { user: { id: 'u1' } } as unknown as Session,
    ...over,
  })
}
