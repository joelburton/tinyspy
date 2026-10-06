// cs-unmet

import { vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import { ZTest_actionFixture } from '../actions/action.fixture'
import type { PlayAreaLoaderProps } from './playAreaLoaderProps'
import type { ShellPlayer } from './shell'

/** The facts a test sets up. Everything else the page would hand a game is
 *  defaulted to a solo game in play, viewed by its one player, `u1`. */
export type ZTest_PlayAreaFacts = {
  gameId?: string
  auth?: Session
  gametype?: string
  title?: string
  clubHandle?: string
  restartCount?: number
  // The game has ended.
  ended?: boolean
  // The roster, as the shell shows it. The viewer (`auth.user.id`) must be
  // among them: there is no spectating.
  players?: ShellPlayer[]
  // The game's `game_data` blob, as its builder would write it.
  gameData?: unknown
  globalFeedbackSlot?: FeedbackSlot
  menu?: MenuApi
  goToFollowUpGame?: (gameId: string) => void
}

/** A player as the shell shows them, still playing unless `over` says
 *  otherwise. */
export function ZTest_shellPlayer(
  id: string,
  username: string,
  color: string,
  over: Partial<Pick<ShellPlayer, 'ai' | 'stillPlaying'>> = {},
): ShellPlayer {
  return { id, username, color, ai: false, stillPlaying: true, ...over }
}

/**
 * Build the props `<GamePage>` hands a game's `PlayArea`, for a component or
 * hook test, from the facts alone. `cg.me` is the viewer's entry, as on the
 * page. `menu`'s three actions are `ZTest_actionFixture`s, so a test can assert on
 * `actBackToClub.run`.
 */
export function ZTest_makePlayAreaLoaderProps(facts: ZTest_PlayAreaFacts = {}): PlayAreaLoaderProps {
  const {
    gameId = 'g1',
    auth = { user: { id: 'u1' } } as unknown as Session,
    gametype = 'game_coop',
    title = 'Test game',
    clubHandle = 'testclub',
    restartCount = 0,
    ended = false,
    players = [ZTest_shellPlayer('u1', 'me', 'red')],
    gameData = null,
    globalFeedbackSlot = createFeedbackSlot('global'),
    menu = {
      setGameSections: vi.fn(),
      actHelp: ZTest_actionFixture('act-help'),
      actChat: ZTest_actionFixture('act-open-chat'),
      actBackToClub: ZTest_actionFixture('act-back-to-club'),
    } as unknown as MenuApi,
    goToFollowUpGame = vi.fn(),
  } = facts

  const me = players.find((p) => p.id === auth.user.id)
  // Loud, because the page cannot reach this state: the gate sends a member
  // with no seat back to the club before anything mounts.
  if (!me) {
    throw new Error(
      `ZTest_makePlayAreaLoaderProps: auth.user.id ${auth.user.id} is not among the players`,
    )
  }

  return {
    cg: {
      id: gameId,
      gametype,
      club: { handle: clubHandle },
      title,
      restartCount,
      ended,
      players,
      me,
    },
    gameData,
    auth,
    globalFeedbackSlot,
    menu,
    goToFollowUpGame,
  }
}
