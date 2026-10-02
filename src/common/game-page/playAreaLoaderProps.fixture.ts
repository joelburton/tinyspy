// cs-unmet

import { vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import { actionFixture } from '../actions/action.fixture'
import type { PlayAreaLoaderProps } from './playAreaLoaderProps'
import type { ShellPlayer } from './shell'

/** The facts a test sets up. Everything else the page would hand a game is
 *  defaulted to a solo game in play, viewed by its one player, `u1`. */
export type PlayAreaFacts = {
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
  resubscribeCount?: number
  globalFeedbackSlot?: FeedbackSlot
  menu?: MenuApi
  goToFollowUpGame?: (gameId: string) => void
}

/** A player as the shell shows them, still playing unless `over` says
 *  otherwise. */
export function shellPlayer(
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
 * page. `menu`'s three actions are `actionFixture`s, so a test can assert on
 * `actBackToClub.run`.
 */
export function makePlayAreaLoaderProps(facts: PlayAreaFacts = {}): PlayAreaLoaderProps {
  const {
    gameId = 'g1',
    auth = { user: { id: 'u1' } } as unknown as Session,
    gametype = 'game_coop',
    title = 'Test game',
    clubHandle = 'testclub',
    restartCount = 0,
    ended = false,
    players = [shellPlayer('u1', 'me', 'red')],
    gameData = null,
    resubscribeCount = 0,
    globalFeedbackSlot = createFeedbackSlot('global'),
    menu = {
      setGameSections: vi.fn(),
      actHelp: actionFixture('act-help'),
      actChat: actionFixture('act-open-chat'),
      actBackToClub: actionFixture('act-back-to-club'),
    } as unknown as MenuApi,
    goToFollowUpGame = vi.fn(),
  } = facts

  const me = players.find((p) => p.id === auth.user.id)
  // Loud, because the page cannot reach this state: the gate sends a member
  // with no seat back to the club before anything mounts.
  if (!me) {
    throw new Error(
      `makePlayAreaLoaderProps: auth.user.id ${auth.user.id} is not among the players`,
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
    resubscribeCount,
    globalFeedbackSlot,
    menu,
    goToFollowUpGame,
  }
}
