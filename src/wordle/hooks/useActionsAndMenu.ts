// cs-unmet

import { useEffect } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { WORD_LENGTH } from '../lib/setup'
import { buildPrintModel } from '../pdf/model'
import { printPdf } from '../pdf/printPdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every wordle command and publish the game's menu from them. Hands back
 * the `actions`, for the info column's action row, and `answerShown`, the
 * reveal's local state, which the info column reads to show the word.
 *
 * An action is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own.
 *
 * **The menu reads as the info column's action row does.** The two are views
 * of the same actions, so a player who learned the row finds the menu in the
 * same order (docs/playarea.md). Print is the one row with no twin in the row,
 * and sits after them.
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
  // The shared trio — Stop / Concede / Restart. wordle's own bit is which `db`
  // they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isTerminal: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: a solver, a player whose budget
    // is spent, a conceder.
    isLocallyTerminal: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // The word shows only when I ask for it, and the ask is local and reversible
  // (`useSolutionReveal`). The target is on every client once the game has
  // ended (`gd.puzzle.target`), so this is purely what gets drawn.
  //
  // `impliedBy` is the exception: a wordle can only be SOLVED by typing the
  // answer, so a solver is already looking at it.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.me.solved })

  // Reveal the answer — nothing is written and no peer is affected. Both faces
  // come from `describeReveal`, where the rule for every game's reveal lives.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play.
      // The menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (gd.me.stillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution', revealed: answerShown, impliedBySolve, isTerminal: gd.ended,
      })
    },
    run: toggleAnswer,
  })

  // New game — a FRESH game (new id, new random target) with THIS game's setup,
  // players and mode, in the same club. wordle's `create_game` is a direct RPC
  // — no edge function, since picking a random target is one SQL line. Nothing
  // is destroyed: the club's current-view flag moves, leaving this game
  // resumable from the club list. The creator jumps in via `goToFollowUpGame`,
  // peers arrive by invitation toast.
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
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through once
  // the game has ended; the shared run's single flight stops a second press
  // dealing a second word.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe:
        (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd.events` is already what I may see, and the model
  // refuses to print the target before the end, so neither the boards nor the
  // answer can leak onto paper early.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printPdf(
        buildPrintModel({
          brand: gd.brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isGameEnded: gd.ended,
          maxGuesses: gd.me.maxGuesses,
          wordLength: WORD_LENGTH,
          events: gd.events,
          players: gd.players,
          myId: gd.me.id,
          target: gd.puzzle.target,
          answerShown,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL wordle game menu. `buildGameMenu` supplies the framing (Help and
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
          // The same three the ending's action row offers, reachable mid-game
          // too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actRestart, actNewGame, actReveal, actPrintBoard])

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
