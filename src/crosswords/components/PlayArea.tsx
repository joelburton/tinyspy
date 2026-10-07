// cs-unmet

import { useMemo, useState } from 'react'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { colorVarFor } from '@/common/members/memberColor'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useStickyChoice } from '@/common/web-storage/useStickyChoice'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useCheckCells } from '../hooks/useCheckCells'
import { useExplainClue } from '../hooks/useExplainClue'
import { useExportSolution } from '../hooks/useExportSolution'
import { useGame } from '../hooks/useGame'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useGridEntry } from '../hooks/useGridEntry'
import { usePeerCursors } from '../hooks/usePeerCursors'
import { usePendingWrites } from '../hooks/usePendingWrites'
import { useRevealCells } from '../hooks/useRevealCells'
import { useSetCell } from '../hooks/useSetCell'
import { useSetMark } from '../hooks/useSetMark'
import { useTeammateFills } from '../hooks/useTeammateFills'
import { makeCellId } from '../lib/cellId'
import { findActiveClueNumber, findCellByNumber, listWordCells } from '../lib/cursor'
import type { GDirection, GGameData } from '../types'
import { ActiveClueBar } from './ActiveClueBar'
import { ClueLists } from './ClueLists'
import { CrosswordsExplainCompanion } from './CrosswordsExplainCompanion'
import { CrosswordsNoteCompanion } from './CrosswordsNoteCompanion'
import { CrosswordsNumberJumpBlockingModal } from './CrosswordsNumberJumpBlockingModal'
import { Grid } from './Grid'
import { ToolStrip } from './ToolStrip'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Where the display-only "collapse rebuses" preference is remembered, per
 *  browser. Not per game or per player — it is how you like to READ a grid. */
const REBUS_KEY = 'puzpuzpuz:crosswords:collapseRebus'
const REBUS_OPTIONS = ['off', 'on'] as const

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface. The blob is in hand before this mounts, so there is
 * nothing to wait for (docs/playarea.md → The loader and the loaded component).
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd } = useGame(ctx)
  return <PlayArea gd={gd} menu={ctx.menu} />
}

type PlayAreaProps = Pick<PlayAreaLoaderProps, 'menu'> & {
  gd: GGameData
}

/**
 * crosswords' play surface — the coordinator. It owns the game data, the
 * board as drawn (my pending writes over the blob's), typing on the grid, the
 * trips to the server (a hook each), the local slot and the endings, and draws
 * the documented layout exception: the grid, the active-clue bar, the clue
 * lists and the strip, with no BoardCol or InfoCol between them
 * (docs/games/crosswords.md → Frontend).
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause.
 */
