// cs-unmet

import { useEffect } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import {
  useStandardGameActions,
} from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { buildPrintModel } from '../pdf/model'
import { printScrabblePdf } from '../pdf/printScrabblePdf'
import type { GActions } from '../reactTypes'
import type { GGameData } from '../types'

/**
 * Bind every scrabble command the info column places and publish the game's
 * menu from them. Hands back the `actions`, for the action row.
 *
 * An action is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own. Suggest is bound by `useSuggestMove`, which holds its panel,
 * and joins the rest here.
 */
export function useActionsAndMenu({
  gd,
  actSuggestMove,
  localFeedbackSlot,
  goToFollowUpGame,
  menu,
}: {
  gd: GGameData
  actSuggestMove: Action
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: GActions
} {
  // The shared trio — Stop / Concede / Restart. Restart re-deals: the board is
  // the standard layout, so there is no puzzle to restore — a fresh bag, new
  // racks and an empty board, with the setup, players and bots kept.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: in this game, only by conceding.
    isPlayerEnded: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // New game — a fresh bag, with this game's setup, players and mode. The
  // full roster, conceded players included: conceding leaves THIS race, not
  // the group.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: gd.club.handle,
        p_setup: gd.setup,
        // People only: `create_game` seats the bots from `setup.ai_count`, so
        // passing their ids too would seat each one twice.
        p_player_user_ids: gd.players.filter((p) => !p.ai).map((p) => p.id),
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
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through once the game has ended.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended
      ? 'hidden'
      : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md).
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printScrabblePdf(buildPrintModel({
        gd,
        date: new Date().toLocaleDateString(),
      }))
    },
  })

  // The FULL scrabble menu. `buildGameMenu` supplies the framing (Help and chat
  // above, Back to club below); the middle is this game's own rows, each one an
  // action made above, so a row's words, glyph, key and availability come from
  // the action rather than being typed a second time here.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
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
      actSuggestMove,
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
  }
}
