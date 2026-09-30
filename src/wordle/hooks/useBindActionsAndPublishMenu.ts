// cs-unmet

import { useEffect } from 'react'
import { useBoundAction, type BoundAction } from '@/common/actions/useBoundAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { WORD_LENGTH } from '../lib/setup'
import { buildWordlePrintModel } from '../pdf/model'
import { printWordlePdf } from '../pdf/printWordlePdf'
import type { GameData } from './useGame'

/**
 * Every command wordle offers, bound once: the info column's action row places
 * them, the menu lists them, and their keys fire them — all reading the same
 * binding, so the surfaces cannot drift.
 */
export type WordleActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action (src/guards/actionIds.test.ts).
  //
  // Show the word — or put it away again. A local display toggle, no RPC; it
  // carries its own faces, the inert "solution already shown" included.
  actReveal: BoundAction
  // Restart THIS game — same word — from scratch.
  actRestart: BoundAction
  // Start a fresh follow-up game — same setup, new target + id. Disables itself
  // while the create is in flight.
  actNewGame: BoundAction
  // Drop out of a compete game while the others play on — hidden in coop, and
  // once you are out (solved, out of guesses, conceded), when Stop takes its
  // place.
  actConcede: BoundAction
  // Stop the game for the whole table — coop's exit; it hides itself in
  // compete until you are out.
  actStopGame: BoundAction
  // Print the board and the log; the menu's alone, with no twin in the row.
  actPrintBoard: BoundAction
  // Leave for the club page — the shell's own, off `GamePageCtx.menu`, carried
  // here so a surface that places the row has every action in one object.
  actBackToClub: BoundAction
}

/**
 * Bind every wordle command and publish the game's menu from them. Hands back
 * the `actions`, for the info column's action row, and `answerShown`, the
 * reveal's local state, which the info column reads to show the word.
 *
 * A binding is what the button, the menu row and the key all read, so none of
 * them can drift from another — and `pending` grays every surface of one for
 * the length of its run, which is why no handler here carries an in-flight
 * flag of its own.
 *
 * **The menu reads as the info column's action row does.** The two are views
 * of the same bindings, so a player who learned the row finds the menu in the
 * same order (docs/playarea.md). Print is the one row with no twin in the row,
 * and sits after them.
 */
export function useBindActionsAndPublishMenu({
  gd,
  selfId,
  localFeedbackSlot,
  clubHandle,
  goToFollowUpGame,
  menu,
  brand,
}: {
  gd: GameData
  selfId: string
  // Where a refused command says so.
  localFeedbackSlot: FeedbackSlot
} & Pick<GamePageCtx, 'clubHandle' | 'goToFollowUpGame' | 'menu' | 'brand'>): {
  actions: WordleActions
  answerShown: boolean
} {
  // The shared trio — Stop / Concede / Restart. wordle's own bit is which `db`
  // they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.gameId,
    isTerminal: gd.isGameEnded,
    mode: gd.mode,
    isLocallyTerminal: gd.standing.isPlayerEnded,
    localFeedbackSlot,
  })

  // The word shows only when I ask for it, and the ask is local and reversible
  // (`useSolutionReveal`). The target is on every client once the game has
  // ended (`wordle._target_for`), so this is purely what gets drawn.
  //
  // `impliedBy` is the exception: a wordle can only be SOLVED by typing the
  // answer, so a solver is already looking at it.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.standing.hasSolved })

  // Reveal the answer — nothing is written and no peer is affected. Both faces
  // come from `describeReveal`, where the rule for every game's reveal lives.
  const actReveal = useBoundAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play.
      // The menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (gd.standing.isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution', revealed: answerShown, impliedBySolve, isTerminal: gd.isGameEnded,
      })
    },
    run: toggleAnswer,
  })

  // New game — a FRESH game (new id, new random target) with THIS game's setup,
  // players and mode, in the same club. wordle's `create_game` is a direct RPC —
  // no edge function, since picking a random target is one SQL line. Nothing is
  // destroyed: the club's current-view flag moves, leaving this game resumable
  // from the club list. The creator jumps in via `goToFollowUpGame`, peers
  // arrive by invitation toast.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((p) => p.user_id),
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

  // New game — its `+`, its menu row and its ending button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through once
  // the game has ended; the shared run's single flight stops a second press
  // dealing a second word.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: gd.isGameEnded,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.isGameEnded ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time (common/pdf/doc.md).
  // RLS already scopes the log to what I may see, and the model refuses to
  // print the target before the end, so neither the boards nor the answer can
  // leak onto paper early.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printWordlePdf(
        buildWordlePrintModel({
          brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isGameEnded: gd.isGameEnded,
          maxGuesses: gd.readout.maxGuesses,
          wordLength: WORD_LENGTH,
          guesses: gd.events,
          players: gd.players,
          selfId,
          target: gd.target,
          answerShown,
          solvedBy: new Set(gd.players.filter((p) => p.solvedAt !== null).map((p) => p.user_id)),
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL wordle game menu. `buildGameMenu` supplies the framing (Help and
  // chat above, Back to club below); the middle is this game's own rows, each
  // one a binding made above, so a row's words, glyph, key and availability
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
