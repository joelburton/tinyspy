// cs-unmet

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBindAction, type BoundAction } from '../actions/useBindAction'
import { useBoundAction } from '../actions/boundActionsStore'
import { askConfirmation } from '../floating-panels/confirmationService'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { GameManifest } from '../manifest/gameManifest'
import { setGameMenuSections } from '../menu/gameMenuStore'
import type { MenuApi } from '../menu/menuModel'
import { suspendConfirm } from '../pause-suspend/suspendConfirm'
import { navigate } from '../routing/router'
import { clubPath, gamePath } from '../routing/routes'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { CommonGame } from './useCommonGame'

type BoundPageActionsOptions = {
  gameId: string
  manifest: GameManifest
  cg: CommonGame
  // Where the overlay's Stop says a refusal.
  globalFeedbackSlot: FeedbackSlot
}

/**
 * Binds the game page's own actions and returns them, with the menu API a
 * PlayArea gets: Help, Back to club, New game from setup, and the pause
 * overlay's Stop.
 *
 * - **Back to club**: once the game is over, just go; mid-game, suspend, asking
 *   first only when there are human peers it would send back too.
 * - **New game from setup** opens the club page's setup dialog on this
 *   gametype. A key only; no menu row.
 * - **Stop, for the pause overlay**, bound here because the overlay unmounts
 *   the game's own Stop. Hidden unless paused, so the two are never live
 *   together. It goes through PostgREST, so it works when Realtime is stuck.
 *
 * A game's menu sections are cleared when the page unmounts, so they go with
 * the game.
 */
export function useBoundPageActions({
  gameId,
  manifest,
  cg,
  globalFeedbackSlot,
}: BoundPageActionsOptions): {
  // What a PlayArea gets to build its menu with.
  menu: MenuApi
  actBackToClub: BoundAction
  actStopGame: BoundAction
  // Open the page of a game this PlayArea just started.
  goToFollowUpGame: (gameId: string) => void
  // The Help companion is open, and closing it.
  isHelpOpen: boolean
  closeHelp: () => void
} {
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  useEffect(function clearGameMenuOnLeave() {
    return () => setGameMenuSections([])
  }, [])

  const actHelp = useBindAction('act-help', {
    describe: () => 'active',
    run: () => setIsHelpOpen(true),
  })
  // Bound at the app root; passed along for the game's menu.
  const actChat = useBoundAction('act-open-chat')

  const requestBackToClub = useCallback(async () => {
    // Called through a local, not as `cg.sendSuspend()`: a method call makes the
    // hooks lint rule ask for all of `cg` in the deps.
    const sendSuspend = cg.sendSuspend
    if (cg.isGameEnded) navigate(clubPath(cg.club_handle))
    else if (cg.stillPlayingHumanPlayers.length <= 1) sendSuspend()
    else if ((await askConfirmation(suspendConfirm(cg.title))) === 'confirm') sendSuspend()
  }, [cg.club_handle, cg.isGameEnded, cg.title, cg.stillPlayingHumanPlayers.length, cg.sendSuspend])
  const actBackToClub = useBindAction('act-back-to-club', {
    describe: () => 'active',
    run: requestBackToClub,
  })

  useBindAction('act-new-game-from-setup', {
    terminal: cg.isGameEnded,
    describe: () => 'active',
    run: () => navigate(`${clubPath(cg.club_handle)}?new=${manifest.gametype}`),
  })

  const stopTheGameFromTheOverlay = async () => {
    const res = await manifest.stopGame(gameId)
    if (res.type === 'not-ok') {
      globalFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data?.result === 'ended') {
      // The end arrives by subscription.
    } else {
      reportUnhandled('stop_game', res)
    }
  }
  const actStopGame = useBindAction('act-stop-game', {
    terminal: cg.isGameEnded,
    describe: () => (cg.pause.paused ? 'active' : 'hidden'),
    run: stopTheGameFromTheOverlay,
  })

  const goToFollowUpGame = useCallback((followUpGameId: string) => {
    navigate(gamePath(manifest.gametype, followUpGameId))
  }, [manifest.gametype])

  const menu = useMemo<MenuApi>(
    () => ({ setGameSections: setGameMenuSections, actHelp, actChat, actBackToClub }),
    [actHelp, actChat, actBackToClub],
  )

  const closeHelp = useCallback(() => setIsHelpOpen(false), [])

  return { menu, actBackToClub, actStopGame, goToFollowUpGame, isHelpOpen, closeHelp }
}
