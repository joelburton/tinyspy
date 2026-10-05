// cs-unmet

import { useEffect, type ReactNode } from 'react'
import { useBindAction } from '@/common/actions/useBindAction'
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
import { buildStrandsPrintModel } from '../pdf/model'
import { printStrandsPdf } from '../pdf/printStrandsPdf'
import type { GActions, GGameData, GPuzzleAnswer } from '../types'

/**
 * Bind every strands command the info column places and publish the game's
 * menu from them. Hands back the `actions`, for the action row;
 * `solutionShown`, the reveal's local state, which the board and the info
 * column read to draw the unfound words; and `acknowledgeModal`, the notice New
 * game shows when the archive is spent, for the surface to render.
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
  solutionShown: boolean
  acknowledgeModal: ReactNode
} {
  // The shared trio — Stop / Concede / Restart. Stop is coop's neutral
  // whole-table stop, Concede compete's drop-out, and Restart runs THIS puzzle
  // back: same board, everything the players did wiped.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isTerminal: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: by solving, or by conceding.
    isLocallyTerminal: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  // Show the unfound words. They are NOT shown just because the game ended:
  // the ask is LOCAL and reversible (`useSolutionReveal`), mine alone, so a
  // rival still looking keeps their board untouched while I look.
  //
  // `impliedBy` is the exception: the puzzle words TILE the board, so solving
  // it traces every one — there are no unfound words left to draw. What the
  // reveal still adds is the info column's word list, which names them as
  // click-to-define text. MY solve, not the game's verdict: a coop solve stamps
  // every teammate, and a rival still tracing hasn't earned it.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.me.solved })
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // A BUTTON only once the game has ended, when there is an answer to
      // show. The menu row keeps it all game, grayed, because it NAMES the
      // glyph.
      if (!gd.ended && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: solutionShown, impliedBySolve, isTerminal: gd.ended })
    },
    run: toggleSolution,
  })

  // The notice New game shows when the archive is spent.
  const { acknowledge, acknowledgeModal } = useAcknowledge()

  // New game — the NEXT puzzle nobody at the table has played, with this game's
  // setup, players and mode. The server picks it (`next_puzzle_for_club`,
  // reached by omitting `puzzle_id`), the same answer the setup dialog previews.
  // Restart is for replaying this one.
  async function createNewGame() {
    const playerUserIds = gd.players.map((p) => p.id)
    // Ask first, so a spent archive is a NOTICE rather than a failed create.
    // The answer is advisory — `create_game` derives it again.
    const preview = await runRpc<GPuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { p_seen_by: playerUserIds }),
    )
    if (preview.type === 'not-ok' && preview.dbcode === 'PN416') {
      // The archive is spent. The server's sentence names the setup form's
      // date field, which this path has no form for, so this says how to get
      // more puzzles instead (docs/envelopes.md → Who writes the words).
      await acknowledge({
        title: 'No unplayed puzzle',
        message:
          'Everyone playing has already done every puzzle we have. Run '
          + '`gmake g-strands-fetch` to pick up new ones.',
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
        p_club_handle: gd.club.handle,
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
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game
  // rather than ending it) and goes straight through once the game has ended.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.ended,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.ended ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time
  // (common/pdf/doc.md). `gd` already holds only what I may see, and the
  // missed words go on paper only while they are on screen.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      const { nFoundPuzzleWords } = gd.stateLineData
      printStrandsPdf(
        buildStrandsPrintModel({
          header: {
            brand: gd.brand,
            gameTitle: gd.title,
            date: new Date().toLocaleDateString(),
            // The prompt leads, then the count. The prompt is in the title too,
            // but that truncates to clear the date — this line doesn't.
            summary: `“${gd.puzzle.title}” · ${nFoundPuzzleWords} word${nFoundPuzzleWords === 1 ? '' : 's'}`,
            mode: gd.mode,
            setupRows: gd.setupRows,
          },
          tiles: gd.puzzle.tiles,
          mode: gd.mode,
          ended: gd.ended,
          players: gd.players,
          me: gd.me,
          events: gd.events,
          nFoundPuzzleWords,
          nHintsUsed: gd.stateLineData.nHintsUsed,
          puzzleWords: solutionShown ? gd.puzzle.puzzleWords : null,
        }),
      )
    },
  })

  // The FULL strands menu. `buildGameMenu` supplies the framing (Help and chat
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
          // The same three the action row offers after its bar, in its order.
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
    solutionShown,
    acknowledgeModal,
  }
}
