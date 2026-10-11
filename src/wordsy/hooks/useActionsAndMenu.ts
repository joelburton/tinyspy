// cs-unmet

import { useEffect } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { buildPrintModel } from '../pdf/model'
import { printWordsyPdf } from '../pdf/printWordsyPdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every wordsy command the info column places and publish the game's
 * menu from them. Hands back the `actions`, for the action row. The order is
 * the row's and the menu's: Concede · Stop | Restart · New game, the menu
 * adding Print. The two buttons under a scoresheet are the board column's
 * (`useBoardColActions`).
 *
 * An action is what the button, the menu row and the key all read, and its
 * `pending` grays every surface of one for the length of its run, which is
 * why no handler here carries an in-flight flag of its own.
 */
export function useActionsAndMenu({
  gd,
  localFeedbackSlot,
  goToFollowUpGame,
  menu,
}: {
  gd: GGameData
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: GActions
} {
  // The shared trio — Stop / Concede / Restart. Restart deals THIS deck again
  // from round 1.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: gd.mode,
    // Out of the game while it goes on: in this game, only by conceding.
    isPlayerEnded: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // New game — a fresh shuffle, with this game's setup and players.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: gd.club.handle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((p) => p.id),
        p_mode: gd.mode,
      }),
    )
    if (res.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md).
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printWordsyPdf(buildPrintModel({ gd, date: new Date().toLocaleDateString() }))
    },
  })

  // The menu: `buildGameMenu` supplies the framing (Help and chat above, Back
  // to club below); the middle is this game's own rows, each one an action
  // made above.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        exits: [actConcede, actStopGame],
        extra: [
          { items: [actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actRestart, actNewGame, actPrintBoard])

  return {
    actions: {
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
  }
}
