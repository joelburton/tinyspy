import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { cls } from '../../common/lib/util/cls'
import {
  activeClueNumber,
  advanceAfterFill,
  findCellByNumber,
  initialCursor,
  wordCells,
  type Cursor,
} from '../lib/cursor'
import type { CellPos } from '../lib/cursor'
import type { Direction, Scope } from '../lib/types'
import { useGame } from '../hooks/useGame'
import { cellKey, useCells } from '../hooks/useCells'
import { useGridKeyboard, type GridKeyboard } from '../hooks/useGridKeyboard'
import { Grid } from './Grid'
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
  const { gameId, players, isTerminal, playState, goToClub, session, status } = ctx
  const myId = session.user.id

  const { game } = useGame(gameId)
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
  const ownerId = mode === 'compete' ? myId : null
  const { cells, setCell } = useCells(gameId, ownerId)

  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({
    locked: isTerminal,
  })

  const [pencil, setPencil] = useState(false)
  const [rebus, setRebus] = useState<{ row: number; col: number } | null>(null)
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

  // Write a cell (optimistic) + surface any RPC error. Solved → terminal
  // flow lands via ctx.isTerminal; the terminal pill effect below shows it.
  const handleSetCell = useCallback(
    async (row: number, col: number, fill: string | null, pencil: boolean) => {
      clearLocalFeedback()
      const res = await setCell(row, col, fill, pencil)
      if ('error' in res) showLocalFeedback(stickyPill('error', res.error))
    },
    [setCell, showLocalFeedback, clearLocalFeedback],
  )

  // Latest play state for the window keyboard handler (dodges stale
  // closures). Written in an effect (runs after every render), not during
  // render — the handler reads `.current` at event time.
  const kbRef = useRef<GridKeyboard | null>(null)
  useEffect(() => {
    kbRef.current =
      grid && cursor
        ? {
            enabled: isPlayable,
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
          }
        : null
  }, [grid, cursor, isPlayable, pencil, cells, handleSetCell])
  useGridKeyboard(kbRef)

  const handleRebusCommit = useCallback(
    (value: string) => {
      if (!rebus || !grid) return
      void handleSetCell(rebus.row, rebus.col, value || null, pencil)
      setCursor((cur) => (cur ? advanceAfterFill(grid, cur) : cur))
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
            solution={solution}
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

        {/* Active-clue bar — doubles as the local-feedback slot. */}
        <div className={styles.activeClue}>
          {localFeedback ? (
            <GenericFeedbackPill msg={localFeedback} onClose={clearLocalFeedback} />
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

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
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
      return { outcome: 'lost', verdict: "Time's up.", message: 'Game over', tone: 'lost' }
    case 'ended':
    default:
      return endedCopy(mode)
  }
}
