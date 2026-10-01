// cs-unmet

import { vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { GamePlayer } from '../members/member'
import type { GameEnding } from '../terminal/gameEnding'
import type { GameManifest } from '../manifest/gameManifest'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import { actionFixture } from '../actions/action.fixture'
import type { PlayAreaLoaderProps } from './playAreaLoaderProps'
import { whereIStand } from './whereIStand'

/** The facts a test sets up. Everything else the page would hand a game is
 *  defaulted to a solo coop game in play, viewed by its one player. */
export type PlayAreaFacts = {
  gameId?: string
  authSession?: Session
  gametype?: string
  mode?: 'coop' | 'compete'
  // The manifest's `name`.
  brand?: string
  title?: string
  clubHandle?: string
  // The setup blob, as the game's form wrote it.
  setup?: Record<string, unknown>
  // The game's `game_status`, as its builder writes it.
  gameStatus?: Record<string, unknown>
  players?: GamePlayer[]
  gameEnding?: GameEnding | null
  isTurnBased?: boolean
  turnHolderId?: string | null
  draftsOffTurn?: boolean
  updatedAt?: string
  resubscribeCount?: number
  globalFeedbackSlot?: FeedbackSlot
  menu?: MenuApi
  goToFollowUpGame?: (gameId: string) => void
}

/**
 * Build the props `<GamePage>` hands a game's `PlayArea`, for a component or
 * hook test, from the facts alone. Where I stand is DERIVED — the players'
 * endings, whether the game has ended, `isTurnBased` and `turnHolderId` go
 * through `whereIStand`, exactly as the page derives it — so a test sets up the
 * facts and never hand-writes an answer the page could not give.
 *
 * The `cg` carries every field a game reads; the pause, the clock and the
 * club-page fields are stubs, since no play surface reads them. `menu`'s three
 * actions are `actionFixture`s, so a test can assert on `actBackToClub.run`.
 */
export function makePlayAreaLoaderProps(facts: PlayAreaFacts = {}): PlayAreaLoaderProps {
  const {
    gameId = 'g1',
    authSession = { user: { id: 'u1' } } as unknown as Session,
    mode = 'coop',
    gametype = `game_${mode}`,
    brand = 'Brand',
    title = 'Test game',
    clubHandle = 'testclub',
    setup = {},
    gameStatus = {},
    players = [],
    gameEnding = null,
    isTurnBased = false,
    turnHolderId = null,
    draftsOffTurn = false,
    updatedAt = '2026-09-01T00:00:00Z',
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
  const isGameEnded = gameEnding !== null

  return {
    cg: {
      id: gameId,
      club_handle: clubHandle,
      gametype,
      mode,
      title,
      setup,
      is_current_view: true,
      gameEnding,
      restart_count: 0,
      game_status: gameStatus,
      updated_at: updatedAt,
      started_at: updatedAt,
      ended_at: isGameEnded ? updatedAt : null,
      current_turn_user_id: turnHolderId,
      isGameEnded,
      players,
      stillPlayingHumanPlayers: players.filter((p) => p.player_ended_at === null),
      pause: {
        paused: false,
        presentUserIds: new Set(players.map((p) => p.user_id)),
        manuallyPausedBy: null,
        sendManualPause: vi.fn(),
        sendManualUnpause: vi.fn(),
      },
      sendSuspend: vi.fn(),
      timer: { mode: { kind: 'none' }, displaySeconds: 0, expired: false },
      turns: { isTurnBased, turnHolderId },
      standing: whereIStand({
        players,
        myId: authSession.user.id,
        isGameEnded,
        isTurnBased,
        turnHolderId,
        draftsOffTurn,
      }),
    },
    manifest: { name: brand, draftsOffTurn } as unknown as GameManifest,
    authSession,
    resubscribeCount,
    globalFeedbackSlot,
    menu,
    goToFollowUpGame,
  }
}
