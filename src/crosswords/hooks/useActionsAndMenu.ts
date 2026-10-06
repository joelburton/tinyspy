// cs-unmet

import { useEffect } from 'react'
import { useAction } from '@/common/actions/actionsStore'
import { useBindAction, type ActionState } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { describeReveal } from '@/common/reveal/describeReveal'
import { navigate } from '@/common/routing/router'
import { clubPath } from '@/common/routing/routes'
import { db } from '../db'
import { stripClueEmphasis } from '../lib/clueRuns'
import { activeClueNumber, listScopeCells, wordCells } from '../lib/cursor'
import { enumerationFor } from '../lib/enumeration'
import { writeIpuz } from '../lib/parse/ipuz'
import { printCrosswordsPdf, printCrosswordsSolutionPdf } from '../pdf/printCrosswordsPdf'
import { makePrintState } from '../pdf/printState'
import type { GActions, GGridEntry } from '../reactTypes'
import type { GBoard, GCellPos, GClueAsked, GGameData, GScope, GSolution } from '../types'

/** A download-safe filename stem from a puzzle id. Library ids are plain, but
 *  Guardian ids are slugs with slashes ("crosswords/quick/123"); collapse
 *  anything but word chars / dot / dash to '_'. */
function makeFileStem(id: string | undefined): string {
  return (id || 'crossword').replace(/[^\w.-]/g, '_')
}

/**
 * Bind every crosswords command and publish the game's menu from them — the
 * fullest menu in the app, crossplay's single column under the puzzle's title
 * and credits. Hands back the `actions` the strip places.
 *
 * An action is what the square, the menu row and the key all read, so none of
 * them can drift from another, and `pending` grays every surface of one for
 * the length of its run. A run reads the board and the cursor when it is
 * pressed, so nothing here keeps a copy of either.
 */
