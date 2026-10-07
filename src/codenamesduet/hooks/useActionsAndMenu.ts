// cs-unmet

import { useEffect } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
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
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { buildCodenamesduetPrintModel } from '../pdf/model'
import { printCodenamesduetPdf } from '../pdf/printCodenamesduetPdf'
import type { GActions, GGameData } from '../types'

/**
 * Every command codenamesduet offers, bound once, and the menu that lists
 * them. The info column's action row places the actions, the menu lists them,
 * and their keys fire them — all reading the same action, so the surfaces
 * cannot drift. Stop, Concede and Restart are the shared trio; Reveal, New
 * game and Print are this game's own.
 *
 * Also hands back whether I have asked to see my partner's key, which the
 * board and the printout both draw from.
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
  actions: GActions;
  partnerKeyShown: boolean
} {
  // Stop / Restart — the shared pair. Duet is coop-only, so Concede hides itself
  // and only Stop is ever placed. Restart is a MULLIGAN: `replay_board` deals
  // the same board and key cards again (a blind board is New game, below), and
  // the reveal being local state, the remount a restart causes covers the
  // partner's key again.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: 'coop',
    isPlayerEnded: false,
    localFeedbackSlot,
  })

  // Show my partner's key — a LOCAL display toggle: it shows their card to me
  // alone and writes nothing, so my partner's own screen stays as it was until
  // they ask. Only once the game has ended, because mid-game the partner's card
  // IS the game, and `gd` does not hold it until then.
  const partnerKeyReveal = useSolutionReveal()
  const actReveal = useBindAction('act-reveal', {
    // "key cards" rather than the bare default: what this game withholds is not
    // a solution at all, it is the half of the key only your partner could see.
    describe: (asker) => {
      // No BUTTON while the game runs; the menu row keeps it all game, grayed,
      // because the menu is where its glyph is taught.
      if (!gd.ended && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'key cards',
        revealed: partnerKeyReveal.revealed,
        isGameEnded: gd.ended,
      })
    },
    run: partnerKeyReveal.toggle,
  })

  // New game — a FRESH game (a new id, a newly sampled board) with THIS game's
  // setup and roster, in the same club. `create_game` samples its board inline,
  // so this is a direct RPC, and it takes no `mode` (the game is coop-only).
  // `common._create_game` un-currents THIS game into the club's list, so it
  // stays resumable. The creator jumps in via `goToFollowUpGame`; the partner
  // arrives via the game-invitation toast.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: gd.club.handle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((p) => p.id),
      }),
    )
    if (res.type === 'not-ok') {
      // No field to land on here, so the answer goes in the slot as it reads,
      // over the verdict, until dismissed — even for a fault whose modal has
      // already fired, since the modal escalates and does not replace
      // (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
    } else {
      reportUnhandled('create_game', res)
    }
  }

  // Its `+`, its menu row and its ending button, from one action. The registry
  // asks NEW_GAME_CONFIRM mid-play (starting one shelves this game, not ends
  // it) and goes straight through once the game has ended. The shared run's
  // single flight is what stops a second press sampling a second board.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended
      ? 'hidden'
      : 'active'),
    run: createNewGame,
  })

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). My
  // partner's key reaches paper only once I have asked to see it, and the
  // model refuses it before the end regardless.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printCodenamesduetPdf(
        buildCodenamesduetPrintModel({
          date: new Date().toLocaleDateString(),
          gd,
          partnerKeyShown: partnerKeyReveal.revealed,
        }),
      )
    },
  })

  // ─── The menu ───────────────────────────────────────
  // `buildGameMenu` supplies the framing (Help and chat above, Back to club
  // below); the middle is this game's own rows, each one an action made above,
  // so a row's words, glyph, key and availability come from the action rather
  // than being typed a second time here. The game is coop-only, so Concede
  // hides itself and the exits list draws as Stop alone.
  useEffect(function publishGameMenu() {
      menu.setGameSections(
        buildGameMenu({
          menu,
          exits: [actConcede, actStopGame],
          extra: [
            // The same actions the info column's row offers, in its order,
            // reachable mid-game too.
            { items: [actReveal, actRestart, actNewGame] },
            { items: [actPrintBoard] },
          ],
        }),
      )
      return () => menu.setGameSections([])
    },
    [menu, actConcede, actStopGame, actReveal, actRestart, actNewGame, actPrintBoard])

  return {
    actions: {
      actReveal,
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
    partnerKeyShown: partnerKeyReveal.revealed,
  }
}
