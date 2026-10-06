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
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from '../db'
import { buildWafflePrintModel } from '../pdf/model'
import { printWafflePdf } from '../pdf/printWafflePdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every waffle command and publish the game's menu from them. Hands back
 * the `actions`, for the info column's action row, and `answerShown`, the
 * reveal's local state, which picks the board PlayArea shows.
 *
 * An action is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own.
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
  answerShown: boolean
} {
  // The shared trio — Stop / Concede / Restart. waffle's own bit is which `db`
  // they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isTerminal: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: a solver, a racer whose budget
    // is spent, a conceder.
    isLocallyTerminal: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // The answer shows only when I ask for it, and the ask is LOCAL and
  // reversible (`useSolutionReveal`): my looking doesn't swap the board out
  // from under a partner still studying where they got stuck. The solution is
  // on every client once the game has ended (`gd.puzzle.solution`), so this is
  // purely which grid gets drawn.
  //
  // `impliedBy` is the exception: a waffle solve IS the solved grid, so a
  // solver is already looking at the answer. MY solve, not the game's verdict
  // — a racer who ran out of swaps never got there; a coop solve stamps every
  // teammate.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.me.solved })

  // Reveal the answer — nothing is written and no peer is affected. Both faces
  // come from `describeReveal`, where the rule for every game's reveal lives.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // No BUTTON while you can still play. The menu row keeps it all game,
      // grayed, because it NAMES the glyph (docs/ui.md → the menu is the
      // legend); a racer who is out sees the button inert until the race ends.
      if (gd.me.stillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution',
        revealed: answerShown,
        impliedBySolve,
        isTerminal: gd.ended,
      })
    },
    run: toggleAnswer,
  })

  // New game — a FRESH game (new id, new randomly-built board) with THIS
  // game's setup, players and mode, in the same club, through the same
  // `waffle-build-board` edge function the manifest's start uses. Nothing is
  // destroyed: the club's current-view flag moves, leaving this game resumable
  // from the club list. The creator jumps in via `goToFollowUpGame`, peers
  // arrive by invitation toast.
  async function createNewGame() {
    const res = await runEdgeFn<CreatedGame>('waffle-build-board', {
      target_club: gd.club.handle,
      setup: gd.setup,
      player_user_ids: gd.players.map((p) => p.id),
      mode: gd.mode,
    })
    if (res.type === 'not-ok') {
      // There is no form here, so even a `form-validation` — PN121, when the
      // generator gives up at that difficulty — reads in the slot. Shown even
      // for a fault whose modal has already fired: a modal escalates rather
      // than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('waffle-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through once
  // the game has ended; the shared run's single flight stops a second press
  // building a second board.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended
      ? 'hidden'
      : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd` already holds only what I may see, and the model
  // refuses to print the solution until it is on screen.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printWafflePdf(
        buildWafflePrintModel({
          brand: gd.brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isGameEnded: gd.ended,
          maxSwaps: gd.me.maxSwaps,
          parSwaps: gd.puzzle.parSwaps,
          players: gd.players,
          events: gd.events,
          myId: gd.me.id,
          solution: gd.puzzle.solution,
          answerShown,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL waffle game menu. `buildGameMenu` supplies the framing (Help and
  // chat above, Back to club below); the middle is this game's own rows, each
  // one an action made above, so a row's words, glyph, key and availability
  // come from the action rather than being typed a second time here.
  useEffect(function publishGameMenu() {
      menu.setGameSections(
        buildGameMenu({
          menu,
          // Both exits, in reading order; each hides itself in the mode that
          // isn't its own, so this list is the same in coop and compete.
          exits: [actConcede, actStopGame],
          extra: [
            // The same three the action row offers, in its order, reachable
            // mid-game too — Reveal grayed until the game is over.
            { items: [actReveal, actRestart, actNewGame] },
            { items: [actPrintBoard] },
          ],
        }),
      )
      return () => menu.setGameSections([])
    },
    [menu, actConcede, actStopGame, actRestart, actNewGame, actReveal, actPrintBoard])

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
    answerShown,
  }
}
