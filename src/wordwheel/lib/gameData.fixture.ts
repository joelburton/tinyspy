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
import { DEFAULT_WORDWHEEL_SETUP_COOP, type WordwheelSetup } from './setup'
import type { GGameDataRaw } from '../types'

export type { ZTest_BeePlayerFacts as ZTest_PlayerFacts } from '@/shared/bee-games/beeGameData.fixture'
export { ZTest_find, ZTest_word } from '@/shared/bee-games/beeGameData.fixture'

/** The facts a test sets up about a wordwheel game; the rest is the
 *  shared bee fixture's defaults on this game's board. */
export type ZTest_GameDataFacts = ZTest_BeeGameDataFacts<WordwheelSetup>

/** This game's fixture board: the outer letters `abcdfghi` around the center
 *  `e`, as the pgTAP fixture has it. */
export const ZTest_WORDWHEEL: ZTest_BeeGameFixture<WordwheelSetup> = {
  gametypePrefix: 'wordwheel',
  brand: 'MooseWheel',
  centerLetter: 'e',
  outerLetters: 'abcdfghi',
  defaultSetup: DEFAULT_WORDWHEEL_SETUP_COOP,
}

/** The `game_data` blob `wordwheel._rebuild_data_cols` would write from
 *  these facts. */
export function ZTest_makeGameDataRaw(facts: ZTest_GameDataFacts = {}): GGameDataRaw {
  return ZTest_makeBeeGameDataRaw(ZTest_WORDWHEEL, facts)
}

/**
 * The props `<GamePage>` hands wordwheel's `PlayArea`, from the game's
 * facts: the `game_data` blob, and shell_data's roster read off it, viewed by
 * `auth` (`u1` unless said otherwise).
 */
export function ZTest_makeWordwheelCtx(
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
