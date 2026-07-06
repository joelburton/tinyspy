import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { stickyPill, terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { cls } from '../../common/lib/util/cls'
import {
  activeClueNumber,
  advanceAfterFill,
  findCellByNumber,
  initialCursor,
  jumpClue,
  wordCells,
  type Cursor,
} from '../lib/cursor'
import type { CellPos } from '../lib/cursor'
import type { Cell, Direction, MarkSide, PuzzleState, PuzzleTemplate, Scope } from '../lib/types'
import { nextMarkState } from '../lib/marks'
import { printCrosswordsPdf } from '../pdf/printCrosswordsPdf'
import type { CellsMap } from '../hooks/useCells'
import { colorVarFor } from '../../common/lib/color/memberColor'
import { useGame } from '../hooks/useGame'
import { cellKey, useCells } from '../hooks/useCells'
import { usePeerCursors } from '../hooks/usePeerCursors'
import { useGridKeyboard, type GridKeyboard } from '../hooks/useGridKeyboard'
import { Grid, type RebusPostCommit } from './Grid'
import { NumberJumpDialog } from './NumberJumpDialog'
import { NoteDialog } from './NoteDialog'
import { ClueLists } from './ClueLists'
import { Controls } from './Controls'
import { db } from '../db'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * The crosswords coordinator: owns the cursor, wires the keyboard, merges
 * the immutable template (`useGame`) with the live fills (`useCells`), and
 * renders the play surface (the documented layout exception). The solve /
 * end-game flow arrives through ctx (`useCommonGame` refetches common.games
 * when set_cell ends the game), so this component just reacts to `isTerminal`.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, playState, goToClub, session, status, menu } = ctx
  const myId = session.user.id

  const { game } = useGame(gameId)
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
  const ownerId = mode === 'compete' ? myId : null
  const { cells, setCell, setMark } = useCells(gameId, ownerId)

  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({
    locked: isTerminal,
  })

  const [pencil, setPencil] = useState(false)
  const [rebus, setRebus] = useState<{ row: number; col: number } | null>(null)
  const [numberJumpOpen, setNumberJumpOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  // The read-only zoom-peek (Shift+Space): the cell + a snapshot of its fill.
  const [peek, setPeek] = useState<{ row: number; col: number; value: string } | null>(null)
  // The answer grid — shielded mid-game, fetched from games_state at terminal
  // to fill in the blanks (esp. after a coop give-up).
  const [solution, setSolution] = useState<(string[] | null)[][] | null>(null)
  useEffect(() => {
    if (!isTerminal) return
    let active = true
    void (async () => {
      const { data } = await db.from('games_state').select('solution').eq('id', gameId).single()
      if (active && data?.solution) setSolution(data.solution as unknown as (string[] | null)[][])
    })()
    return () => {
      active = false
    }
  }, [isTerminal, gameId])

  const grid = game?.meta.cells ?? null
  const [cursor, setCursor] = useState<Cursor | null>(null)
  // Seed the cursor the first render the grid is available (React's
  // "derive state during render" pattern — guarded so it runs once; a
  // no-op setState to the same null value bails out).
  if (grid && cursor === null) {
    const seed = initialCursor(grid)
    if (seed) setCursor(seed)
  }

  const myConceded = players.find((p) => p.user_id === myId)?.conceded ?? false
  const isPlayable = playState === 'playing' && !isTerminal && !myConceded

  // Coop presence on the SHARED grid: teammates' cursors + a short flash on
  // cells they just filled. All empty in compete (private grids).
  const myColor = players.find((p) => p.user_id === myId)?.color ?? ''
  const { peers, recentFills, broadcastFill } = usePeerCursors(
    gameId,
    mode === 'coop',
    cursor,
    myId,
    myColor,
  )

  // Write a cell (optimistic) + surface any RPC error. Solved → terminal
  // flow lands via ctx.isTerminal; the terminal pill effect below shows it.
  // On a coop letter, also announce the fill so teammates flash it in my
  // color (a no-op in compete — broadcastFill is disabled there).
  const handleSetCell = useCallback(
    async (row: number, col: number, fill: string | null, pencil: boolean) => {
      clearLocalFeedback()
      const res = await setCell(row, col, fill, pencil)
      if ('error' in res) {
        showLocalFeedback(stickyPill('error', res.error))
        return
      }
      if (fill != null) broadcastFill(row, col)
    },
    [setCell, showLocalFeedback, clearLocalFeedback, broadcastFill],
  )

  // Cycle a cryptic edge mark (none → break → hyphen → none) on the cursor
  // cell's right/bottom edge, then persist via set_mark. Display-only, so no
  // cursor move + no solve — just the write (with the same error surfacing).
  const handleMark = useCallback(
    async (row: number, col: number, side: MarkSide) => {
      const cur = cells.get(cellKey(row, col))
      const current = side === 'right' ? cur?.markRight : cur?.markBottom
      const res = await setMark(row, col, side, nextMarkState(current ?? undefined))
      if ('error' in res) showLocalFeedback(stickyPill('error', res.error))
    },
    [cells, setMark, showLocalFeedback],
  )

  // Latest play state for the window keyboard handler (dodges stale
  // closures). Written in an effect (runs after every render), not during
  // render — the handler reads `.current` at event time.
  const kbRef = useRef<GridKeyboard | null>(null)
  useEffect(() => {
    const fillAt = (r: number, c: number) => {
      const t = grid?.[r]?.[c]
      if (t?.kind === 'cell' && t.given === true) return t.fill ?? null
      return cells.get(cellKey(r, c))?.fill ?? null
    }
    kbRef.current =
      grid && cursor
        ? {
            enabled: isPlayable,
            // A modal (rebus overlay / number-jump) owns the keyboard.
            suspended: rebus !== null || numberJumpOpen,
            grid,
            cursor,
            pencil,
            setCursor,
            fillAt: (r, c) => cells.get(cellKey(r, c))?.fill ?? null,
            isGiven: (r, c) => {
              const t = grid[r]?.[c]
              return t?.kind === 'cell' && t.given === true
            },
            setCell: (r, c, fill, pencil) => void handleSetCell(r, c, fill, pencil),
            onRebus: (r, c) => setRebus({ row: r, col: c }),
            onNumberJump: () => setNumberJumpOpen(true),
            onPeek: (r, c) => setPeek({ row: r, col: c, value: fillAt(r, c) ?? '' }),
            clearPeek: () => setPeek(null),
            onMark: (r, c, side) => void handleMark(r, c, side),
          }
        : null
  }, [grid, cursor, isPlayable, pencil, cells, handleSetCell, handleMark, rebus, numberJumpOpen])
  useGridKeyboard(kbRef)

  const handleRebusCommit = useCallback(
    (value: string, post: RebusPostCommit) => {
      if (!rebus || !grid) return
      void handleSetCell(rebus.row, rebus.col, value || null, pencil)
      // Enter advances one cell; Tab / Shift+Tab jumps to the next / previous
      // clue (the cursor sits on the rebus cell, so both operate from there).
      setCursor((cur) => {
        if (!cur) return cur
        if (post === 'jumpNext') return jumpClue(grid, cur, 1)
        if (post === 'jumpPrev') return jumpClue(grid, cur, -1)
        return advanceAfterFill(grid, cur)
      })
      setRebus(null)
    },
    [rebus, grid, handleSetCell, pencil],
  )

  const onCellClick = useCallback(
    (row: number, col: number) => {
      clearLocalFeedback()
      setCursor((prev) => {
        if (!prev) return { row, col, dir: 'across' }
        // Clicking the cell you're already on toggles direction.
        if (prev.row === row && prev.col === col) {
          return { ...prev, dir: prev.dir === 'across' ? 'down' : 'across' }
        }
        return { row, col, dir: prev.dir }
      })
    },
    [clearLocalFeedback],
  )

  const onClueClick = useCallback(
    (number: number, direction: Direction) => {
      if (!grid) return
      const pos = findCellByNumber(grid, number)
      if (pos) setCursor({ row: pos.row, col: pos.col, dir: direction })
    },
    [grid],
  )

  // Teammates' cursor cells + recently-filled cells → CSS colors for the Grid.
  const peerCells = useMemo(() => {
    const m = new Map<string, string>()
    for (const pc of peers.values()) m.set(cellKey(pc.row, pc.col), colorVarFor(pc.color))
    return m
  }, [peers])
  const recentFillCells = useMemo(() => {
    const m = new Map<string, string>()
    for (const [key, color] of recentFills) m.set(key, colorVarFor(color))
    return m
  }, [recentFills])

  // "Print board (PDF)" menu item. The grid is snapshotted at click-time via a
  // ref, so the menu item is set once (not rebuilt on every keystroke). The
  // PDF is a verbatim port of crossplay's — puzzle only, no answer key.
  const printStateRef = useRef<PuzzleState | null>(null)
  useEffect(() => {
    printStateRef.current = game
      ? { meta: game.meta, snapshot: { version: 0, cells: buildPrintCells(game.meta, cells) } }
      : null
  })
  useEffect(() => {
    if (!game) return
    const title = game.meta.title || 'crossword'
    // Some puzzles carry a setter's note (theme hints, constructor remarks);
    // the menu item opens it, disabled when there's none.
    const hasNote = (game.meta.note ?? '').trim().length > 0
    menu.setGameItems([
      {
        id: 'note',
        label: 'Show note',
        disabled: !hasNote,
        onClick: () => setNoteOpen(true),
      },
      {
        id: 'print',
        label: 'Print board (PDF)',
        onClick: () => {
          const s = printStateRef.current
          if (s) void printCrosswordsPdf(s, title)
        },
      },
    ])
    return () => menu.setGameItems([])
  }, [menu, game])

  // Active word highlight + the two axis clue numbers under the cursor.
  const highlighted = useMemo(
    () =>
      grid && cursor
        ? new Set(wordCells(grid, cursor.row, cursor.col, cursor.dir).map((p) => cellKey(p.row, p.col)))
        : new Set<string>(),
    [grid, cursor],
  )
  const acrossNumber = grid && cursor ? activeClueNumber(grid, cursor.row, cursor.col, 'across') : null
  const downNumber = grid && cursor ? activeClueNumber(grid, cursor.row, cursor.col, 'down') : null
  const dir = cursor?.dir ?? 'across'
  const activeNumber = dir === 'across' ? acrossNumber : downNumber
  const activeClueText = useMemo(() => {
    if (!game || activeNumber == null) return ''
    const list = game.meta.clues[dir]
    return list.find((c) => c.number === activeNumber)?.text ?? ''
  }, [game, activeNumber, dir])

  const over: TerminalCopy | null = isTerminal ? buildOver(playState, status, mode, myId) : null

  // What the below-board pill slot shows: an active local pill (own-move
  // result, or the terminal verdict pushed in by the effect below) wins;
  // otherwise a conceded compete player gets the standard "you're out, the
  // rest race on" indicator so their greyed-out input has an explanation.
  const slotPill: GenericFeedbackMsg | null =
    localFeedback ?? (myConceded && !isTerminal ? outOfRacePill(true) : null)

  // Surface the terminal verdict in the active-clue slot (the reserved
  // 3-line home), permanently (`locked`).
  useEffect(() => {
    if (isTerminal && over) showLocalFeedback(terminalPill(over.tone, over.verdict))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTerminal, over?.verdict])

  const handleEndGame = useCallback(async () => {
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `End game failed: ${error.message}`))
  }, [gameId, showLocalFeedback])

  const handleConcede = useCallback(async () => {
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `Concede failed: ${error.message}`))
  }, [gameId, showLocalFeedback])

  // Resolve a check/reveal scope to the target coordinates the RPCs want.
  const scopeCells = useCallback(
    (scope: Scope): CellPos[] => {
      if (!grid || !cursor) return []
      if (scope === 'letter') return [{ row: cursor.row, col: cursor.col }]
      if (scope === 'word') return wordCells(grid, cursor.row, cursor.col, cursor.dir)
      const out: CellPos[] = []
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r]!.length; c++) {
          if (grid[r]![c]!.kind === 'cell') out.push({ row: r, col: c })
        }
      }
      return out
    },
    [grid, cursor],
  )

  const handleCheck = useCallback(
    async (scope: Scope) => {
      const target = scopeCells(scope)
      if (target.length === 0) return
      clearLocalFeedback()
      const { error } = await db.rpc('check_cells', { target_game: gameId, p_cells: target })
      if (error) showLocalFeedback(stickyPill('error', `Check failed: ${error.message}`))
    },
    [scopeCells, gameId, showLocalFeedback, clearLocalFeedback],
  )

  const handleReveal = useCallback(
    async (scope: Scope) => {
      const target = scopeCells(scope)
      if (target.length === 0) return
      clearLocalFeedback()
      const { error } = await db.rpc('reveal_cells', { target_game: gameId, p_cells: target })
      if (error) showLocalFeedback(stickyPill('error', `Reveal failed: ${error.message}`))
    },
    [scopeCells, gameId, showLocalFeedback, clearLocalFeedback],
  )

  if (!game || !cursor) {
    return (
      <div className={cls(styles.wrap, styles.loading)}>
        <p className="muted">Loading puzzle…</p>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.layout}>
        <div className={styles.boardSlot}>
          <Grid
            meta={game.meta}
            cells={cells}
            cursorRow={cursor.row}
            cursorCol={cursor.col}
            highlighted={highlighted}
            onCellClick={onCellClick}
            rebus={
              rebus ? { ...rebus, initial: cells.get(cellKey(rebus.row, rebus.col))?.fill ?? '' } : null
            }
            onRebusCommit={handleRebusCommit}
            onRebusCancel={() => setRebus(null)}
            peek={peek}
            solution={solution}
            peerCells={peerCells}
            recentFills={recentFillCells}
          />
        </div>

        <div className={styles.clues}>
          <ClueLists
            across={game.meta.clues.across}
            down={game.meta.clues.down}
            acrossNumber={acrossNumber}
            downNumber={downNumber}
            dir={dir}
            onClueClick={onClueClick}
          />
        </div>

        {/* Active-clue bar — doubles as the local-feedback slot. Priority:
            an active local pill (own move / terminal verdict), else the
            "you conceded, others race on" indicator for a conceded compete
            player, else the active clue. */}
        <div className={styles.activeClue}>
          {slotPill ? (
            <GenericFeedbackPill msg={slotPill} onClose={clearLocalFeedback} />
          ) : (
            activeNumber != null && (
              <>
                <span className={styles.activeClueLabel}>
                  {activeNumber}
                  {dir === 'across' ? 'A' : 'D'}
                </span>
                <span className={styles.activeClueText}>{activeClueText}</span>
              </>
            )
          )}
        </div>

        {/* Chrome strip: the action row (End / Concede; back-to-club at
            terminal). The state readout + setup recap are deliberately
            omitted for now — to be reintroduced elsewhere on the page. */}
        <div className={styles.strip}>
          {!isTerminal && (
            <div className={styles.toolRow}>
              <Controls
                mode={mode}
                pencil={pencil}
                onPencilChange={setPencil}
                onCheck={(scope) => void handleCheck(scope)}
                onReveal={(scope) => void handleReveal(scope)}
                disabled={!isPlayable}
              />
              {isPlayable && (
                <div className={styles.actionRight}>
                  {mode === 'compete' ? (
                    <ConcedeGameButton
                      className={styles.compactAction}
                      onClick={() => void handleConcede()}
                    />
                  ) : (
                    <EndGameButton
                      className={styles.compactAction}
                      onClick={() => void handleEndGame()}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          {isTerminal && (
            <div className={styles.actions}>
              <BackToClubButton onClick={goToClub} />
            </div>
          )}
        </div>
      </div>

      {numberJumpOpen && (
        <NumberJumpDialog
          onSubmit={(n) => {
            if (!grid) return false
            const pos = findCellByNumber(grid, n)
            if (!pos) return false
            setCursor((cur) => ({ row: pos.row, col: pos.col, dir: cur?.dir ?? 'across' }))
            setNumberJumpOpen(false)
            return true
          }}
          onClose={() => setNumberJumpOpen(false)}
        />
      )}

      {noteOpen && game.meta.note && (
        <NoteDialog
          title={game.meta.title || 'Puzzle note'}
          note={game.meta.note}
          onClose={() => setNoteOpen(false)}
        />
      )}

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/** Merge the immutable template + live fills into the `Cell[][]` the PDF
 *  printer draws (given letters + current player fills; pencil flag kept). */
function buildPrintCells(meta: PuzzleTemplate, cells: CellsMap): Cell[][] {
  return meta.cells.map((row, r) =>
    row.map((t, c): Cell => {
      if (t.kind === 'block') return t
      const given = t.given === true
      const live = given ? undefined : cells.get(cellKey(r, c))
      return {
        kind: 'cell',
        number: t.number,
        fill: given ? (t.fill ?? null) : (live?.fill ?? null),
        ...(t.circled ? { circled: true } : {}),
        ...(t.shaded ? { shaded: true } : {}),
        ...(given ? { given: true } : {}),
        ...(live?.pencil ? { pencil: true } : {}),
        ...(live?.markRight ? { markRight: live.markRight } : {}),
        ...(live?.markBottom ? { markBottom: live.markBottom } : {}),
      }
    }),
  )
}

/** Map the terminal play_state to the shared TerminalCopy shape. */
function buildOver(
  playState: string,
  status: Record<string, unknown> | null,
  mode: 'coop' | 'compete',
  myId: string,
): TerminalCopy {
  const winner = status?.winner as string | undefined
  const winnerName = status?.winner_username as string | undefined
  switch (playState) {
    case 'won':
      return { outcome: 'won', verdict: 'Solved!', message: 'Solved!', tone: 'won' }
    case 'won_compete':
      return winner === myId
        ? { outcome: 'won', verdict: 'You solved it first!', message: 'You won!', tone: 'won' }
        : {
            outcome: 'lost',
            verdict: winnerName ? `Beaten to it by ${winnerName}.` : 'Beaten to it.',
            message: 'You lost',
            tone: 'lost',
          }
    case 'lost_compete':
      return { outcome: 'lost', verdict: 'Out of the race.', message: 'You lost', tone: 'lost' }
    case 'lost':
      // crosswords has no timer; `lost` is only reached when every remaining
      // compete player concedes (common.concede's last-active-conceder path).
      return { outcome: 'lost', verdict: 'Everyone conceded.', message: 'Game over', tone: 'lost' }
    case 'ended':
    default:
      return endedCopy(mode)
  }
}
