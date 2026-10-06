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
import { buildWordiplyPrintModel } from '../pdf/model'
import { printWordiplyPdf } from '../pdf/printWordiplyPdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every wordiply command and publish the game's menu from them. Hands
 * back the `actions`, for the info column's action row, and `solutionShown`,
 * the reveal's local state, which the info column reads to show the word.
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
  solutionShown: boolean
} {
  // The shared trio — Stop / Concede / Restart. wordiply's own bit is which
  // `db` they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isTerminal: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: five words spent, or conceded.
    isLocallyTerminal: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // The best possible word shows only when I ask for it. The two readouts that
  // matter — the length score and the letter count — say how well you did
  // WITHOUT naming the word, so a table that wants to keep guessing at it can.
  // Local and reversible, so my looking doesn't end anyone else's think.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
  } = useSolutionReveal()

  // Reveal the best possible word — nothing is written and no peer is
  // affected. Inert until the game is over for everyone, so a racer who has
  // ended can't spoil the race.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // No BUTTON while you can still play. The menu row keeps it all game,
      // grayed, because it NAMES the glyph (docs/ui.md → the menu is the
      // legend).
      if (gd.me.stillPlaying && asker === 'button') return 'hidden'
      // "best solution" rather than the bare default: what this shows is the
      // best word that existed, which a winner never has to have found.
      return describeReveal({
        noun: 'best solution',
        revealed: solutionShown,
        isTerminal: gd.ended,
      })
    },
    run: toggleSolution,
  })

  // New game — a FRESH game (new id, new base) with THIS game's setup, players
  // and mode, in the same club. The base is chosen in Deno, so this goes
  // through the edge function, which relays `create_game`'s envelope. Nothing
  // is destroyed: the club's current-view flag moves, leaving this game
  // resumable from the club list.
  async function createNewGame() {
    const res = await runEdgeFn<CreatedGame>('wordiply-build-board', {
      target_club: gd.club.handle,
      setup: gd.setup,
      player_user_ids: gd.players.map((p) => p.id),
      mode: gd.mode,
    })
    if (res.type === 'not-ok') {
      // On the setup form a validation is an answer under its field. Here
      // there is no field, so whatever came back goes in the slot as it reads
      // — shown even for a fault whose modal has already fired, since a modal
      // escalates rather than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('wordiply-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through once
  // the game has ended; the shared run's single flight stops a second press
  // dealing a second base.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended
      ? 'hidden'
      : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd.events` is already what I may see, and the model
  // holds the scores and the best word back until the end, so nothing leaks
  // onto paper early.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printWordiplyPdf(
        buildWordiplyPrintModel({
          brand: gd.brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isGameEnded: gd.ended,
          puzzle: gd.puzzle,
          solutionShown,
          events: gd.events,
          players: gd.players,
          me: gd.me,
          track: gd.me,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL wordiply game menu. `buildGameMenu` supplies the framing (Help and
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
            // The same three the ending's action row offers, in its order,
            // reachable mid-game too — Reveal grayed until the game is over.
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
    solutionShown,
  }
}