function PlayArea({ gd, menu }: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // On a phone the clue lists and the strip are in the off-canvas info sheet.
  const infoSheet = useInfoSheet()
  const closeInfoSheet = infoSheet.close

  // Confetti the moment the win is MINE, as the server ranked it: the team's
  // completed grid in coop, my solve first in a race.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // Display-only, persisted per browser: a multi-letter rebus drawn as its
  // first letter.
  const [rebusPref, setRebusPref] = useStickyChoice(REBUS_KEY, REBUS_OPTIONS, 'off')
  const collapseRebus = rebusPref === 'on'

  // The post-game answer grid, drawn over the fills while I have it on.
  const solutionReveal = useSolutionReveal()
  const [isNoteOpen, setIsNoteOpen] = useState(false)

  // ─── Derived ───────────────────────────────────────────

  // The board takes writes from me while I am still in the game. There is no
  // turn order, and a pause unmounts this surface.
  const isInteractive = gd.me.stillPlaying

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a refusal, the pencil note, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')
  // My ending's message: the game's once it has ended, mine while I have
  // conceded and the others play on.
  const { endingMessage, endedBy } = useGetEndingMessage(gd)
  const playerEndingMessage = endedBy === 'player' ? endingMessage : null
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage: endedBy === 'game' ? endingMessage : null,
    playerEndingMessage,
  })

  // ─── The move ──────────────────────────────────────────
  // My writes show at once, laid over the blob's board until it carries them.
  const { pendingWrites } = usePendingWrites({ board: gd.me.board, revision: gd.revision })
  const { setCell } = useSetCell({ gd, pendingWrites, localFeedbackSlot })
  const { setMark } = useSetMark({ gd, pendingWrites, localFeedbackSlot })
  const { entry } = useGridEntry({
    grid: gd.puzzle.cells,
    board: pendingWrites.board,
    isInteractive,
    // Walking a finished grid is part of the post-game.
    isNavigable: isInteractive || gd.ended,
    setCell: (row, col, fill, pencil) => void setCell(row, col, fill, pencil),
    setMark: (row, col, side, mark) => void setMark(row, col, side, mark),
    localFeedbackSlot,
  })
  const { checkCells } = useCheckCells({ gd, board: pendingWrites.board, localFeedbackSlot })
  const { revealCells } = useRevealCells({ gd, localFeedbackSlot })
  const { exportSolution } = useExportSolution({ gd, localFeedbackSlot })
  const { explanation, explainClue, closeExplanation } = useExplainClue({ gd })

  // ─── Narration ─────────────────────────────────────────
  // Teammates on the shared grid (coop): their cursors, their note asks, and
  // the cells they just filled, flashing in their color.
  const { peers, broadcastNote } = usePeerCursors(
    gd.id, gd.coop, entry.cursor, gd.me, () => setIsNoteOpen(true),
  )
  const teammateFills = useTeammateFills(gd.me.board, gd.me)

  // ─── The commands, and the menu that lists them ────────
  const { actions } = useActionsAndMenu({
    gd,
    board: pendingWrites.board,
    entry,
    isInteractive,
    checkCells,
    revealCells,
    exportSolution,
    explainClue,
    showNote: () => {
      setIsNoteOpen(true)
      broadcastNote()
    },
    collapseRebus,
    toggleCollapseRebus: () => setRebusPref(collapseRebus ? 'off' : 'on'),
    solutionReveal,
    closeInfoSheet,
    localFeedbackSlot,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  const grid = gd.puzzle.cells
  const { row, col, dir } = entry.cursor

  // The word under the cursor, and the two clues it sits in.
  const wordCellIds = useMemo(
    () => new Set(listWordCells(grid, row, col, dir).map((p) => makeCellId(p.row, p.col))),
    [grid, row, col, dir],
  )
  const acrossNumber = findActiveClueNumber(grid, row, col, 'across')
  const downNumber = findActiveClueNumber(grid, row, col, 'down')
  const activeNumber = dir === 'across' ? acrossNumber : downNumber
  const activeClueText = activeNumber === null
    ? null
    : (gd.puzzle.clues[dir].find((c) => c.number === activeNumber)?.text ?? null)
  const activeClue = activeNumber === null || activeClueText === null
    ? null
    : { label: `${activeNumber}${dir === 'across' ? 'A' : 'D'}`, text: activeClueText }

  // Teammates' cursor cells and fresh fills, as the colors the grid draws.
  const peerCursorColors = useMemo(
    () => new Map([...peers.values()].map((pc) => [makeCellId(pc.row, pc.col), colorVarFor(pc.color)])),
    [peers],
  )
  const fillFlashColors = useMemo(
    () => new Map([...teammateFills].map(([id, color]) => [id, colorVarFor(color)])),
    [teammateFills],
  )

  /** A clue clicked: the cursor goes to its start, reading its way. On a phone
   *  the lists cover the grid, so the sheet closes to show where it went. */
  function goToClue(number: number, clueDir: GDirection) {
    const pos = findCellByNumber(grid, number)
    if (pos !== null) entry.setCursor({ row: pos.row, col: pos.col, dir: clueDir })
    closeInfoSheet()
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.layout}>
        <div className={styles.boardSlot}>
          <Grid
            puzzle={gd.puzzle}
            board={pendingWrites.board}
            entry={entry}
            marks={{ wordCellIds, peerCursorColors, fillFlashColors, endingOutcome: gd.me.outcome }}
            solution={solutionReveal.revealed ? gd.puzzle.solution : null}
            collapseRebus={collapseRebus}
          />
        </div>

        {/* Desktop: mid-right column. Mobile: right under the grid. */}
        <ActiveClueBar localFeedbackSlot={localFeedbackSlot} clue={activeClue} />

        {/* Desktop: `display: contents` all the way down, so the lists and the
            strip are grid items of the layout. Mobile: the info sheet. */}
        <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
          <div className={styles.sheetContent}>
            <div className={styles.clues}>
              <ClueLists
                across={gd.puzzle.clues.across}
                down={gd.puzzle.clues.down}
                acrossNumber={acrossNumber}
                downNumber={downNumber}
                dir={dir}
                onClueClick={goToClue}
              />
            </div>
            <ToolStrip
              gd={gd}
              actions={actions}
              pencil={entry.pencil}
              playerEndingMessage={playerEndingMessage}
            />
          </div>
        </InfoSheet>
      </div>

      {entry.numberJump.isOpen && (
        <CrosswordsNumberJumpBlockingModal
          onSubmit={entry.numberJump.jumpTo}
          onClose={entry.numberJump.close}
        />
      )}

      {isNoteOpen && gd.puzzle.note && (
        <CrosswordsNoteCompanion
          title={gd.puzzle.title || 'Puzzle note'}
          note={gd.puzzle.note}
          onClose={() => setIsNoteOpen(false)}
        />
      )}

      {explanation && (
        <CrosswordsExplainCompanion
          clueLabel={explanation.label}
          state={explanation.state}
          onClose={closeExplanation}
        />
      )}

      {celebration.isOpen && (
        <CelebrationBlockingModal
          title={gd.coop ? 'Solved! 🎉' : 'You win! 🎉'}
          body={gd.coop ? 'The grid is complete.' : 'You solved it first.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