export function useActionsAndMenu({
  gd,
  board,
  entry,
  isInteractive,
  checkCells,
  revealCells,
  exportSolution,
  explainClue,
  showNote,
  collapseRebus,
  toggleCollapseRebus,
  solutionReveal,
  closeInfoSheet,
  localFeedbackSlot,
  menu,
}: {
  gd: GGameData
  // The board as drawn, my pending writes included: what the prints and the
  // explainer read.
  board: GBoard
  entry: GGridEntry
  // The board takes writes from me: the hint ladder and the pencil gray with it.
  isInteractive: boolean
  checkCells: (cells: GCellPos[]) => Promise<void>
  revealCells: (cells: GCellPos[]) => Promise<void>
  exportSolution: () => Promise<GSolution | null>
  explainClue: (clue: GClueAsked | null) => Promise<void>
  // Open the setter's note here, and ask teammates to open it too.
  showNote: () => void
  collapseRebus: boolean
  toggleCollapseRebus: () => void
  solutionReveal: { revealed: boolean; toggle: () => void }
  // On a phone the strip is inside the info sheet, which covers the grid and the
  // bar a check's or a reveal's answer lands in.
  closeInfoSheet: () => void
  localFeedbackSlot: FeedbackSlot
} & Pick<PlayAreaLoaderProps, 'menu'>): { actions: GActions } {
  const grid = gd.puzzle.cells

  // The shared trio — Stop / Concede / Restart. Restart clears EVERY grid (a
  // restart is for the table) and un-ends a finished puzzle.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.id,
    isTerminal: gd.ended,
    mode: gd.mode,
    // Out of the race while the game goes on: in this game, only by conceding.
    isLocallyTerminal: !gd.me.stillPlaying && !gd.ended,
    localFeedbackSlot,
  })

  /** Every tool in the bar — the hint ladder, and the pencil beside it —
   *  applies while the board is writable, and grays with it. */
  function describeWritable(): ActionState {
    return isInteractive ? 'active' : 'disabled'
  }
  /** …and Reveal is coop-only: revealing your own grid would trivially win a
   *  race, so in compete it isn't there at all. */
  function describeRevealScope(): ActionState {
    return gd.coop ? describeWritable() : 'hidden'
  }

  const actPencil = useBindAction('act-pencil', {
    // Named in both faces: this row says where ⌥P takes you.
    describe: () => ({ state: describeWritable(), label: entry.pencil ? 'Switch to pen' : 'Switch to pencil' }),
    run: entry.togglePencil,
  })

  function check(scope: GScope) {
    closeInfoSheet()
    return checkCells(listScopeCells(grid, entry.cursor, scope))
  }
  const actCheckLetter = useBindAction('act-check-letter', { describe: describeWritable, run: () => check('letter') })
  const actCheckWord = useBindAction('act-check-word', { describe: describeWritable, run: () => check('word') })
  const actCheckPuzzle = useBindAction('act-check-puzzle', { describe: describeWritable, run: () => check('puzzle') })

  // Reveal-grid's question lives in the registry, so the shared run asks it
  // before this is ever called (`act-reveal-puzzle`).
  function reveal(scope: GScope) {
    closeInfoSheet()
    return revealCells(listScopeCells(grid, entry.cursor, scope))
  }
  const actRevealLetter = useBindAction('act-reveal-letter', { describe: describeRevealScope, run: () => reveal('letter') })
  const actRevealWord = useBindAction('act-reveal-word', { describe: describeRevealScope, run: () => reveal('word') })
  const actRevealPuzzle = useBindAction('act-reveal-puzzle', { describe: describeRevealScope, run: () => reveal('puzzle') })

  // The setter's note, and the AI explainer that needs one. The explainer is for
  // cryptics and a note is the proxy, which is how crossplay gates it too.
  const hasNote = gd.puzzle.note.trim().length > 0
  const actShowNote = useBindAction('act-show-note', {
    describe: () => (hasNote ? 'active' : 'disabled'),
    run: showNote,
  })
  const askClue = makeClueAsker(gd, board, entry)
  const actExplainClue = useBindAction('act-explain-clue', {
    describe: () => (hasNote ? 'active' : 'disabled'),
    run: () => explainClue(askClue()),
  })

  // Display-only, and persisted per browser. Nothing about the game changes, so
  // it is live once the game has ended.
  const actCollapseRebuses = useBindAction('act-collapse-rebuses', {
    describe: () => ({ state: 'active', label: collapseRebus ? 'Expand rebuses' : 'Collapse rebuses' }),
    run: toggleCollapseRebus,
  })

  // Download the board as `.ipuz`: the puzzle, the fills as drawn and the answer
  // key, re-uploadable to carry on.
  const actDownloadIpuz = useBindAction('act-download-ipuz', {
    describe: () => 'active',
    run: async () => {
      const state = makePrintState(gd.puzzle, board)
      const solution = await exportSolution()
      if (solution === null) return
      const url = URL.createObjectURL(new Blob([writeIpuz(state, solution)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${makeFileStem(gd.puzzle.id)}.ipuz`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  // Print the puzzle — a snapshot at CLICK time (common/pdf/doc.md).
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => printCrosswordsPdf(makePrintState(gd.puzzle, board), gd.puzzle.title || 'crossword'),
  })

  // The answer key. Coop: any time, to solve on paper with the key face down.
  // Compete: only once the game is over — an answer key mid-race is a giveaway.
  // A gate here, not on the server: `export_solution` answers any player.
  const actPrintSolution = useBindAction('act-print-solution', {
    describe: () => (gd.compete && !gd.ended ? 'disabled' : 'active'),
    run: async () => {
      const state = makePrintState(gd.puzzle, board)
      const solution = await exportSolution()
      if (solution === null) return
      await printCrosswordsSolutionPdf(state, solution, `${makeFileStem(gd.puzzle.id)}-answers`)
    },
  })

  // The post-game answer grid: my own, reversible look (useSolutionReveal).
  const actReveal = useBindAction('act-reveal', {
    describe: () => describeReveal({ noun: 'solution', revealed: solutionReveal.revealed, isTerminal: gd.ended }),
    run: solutionReveal.toggle,
  })

  // New game opens the club's SETUP dialog rather than creating one: a
  // crossword's setup names a puzzle, so "the same again" would re-serve the
  // grid just solved (docs/games/crosswords.md → Terminal).
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.ended,
    describe: () => 'active',
    run: () => navigate(`${clubPath(gd.club.handle)}?new=${gd.gametype}`),
  })

  // ⌥S is the header's scratchpad mark's action; this row refers to it, and
  // drops out on a page with no scratchpad.
  const actOpenScratchpad = useAction('act-open-scratchpad')

  // The FULL crosswords menu, in crossplay's order: every play action is ALSO a
  // row, advertising its own key, because the menu is where a solver learns
  // them. `buildGameMenu` frames it — Help and chat above, the exits and Back to
  // club below.
  useEffect(function publishGameMenu() {
    // The puzzle's title and credits, pinned at the top, as crossplay's menu
    // shows them. Empty fields drop out.
    const header = {
      title: gd.puzzle.title || 'Untitled',
      lines: [
        gd.puzzle.author ? `by ${gd.puzzle.author}` : null,
        gd.puzzle.copyright || null,
      ].filter((line): line is string => line !== null),
    }
    menu.setGameSections(
      buildGameMenu({
        menu,
        header,
        // Each exit hides itself in the mode that isn't its own.
        exits: [actConcede, actStopGame],
        extra: [
          { items: [actPencil, entry.actRebus, actCollapseRebuses] },
          {
            items: [
              actShowNote,
              actExplainClue,
              ...(actOpenScratchpad ? [actOpenScratchpad] : []),
              actPrintBoard,
              actDownloadIpuz,
              actPrintSolution,
            ],
          },
          // The two hint families, each behind a submenu. `disabled` sits on the
          // parent, which cannot be opened; in compete all three Reveal children
          // hide, and a submenu with nothing to show drops out.
          {
            items: [
              { id: 'check', label: 'Check', disabled: !isInteractive, items: [actCheckLetter, actCheckWord, actCheckPuzzle] },
              { id: 'reveal', label: 'Reveal', disabled: !isInteractive, items: [actRevealLetter, actRevealWord, actRevealPuzzle] },
            ],
          },
          { items: [actRestart, actReveal, actNewGame] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, gd.puzzle.title, gd.puzzle.author, gd.puzzle.copyright, isInteractive,
    actConcede, actStopGame, actPencil, entry.actRebus, actCollapseRebuses, actShowNote,
    actExplainClue, actOpenScratchpad, actPrintBoard, actDownloadIpuz, actPrintSolution,
    actCheckLetter, actCheckWord, actCheckPuzzle, actRevealLetter, actRevealWord,
    actRevealPuzzle, actRestart, actReveal, actNewGame,
  ])

  return {
    actions: {
      actPencil,
      check: { letter: actCheckLetter, word: actCheckWord, puzzle: actCheckPuzzle },
      reveal: { letter: actRevealLetter, word: actRevealWord, puzzle: actRevealPuzzle },
      actConcede,
      actStopGame,
      actRestart,
      actReveal,
      actNewGame,
      actBackToClub: menu.actBackToClub,
    },
  }
}

/**
 * The explainer's question about the clue under the cursor, worked out when
 * asked: its label ("12A"), its cells, the plain clue and its enumeration off
 * the board's edge marks. Null when the cursor is on no clue.
 */
function makeClueAsker(gd: GGameData, board: GBoard, entry: GGridEntry) {
  return function askClue(): GClueAsked | null {
    const { row, col, dir } = entry.cursor
    const number = activeClueNumber(gd.puzzle.cells, row, col, dir)
    const text = number === null ? undefined : gd.puzzle.clues[dir].find((c) => c.number === number)?.text
    if (number === null || !text) return null
    const word = wordCells(gd.puzzle.cells, row, col, dir)
    return {
      label: `${number}${dir === 'across' ? 'A' : 'D'}`,
      cells: word,
      clueText: stripClueEmphasis(text),
      enumeration: enumerationFor(word, board, dir),
    }
  }
}
