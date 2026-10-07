// cs-unmet

import { useEffect } from 'react'
import { useBindAction, type ActionAsker, type ActionState } from '@/common/actions/useBindAction'
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
import { askForHintOrSpoiler } from '../lib/askForHintOrSpoiler'
import { buildStackdownPrintModel } from '../pdf/model'
import { printStackdownPdf } from '../pdf/printStackdownPdf'
import type { GActions, GGameData } from '../types'

/**
 * Bind every stackdown command and publish the game's menu from them. Hands
 * back the `actions`, for the info column's action row, and `solutionShown`,
 * the reveal's local state, which the info column reads to draw the six words.
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
  // The shared trio — Stop / Concede / Restart. Stop is coop's neutral
  // whole-table stop, Concede compete's drop-out, and Restart runs THIS stack
  // back: same tiles, same solution, everything the players did wiped.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isGameEnded: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: in this game only by conceding.
    isPlayerEnded: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // The hint ladder's two rungs, in both modes. Once you can't ask, the BUTTON
  // goes — there is no word left for you to find — but the menu row only
  // grays: it is what NAMES those glyphs (docs/ui.md → the menu is the legend),
  // and a disabled row still teaches the lightbulb and the bare eye. The labels
  // say which word each acts on, which the icon-only buttons have no room for.
  /** Whether a rung of the ladder can be taken now, for whoever is asking. */
  function describeRung(asker: ActionAsker): ActionState {
    if (gd.me.stillPlaying) return 'active'
    return asker === 'button' ? 'hidden' : 'disabled'
  }
  const actHint = useBindAction('act-hint', {
    describe: (asker) => {
      const state = describeRung(asker)
      return state === 'hidden' ? state : { state, label: 'Hint for next word' }
    },
    run: () => askForHintOrSpoiler(gd, localFeedbackSlot, 'hint'),
  })
  const actSpoiler = useBindAction('act-spoiler', {
    describe: (asker) => {
      const state = describeRung(asker)
      return state === 'hidden' ? state : { state, label: 'Cheat for next word' }
    },
    run: () => askForHintOrSpoiler(gd, localFeedbackSlot, 'spoiler'),
  })

  // Reveal the six words. They are NOT shown just because the game ended — not
  // even on a win: Restart re-runs this very stack with the same solution, so an
  // answer left on screen would make it theater. The ask is LOCAL and reversible
  // (`useSolutionReveal`): mine alone, so a teammate can keep working the stack
  // out in their head while I look.
  //
  // `impliedBy` is the exception: you can only finish a stackdown by playing all
  // six words, so a solver has already SEEN every one of them. MY solve, not the
  // game's verdict — a racer who was beaten cleared nothing; a coop clear stamps
  // every teammate.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.me.solved })
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // No BUTTON while you can still play. The menu row keeps it all game,
      // grayed, because it NAMES the glyph; a conceder keeps the button, inert
      // until the race is over for everyone, so the row doesn't change shape
      // when the last racer finishes.
      if (gd.me.stillPlaying && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: solutionShown, impliedBySolve, isGameEnded: gd.ended })
    },
    run: toggleSolution,
  })

  // New game — a FRESH game (new id, a newly claimed board) with THIS game's
  // setup, players and mode, in the same club, through the same RPC the
  // manifest's start uses.
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
      // There is no form here, so whatever came back reads in the slot. Shown
      // even for a fault whose modal has already fired: a modal escalates
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
  // rather than ending it) and goes straight through once the game has ended;
  // the shared run's single flight stops a second press claiming a second
  // board.
  const actNewGame = useBindAction('act-new-game', {
    ended: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd` already holds only what I may see, and the
  // solution goes on paper only while it is on screen, so a printout can't
  // spoil a stack about to be run back.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printStackdownPdf(
        buildStackdownPrintModel({
          brand: gd.brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          ended: gd.ended,
          tiles: gd.puzzle.tiles,
          players: gd.players,
          me: gd.me,
          events: gd.events,
          solution: solutionShown ? gd.puzzle.solution : null,
          nFoundWords: gd.me.nFoundWords,
          nReqdWords: gd.puzzle.nReqdWords,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL stackdown game menu. `buildGameMenu` supplies the framing (Help
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
