// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import type { GameDataRaw, PlayerRaw } from '@/common/game-page/gameData'
import type {
  GEventRaw,
  GGameDataRaw,
  GPlayerRaw,
  GResult,
  GSetup,
  GTile,
  GWordRaw,
} from '../types'

/** setup.psql's board: one hidden word per row, row 4 the spangram, and each
 *  of rows 0–3 starting with a four-letter hint word ('zzqa' …). */
export const ZTest_BOARD = ['zzqabc', 'zzqbde', 'zzqcfg', 'zzqdhi', 'zzqejk', 'zzqflm', 'zzqgno', 'zzqhpr']

/** The ids of the first `n` tiles of row `r`, left to right: that row's
 *  hidden word at 6, its hint word at 4. */
export function ZTest_rowIds(r: number, n = 6): string[] {
  return Array.from({ length: n }, (_, c) => `${r},${c}`)
}

/** The hidden words, spangram first, as `strands._make_json_words` writes them. */
export const ZTest_WORDS: GWordRaw[] = [4, 0, 1, 2, 3, 5, 6, 7].map((r) => ({
  word: ZTest_BOARD[r]!,
  tileIds: ZTest_rowIds(r),
  spangram: r === 4,
}))

/**
 * The facts a test sets up about one player. Where they stand is DERIVED the
 * way `common._make_json_player` derives it — from their ending, the game's
 * end and the turn — and their counts and board are off their rows in the log.
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
  // A racer's own bar and ringed hint (compete); coop's are the game's.
  hintPoints?: number
  hintTileIds?: string[] | null
}

/** The facts a test sets up about a game. Everything else is a solo coop game
 *  in play on setup.psql's board, viewed by its one player, `u1`. */
export type ZTest_GameDataFacts = {
  id?: string
  mode?: 'coop' | 'compete'
  // The board's rows; setup.psql's unless said.
  board?: string[]
  // The theme prompt, and the game's title `create_game` makes of it.
  puzzleTitle?: string
  title?: string
  clubHandle?: string
  setup?: GSetup
  // The whole log — every player's rows, as the blob carries it.
  events?: GEventRaw[]
  players?: ZTest_PlayerFacts[]
  // Coop's one bar and ringed hint, on the team and every seat's board.
  hintPoints?: number
  hintTileIds?: string[] | null
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

/** The board's 48 tiles, row by row, as `strands._make_json_tiles` writes them. */
export function ZTest_makeTiles(board: readonly string[] = ZTest_BOARD): GTile[] {
  return board.flatMap((letters, row) =>
    [...letters].map((letter, col) => ({ id: `${row},${col}`, letter, row, col })))
}

const at = (id: number) => `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`

/** A trace, which spells what its tiles spell on `board`. A find or a hint
 *  word takes a turn; a miss does not. */
export function ZTest_guess(
  id: number,
  userId: string,
  tileIds: string[],
  result: GResult,
  board: readonly string[] = ZTest_BOARD,
): GEventRaw {
  const word = tileIds.map((t) => {
    const [r, c] = t.split(',').map(Number)
    return board[r!]![c!]!
  }).join('')
  return {
    id, userId, kind: 'guess', word, result, tileIds,
    tookTurn: result === 'theme' || result === 'spangram' || result === 'hint_word',
    at: at(id),
  }
}

/** Row `r`'s hidden word found: the spangram on row 4, a theme word elsewhere. */
export function ZTest_find(id: number, userId: string, r: number): GEventRaw {
  return ZTest_guess(id, userId, ZTest_rowIds(r), r === 4 ? 'spangram' : 'theme')
}

/** A cashed hint, ringing `tileIds`; it says no word and takes no turn. */
export function ZTest_hint(id: number, userId: string, tileIds: string[]): GEventRaw {
  return { id, userId, kind: 'hint', word: null, result: null, tileIds, tookTurn: false, at: at(id) }
}

/**
 * Build the `game_data` blob `strands._rebuild_data_cols` would write from
 * these facts: each seat's board — the shared one in coop, each racer's own in
 * compete — with the words found on it; each player's own counts off their
 * rows in the log, and coop's on the team with the one bar; the words once
 * ended; and where every player stands derived.
 */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  const {
    id = 'g1',
    mode = 'coop',
    board = ZTest_BOARD,
    puzzleTitle = 'Rows of nonsense',
    title = `1999-01-01: ${puzzleTitle}`,
    clubHandle = 'testclub',
    setup = { band: 5, hint_cost: 3, min_word_length: 4, timer: { kind: 'none' }, coop_style: 'free-for-all' },
    events = [],
    players: playerFacts = [{ id: 'u1', username: 'me', color: 'red' }],
    hintPoints = 0,
    hintTileIds = null,
    turnHolderId,
    ending = null,
    outcome = null,
  } = facts
  const ended = ending !== null
  const coop = mode === 'coop'
  const turnBased = turnHolderId !== undefined

  const isFind = (e: GEventRaw) => e.result === 'theme' || e.result === 'spangram'
  const wordsOf = (rows: GEventRaw[]): GWordRaw[] =>
    rows.filter(isFind).map((e) => ({ word: e.word!, tileIds: e.tileIds, spangram: e.result === 'spangram' }))

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
      solvedAt: p.solvedAt ?? null,
      conceded: p.ending?.reason === 'conceded',
      solved: (p.solvedAt ?? null) !== null,
      stillPlaying,
      onTurn,
      waitingForTurn: stillPlaying && !onTurn,
      nFoundWords: rows.filter(isFind).length,
      nHintsUsed: rows.filter((e) => e.kind === 'hint').length,
      hintPoints: coop ? null : (p.hintPoints ?? 0),
      board: {
        words: wordsOf(coop ? events : rows),
        hintTileIds: coop ? hintTileIds : (p.hintTileIds ?? null),
      },
    }
  })

  return {
    id,
    gametype: `strands_${mode}`,
    brand: 'PaulPath',
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
      title: puzzleTitle,
      tiles: ZTest_makeTiles(board),
      words: ended ? ZTest_WORDS : null,
    },
    team: coop
      ? {
        nFoundWords: events.filter(isFind).length,
        nHintsUsed: players.reduce((n, p) => n + p.nHintsUsed, 0),
        hintPoints,
      }
      : null,
    events,
    players,
  }
}

/**
 * The props `<GamePage>` hands strands' `PlayArea`, from the game's facts: the
 * `game_data` blob, and shell_data's roster read off it, viewed by `auth`
 * (`u1` unless said otherwise).
 */
export function ZTest_makeStrandsCtx(
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
