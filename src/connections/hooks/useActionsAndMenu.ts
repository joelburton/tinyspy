// cs-unmet

import { useEffect, useState, type ReactNode } from 'react'
import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useAcknowledge } from '@/common/floating-panels/useAcknowledge'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { PuzzleAnswer } from '../lib/setup'
import { unmatchedCategories } from '../lib/unmatchedCategories'
import { buildConnectionsPrintModel } from '../pdf/model'
import { printConnectionsPdf } from '../pdf/printConnectionsPdf'
import type { GameData } from './useGame'

/**
 * Every command connections offers, bound once: the info column's action row
 * places them, the menu lists them, and their keys fire them — all reading the
 * same action, so the surfaces cannot drift.
 */
export type ConnectionsActions = {
  // Each key is spelled as its action's id (`act-reveal` → `actReveal`), so a
  // grep for either finds every trace of the action
  // (src/guards/actionIds.test.ts).
  //
  // Unfold or fold the inline hint list; its words move with it. Gone, row
  // and button, once you can no longer submit.
  actHint: Action
  // Show the categories nobody got — or put them away, bringing back the board
  // as the game ended. A local display toggle, no RPC; it carries its own
  // faces, the inert "solution already shown" included.
  actReveal: Action
  // Solve THIS puzzle again from scratch — same sixteen tiles, same shuffle.
  actRestart: Action
  // Start the NEXT unplayed daily puzzle — connections' archive is dated, so
  // this walks forward rather than re-rolling a board. Disables itself while
  // the create is in flight.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in a race.
  actStopGame: Action
  // Print the board and the log; the menu's alone, with no twin in the row.
  actPrintBoard: Action
  // Leave for the club page — the shell's own, off `PlayAreaLoaderProps.menu`,
  // carried here so a surface that places the row has every action in one
  // object.
  actBackToClub: Action
}

/**
 * Bind every connections command and publish the game's menu from them. Hands
 * back the `actions`, for the info column's action row; `solutionShown` and
 * `hintsOpen`, the reveal's and the hint list's local state; and
 * `acknowledgeModal`, the notice New game shows when the archive is spent, for
 * the surface to render.
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
  clubHandle: string
  brand: string
} & Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'>): {
  actions: ConnectionsActions
  solutionShown: boolean
  hintsOpen: boolean
  acknowledgeModal: ReactNode
} {
  // The shared trio — Stop / Concede / Restart. connections' own bit is which
  // `db` they call.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.gameId,
    isTerminal: gd.isGameEnded,
    mode: gd.mode,
    isLocallyTerminal: gd.standing.isLocallyTerminal,
    localFeedbackSlot,
  })

  // The inline hint list, open or closed; the info column draws it.
  const [hintsOpen, setHintsOpen] = useState(false)
  const actHint = useBindAction('act-hint', {
    describe: () =>
      gd.standing.isStillPlaying
        ? { state: 'active', label: hintsOpen ? 'Hide hints' : 'Hints' }
        : 'hidden',
    run: () => setHintsOpen((o) => !o),
  })

  // The categories nobody got show only when I ask, and the ask is local and
  // reversible (`useSolutionReveal`). `impliedBy` is the exception: matching
  // all four IS the win, so a solver's board already carries every band.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.standing.hasSolved })

  // Reveal — nothing is written and no peer is affected. Both faces come from
  // `describeReveal`, where the rule for every game's reveal lives.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play.
      // The menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (gd.standing.isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution', revealed: solutionShown, impliedBySolve, isTerminal: gd.isGameEnded,
      })
    },
    run: toggleSolution,
  })

  // The notice New game shows when the archive is spent.
  const { acknowledge, acknowledgeModal } = useAcknowledge()

  // New game — the NEXT unplayed puzzle, with this game's setup, players and
  // mode. The server picks the date (`next_puzzle_for_club`, reached by
  // omitting `puzzle_id`), the same answer the setup dialog previews.
  async function createNewGame() {
    const playerUserIds = gd.players.map((p) => p.user_id)
    // Ask first, so a spent archive is a NOTICE rather than a failed create.
    // The answer is advisory — `create_game` derives it again.
    const preview = await runRpc<PuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { p_seen_by: playerUserIds }),
    )
    if (preview.type === 'not-ok' && preview.dbcode === 'PN302') {
      // The archive is spent. The server's sentence names the setup form's
      // date field, which this path has no form for, so this says the two ways
      // forward instead (docs/envelopes.md → Who writes the words).
      await acknowledge({
        title: 'No more puzzles',
        message:
          'Everyone playing has already done every puzzle we have. Import more with '
          + '`gmake g-connections-puzzles`, or pick a date in the setup dialog to replay one.',
        okLabel: 'Got it',
      })
      return
    } else if (preview.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(preview))
      return
    } else if (preview.type === 'ok' && preview.data.result === 'found') {
      // A puzzle is waiting, so the create below runs.
    } else {
      reportUnhandled('next_puzzle_for_club', preview)
      return
    }

    // `puzzle_id` absent is how `create_game` is told to choose; carrying this
    // game's forward would restart the puzzle just finished.
    const carried = { ...gd.setup }
    delete carried.puzzle_id
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: carried,
        p_player_user_ids: playerUserIds,
        p_mode: gd.mode,
      }),
    )
    if (res.type === 'not-ok') {
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
  // taking two puzzles out of the archive.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.isGameEnded,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.isGameEnded ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). RLS already scopes the log to what I may see, so the
  // paper shows what the screen does.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printConnectionsPdf(
        buildConnectionsPrintModel({
          brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          categories: gd.puzzle.board.categories,
          matched: gd.matchedCategories,
          unmatched: solutionShown
            ? unmatchedCategories(gd.puzzle.board, gd.matchedCategories)
            : [],
          remainingTiles: gd.puzzle.remainingTiles,
          guesses: gd.events,
          players: gd.players,
          selfId,
          mode: gd.mode,
          isTerminal: gd.isGameEnded,
          mistakeCount: gd.readout.mistakeCount,
          mistakeBudget: gd.readout.maxMistakes,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // The FULL connections menu. `buildGameMenu` supplies the framing (Help and
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
          // The menu twin of the info column's Hints button.
          { items: [actHint] },
          // The same three the ending's action row offers, reachable mid-game
          // too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actHint, actReveal, actRestart, actNewGame, actPrintBoard])

  return {
    actions: {
      actHint,
      actReveal,
      actRestart,
      actNewGame,
      actConcede,
      actStopGame,
      actPrintBoard,
      actBackToClub: menu.actBackToClub,
    },
    solutionShown,
    hintsOpen,
    acknowledgeModal,
  }
}
