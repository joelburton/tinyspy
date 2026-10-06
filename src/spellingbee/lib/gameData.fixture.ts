// cs-unmet

import type { Session } from '@supabase/supabase-js'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import {
  ZTest_makePlayAreaLoaderProps,
  type ZTest_PlayAreaFacts,
} from '@/common/game-page/playAreaLoaderProps.fixture'
import {
  ZTest_makeBeeGameDataRaw,
  type ZTest_BeeGameDataFacts,
  type ZTest_BeeGameFixture,
} from '@/shared/bee-games/beeGameData.fixture'
import { DEFAULT_SPELLINGBEE_SETUP_COOP } from './setup'
import type { GSetup } from '../types'
import type { GGameDataRaw } from '../types'

export type { ZTest_BeePlayerFacts as ZTest_PlayerFacts } from '@/shared/bee-games/beeGameData.fixture'
export { ZTest_find, ZTest_word } from '@/shared/bee-games/beeGameData.fixture'

/** The facts a test sets up about a spellingbee game; the rest is the
 *  shared bee fixture's defaults on this game's board. */
export type ZTest_GameDataFacts = ZTest_BeeGameDataFacts<GSetup>

/** This game's fixture board: the outer letters `abcdfg` around the center
 *  `e`, as the pgTAP fixture has it. */
export const ZTest_SPELLINGBEE: ZTest_BeeGameFixture<GSetup> = {
  gametypePrefix: 'spellingbee',
  brand: 'FreeBee',
  centerLetter: 'e',
  outerLetters: 'abcdfg',
  defaultSetup: DEFAULT_SPELLINGBEE_SETUP_COOP,
}

/** The `game_data` blob `spellingbee._rebuild_data_cols` would write from
 *  these facts. */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  return ZTest_makeBeeGameDataRaw(ZTest_SPELLINGBEE, facts)
}

/**
 * The props `<GamePage>` hands spellingbee's `PlayArea`, from the game's
 * facts: the `game_data` and `static_game_data` blobs, and shell_data's roster
 * read off them, viewed by `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeSpellingbeeCtx(
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
