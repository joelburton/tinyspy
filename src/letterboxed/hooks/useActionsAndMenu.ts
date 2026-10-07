// cs-unmet

import { useEffect } from 'react'
import { useBindAction, type ActionState } from '@/common/actions/useBindAction'
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
import { askForHintOrSpoiler } from '../lib/askForHintOrSpoiler'
import { BOARD_SIZE, joinSides } from '../lib/board'
import { buildLetterboxedPrintModel } from '../pdf/model'
import { printLetterboxedPdf } from '../pdf/printLetterboxedPdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every letterboxed command and publish the game's menu from them. Hands
 * back the `actions`, for the info column's action row, and `solutionShown`,
 * the reveal's local state, which the info column reads to draw the pair.
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
  // Where a refused command, a hint and a spoiler say so.
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: GActions
  solutionShown: boolean
} {
  // The shared trio — Stop / Concede / Restart. letterboxed's own bit is which
  // `db` they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: in this game only by conceding.
    isPlayerEnded:!gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // The hint ladder's two rungs. COOP ONLY: in a race "first past the bar
  // wins" would make either one a win button, and the server refuses them
  // there too. Hidden rather than disabled — a control that named a glyph the
  // surface never shows would teach a lie. Hidden once the game has ended
  // too: there is no word left to find.
  /** Whether a rung of the ladder can be taken now. */
  function describeRung(): ActionState {
    if (gd.compete || gd.ended) return 'hidden'
    return gd.me.stillPlaying ? 'active' : 'disabled'
  }
  const actHint = useBindAction('act-hint', {
    describe: describeRung,
    run: () => askForHintOrSpoiler(gd, localFeedbackSlot, 'hint'),
  })
  const actSpoiler = useBindAction('act-spoiler', {
    describe: () => {
      const state = describeRung()
      return state === 'hidden' ? state : { state, label: 'Show the word' }
    },
    run: () => askForHintOrSpoiler(gd, localFeedbackSlot, 'spoiler'),
  })

  // Reveal the seeded pair — LOCAL and reversible (`useSolutionReveal`), and
  // never automatic: a letterboxed win is covering the twelve with ANY chain
  // inside the cap, so the pair is a different, usually much shorter answer the
  // players never saw. My asking for it hands it to nobody else, and it is
  // inert until the game is over for everyone, so a player who dropped out
  // can't spoil a live race.
  const { revealed: solutionShown, toggle: toggleSolution } = useSolutionReveal()
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // No BUTTON while you can still play. The menu row keeps it all game,
      // grayed, because it NAMES the glyph (docs/ui.md → the menu is the
      // legend).
      if (gd.me.stillPlaying && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: solutionShown, isGameEnded: gd.ended })
    },
    run: toggleSolution,
  })

  // New game — a FRESH game (new id, new board) with THIS game's setup,
  // players and mode, in the same club, through the same
  // `letterboxed-build-board` edge function the manifest's start uses.
  async function createNewGame() {
    const res = await runEdgeFn<CreatedGame>('letterboxed-build-board', {
      target_club: gd.club.handle,
      setup: gd.setup,
      player_user_ids: gd.players.map((p) => p.id),
      mode: gd.mode,
    })
    if (res.type === 'not-ok') {
      // There is no form here, so even a form-validation — PN214/PN215 (the
      // letters have no solution), PN216/PN217 (the dictionary does not reach
      // it) — reads in the slot. Shown even for a fault whose modal has already
      // fired: a modal escalates rather than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('letterboxed-build-board', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ending button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through once the game has ended;
  // the shared run's single flight stops a second press building a second
  // board.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd` already holds only what I may see, and the model
  // refuses to print the solution until it is on screen.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printLetterboxedPdf(
        buildLetterboxedPrintModel({
          brand: gd.brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          sides: joinSides(gd.puzzle.tiles),
          mode: gd.mode,
          solution: gd.puzzle.solution,
          solutionRevealed: solutionShown,
          players: gd.players,
          events: gd.events,
          summary:
            `${gd.me.nCoveredLetters}/${BOARD_SIZE} letters · ${gd.me.nWordsUsed}/${gd.me.maxWords} words`,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL letterboxed game menu. `buildGameMenu` supplies the framing (Help
  // and chat above, Back to club below); the middle is this game's own rows,
  // each one an action made above, so a row's words, glyph, key and
  // availability come from the action rather than being typed a second time.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
        exits: [actConcede, actStopGame],
        extra: [
          { items: [actHint, actSpoiler] },
          // The same three the action row offers after its bar, in its order.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, actConcede, actStopGame, actHint, actSpoiler, actRestart, actNewGame, actReveal,
    actPrintBoard,
  ])

  return {
    actions: {
      actHint,
      actSpoiler,
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
