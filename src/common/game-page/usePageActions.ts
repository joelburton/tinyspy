// cs-unmet

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBindAction, type Action } from '../actions/useBindAction'
import { useAction } from '../actions/actionsStore'
import { askConfirmation } from '../floating-panels/confirmationService'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { Manifest } from '../manifest/manifest'
import { setGameMenuSections } from '../menu/gameMenuStore'
import type { MenuApi } from '../menu/menuModel'
import { registerPawSubject } from '../paw-protection/pawProtectionService'
import { suspendConfirm } from '../pause-suspend/suspendConfirm'
import { navigate } from '../routing/router'
import { clubPath, gamePath } from '../routing/routes'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { GamePause } from '../pause-suspend/pause'
import type { CommonGame } from './shell'

type PageActionsOptions = {
  manifest: Manifest
  cg: CommonGame
  pause: GamePause
  // Shelve the game and send every peer to the club page.
  sendSuspend: () => void
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
export function usePageActions({
  manifest,
  cg,
  pause,
  sendSuspend,
  globalFeedbackSlot,
}: PageActionsOptions): {
  // What a PlayArea gets to build its menu with.
  menu: MenuApi
  // The pause overlay's two buttons.
  actions: { actBackToClub: Action; actStopGame: Action }
  // Open the page of a game this PlayArea just started.
  goToFollowUpGame: (gameId: string) => void
  // The Help companion.
  help: { isOpen: boolean; close: () => void }
} {
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  useEffect(function clearGameMenuOnLeave() {
    return () => setGameMenuSections([])
  }, [])

  // Paw protection's subject for this page: the club and gametype its New game
  // would start, registered for as long as the page is up so the action's
  // shared run can ask before it acts (`common/paw-protection`).
  useEffect(function registerThisPagesPawSubject() {
    return registerPawSubject({ clubHandle: cg.club.handle, gametype: manifest.gametype })
  }, [cg.club.handle, manifest.gametype])

  const actHelp = useBindAction('act-help', {
    describe: () => 'active',
    run: () => setIsHelpOpen(true),
  })
  // Bound at the app root; passed along for the game's menu.
  const actChat = useAction('act-open-chat')

  const requestBackToClub = useCallback(async () => {
    if (cg.ended) navigate(clubPath(cg.club.handle))
    else if (pause.stillPlayingHumanPlayers.length <= 1) sendSuspend()
    else if ((await askConfirmation(suspendConfirm(cg.title))) === 'confirm') sendSuspend()
  }, [cg.club.handle, cg.ended, cg.title, pause.stillPlayingHumanPlayers.length, sendSuspend])
  const actBackToClub = useBindAction('act-back-to-club', {
    describe: () => 'active',
    run: requestBackToClub,
  })

  useBindAction('act-new-game-from-setup', {
    ended: cg.ended,
    describe: () => 'active',
    run: () => navigate(`${clubPath(cg.club.handle)}?new=${manifest.gametype}`),
  })

  const stopTheGameFromTheOverlay = async () => {
    const res = await manifest.stopGame(cg.id)
    if (res.type === 'not-ok') {
      globalFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data?.result === 'ended') {
      // The end arrives by subscription.
    } else {
      reportUnhandled('stop_game', res)
    }
  }
  const actStopGame = useBindAction('act-stop-game', {
    ended: cg.ended,
    describe: () => (pause.paused ? 'active' : 'hidden'),
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

  return {
    menu,
    actions: { actBackToClub, actStopGame },
    goToFollowUpGame,
    help: { isOpen: isHelpOpen, close: closeHelp },
  }
}
