// cs-unmet

import { vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import type { GamePlayer, GamePlayerRow } from '../members/member'
import type { GameEnding } from '../terminal/gameEnding'
import type { GameManifest } from '../manifest/gameManifest'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { MenuApi } from '../menu/menuModel'
import { createFeedbackSlot } from '../feedback/feedbackSlotStore'
import { actionFixture } from '../actions/action.fixture'
import { gp } from '../members/gamePlayer.fixture'
import type { PlayAreaLoaderProps } from './playAreaLoaderProps'
import { computePlayerStanding } from './playerStanding'

/** The facts a test sets up. Everything else the page would hand a game is
 *  defaulted to a solo coop game in play, viewed by its one player, `u1`. */
export type PlayAreaFacts = {
  gameId?: string
  auth?: Session
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
  // The roster's rows. Where each stands is derived, so a `gp()` with its
  // standing fields left at the defaults reads as the page would read it. The
  // viewer (`auth.user.id`) must be among them: there is no spectating.
  players?: GamePlayerRow[]
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
 * hook test, from the facts alone. Where each player stands is DERIVED — the
 * players' endings, whether the game has ended, `isTurnBased` and
 * `turnHolderId` go through `computePlayerStanding`, exactly as the page
 * derives it — so a test sets up the facts and never hand-writes an answer the
 * page could not give. `cg.me` is the viewer's entry, as on the page.
 *
 * The `cg` carries every field a game reads; the pause, the clock and the
 * club-page fields are stubs, since no play surface reads them. `menu`'s three
 * actions are `actionFixture`s, so a test can assert on `actBackToClub.run`.
 */
export function makePlayAreaLoaderProps(facts: PlayAreaFacts = {}): PlayAreaLoaderProps {
  const {
    gameId = 'g1',
    auth = { user: { id: 'u1' } } as unknown as Session,
    mode = 'coop',
    gametype = `game_${mode}`,
    brand = 'Brand',
    title = 'Test game',
    clubHandle = 'testclub',
    setup = {},
    gameStatus = {},
    players: playerRows = [gp('u1', 'me', 'red')],
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

  const players: GamePlayer[] = playerRows.map((p) => ({
    ...p,
    ...computePlayerStanding(p, { isGameEnded, isTurnBased, turnHolderId, draftsOffTurn }),
  }))
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
      me,
      stillPlayingHumanPlayers: players.filter((p) => p.isStillPlaying && !p.ai_member),
      pause: {
        paused: false,
        presentUserIds: new Set(players.map((p) => p.id)),
        manuallyPausedBy: null,
        sendManualPause: vi.fn(),
        sendManualUnpause: vi.fn(),
      },
      sendSuspend: vi.fn(),
      timer: { mode: { kind: 'none' }, displaySeconds: 0, expired: false },
      turns: { isTurnBased, turnHolderId },
    },
    manifest: { name: brand, draftsOffTurn } as unknown as GameManifest,
    auth,
    resubscribeCount,
    globalFeedbackSlot,
    menu,
    goToFollowUpGame,
  }
}
