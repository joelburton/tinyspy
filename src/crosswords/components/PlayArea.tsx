import { failureMessage, failureText } from '../../common/lib/game/serverError'
import { callRpc } from '../../common/lib/game/callRpc'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconNewGame, IconPrint, IconRestart, IconReveal, IconScratchpad } from '../../common/components/icons'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM, NEW_GAME_CONFIRM, RESTART_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { navigate } from '../../common/lib/routing/router'
import { setScratchpadOpen } from '../../common/lib/scratchpad/scratchpadOpenStore'
import { writeIpuz } from '../lib/parse/ipuz'
import { terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
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
import { SCOPE_LABEL, type Cell, type Direction, type MarkSide, type PuzzleState, type PuzzleTemplate, type Scope } from '../lib/types'
import { nextMarkState } from '../lib/marks'
import { printCrosswordsPdf, printCrosswordsSolutionPdf } from '../pdf/printCrosswordsPdf'
import type { CellsMap } from '../hooks/useCells'
import { colorVarFor } from '../../common/lib/color/memberColor'
import { useGame } from '../hooks/useGame'
import { cellKey, useCells } from '../hooks/useCells'
import { usePeerCursors } from '../hooks/usePeerCursors'
import { useGridKeyboard, type GridKeyboard } from '../hooks/useGridKeyboard'
import { Grid, type RebusPostCommit } from './Grid'
import { NumberJumpDialog } from './NumberJumpDialog'
import { NoteDialog } from './NoteDialog'
import { ExplainDialog, type ExplainState } from './ExplainDialog'
import { enumerationFor } from '../lib/enumeration'
import { callEdgeFn } from '../../common/lib/supabase/callEdgeFn'
import { ClueLists } from './ClueLists'
import { ClueText } from './ClueText'
import { stripClueEmphasis } from '../lib/clueRuns'
import { Controls } from './Controls'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Timed info pill shown after a Check whose scope contained pencilled cells —
 *  Check skips them (see `handleCheck`), so this flags that they weren't tested.
 *  Unpunctuated: the pill is a one-line LABEL, not prose. */
const PENCIL_SKIPPED_MSG: GenericFeedbackMsg = {
  tone: 'info',
  text: 'Check skips pencil marks',
  mode: { kind: 'timed' },
}

/** A download-safe filename stem from a puzzle id. Library ids are plain, but
 *  Guardian ids are slugs with slashes ("crosswords/quick/123"); collapse
 *  anything but word chars / dot / dash to '_'. */
function fileStem(id: string | undefined): string {
  return (id || 'crossword').replace(/[^\w.-]/g, '_')
}

/**
 * The crosswords coordinator: owns the cursor, wires the keyboard, merges
 * the immutable template (`useGame`) with the live fills (`useCells`), and
 * renders the play surface (the documented layout exception). The solve /
 * end-game flow arrives through ctx (`useCommonGame` refetches common.games
 * when set_cell ends the game), so this component just reacts to `isTerminal`.
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, playState, solutionRevealed, goToClub, session, status, menu, clubHandle } =
    ctx
  const myId = session.user.id

  const { game } = useGame(gameId)
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
  const ownerId = mode === 'compete' ? myId : null
  const { cells, setCell, setMark } = useCells(gameId, ownerId)

  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({
    locked: isTerminal,
  })

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team completes the grid — the last correct cell
  // ends the game on every connected client via the common realtime refetch, so
  // everyone celebrates together; opening an already-solved game stays quiet
  // (useCelebration never pops on mount). Gated on playState ALONE: 'won' is
  // coop's win by the states vocabulary (compete writes 'won_compete'), and it
  // comes off the same common.games row GamePage already waited for — so it's
  // correct on the very first render, unlike anything read from `useGame`.
  const celebration = useCelebration(playState === 'won')

  // Mobile (docs/mobile.md): below --mobile the grid + the active-clue bar ARE
  // the main view (grid maximized; the bar is how you read the clue you're on),
  // and the clue lists + the check/reveal controls move into the off-canvas
  // "Game info" sheet. Keyboard-REQUIRED still holds — this is the layout for a
  // tablet (or phone) WITH a keyboard, not a touch-entry mode. `wide`: the
  // Across|Down columns want the full device width, like the WordList games.
  const infoSheet = useInfoSheet()
  // Stable alias for the callbacks below: `infoSheet.close` is a useCallback([])
  // (never changes), but the object identity does (isOpen flips), so depending
  // on the member keeps them from churning while satisfying exhaustive-deps.
  const closeInfoSheet = infoSheet.close

  const [pencil, setPencil] = useState(false)
  const [rebus, setRebus] = useState<{ row: number; col: number } | null>(null)
  const [numberJumpOpen, setNumberJumpOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  // Display-only "collapse rebuses" preference (crossplay parity), persisted
  // per browser. When on, multi-char rebus fills show only their first letter.
  const [collapseRebus, setCollapseRebus] = useState<boolean>(() => {
    try {
      return localStorage.getItem('crosswords:collapseRebus') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('crosswords:collapseRebus', collapseRebus ? '1' : '0')
    } catch {
      // localStorage unavailable (private mode) — in-memory state still works.
    }
  }, [collapseRebus])
  // The AI clue-explanation dialog: null = closed. `explainLabel` is the clue
  // it was opened for (e.g. "12A"), captured at click time.
  const [explain, setExplain] = useState<ExplainState | null>(null)
  const [explainLabel, setExplainLabel] = useState('clue')
  // The read-only zoom-peek (Shift+Space): the cell + a snapshot of its fill.
  const [peek, setPeek] = useState<{ row: number; col: number; value: string } | null>(null)
  // The answer grid — shielded mid-game; the server unshields it at terminal
  // (games_state.solution) but the FE does NOT fetch it automatically. The
  // blanks stay blank until someone asks, so ending a game doesn't spoil a
  // puzzle the group may want to keep chewing on. Crosswords is the one game
  // that never auto-shows on a win either: rebuses and quantum clues mean the
  // players' grid can legitimately differ from the author's, so their fill
  // stays on screen until they ask to see his.
  //
  // "Asked" is the common flag (`common.games.solution_revealed`), so the ask
  // is SHARED — one solver reveals and everyone's grid fills. The click writes
  // the flag; the effect below does the fetching, for the caller and for peers
  // alike. (Errors are tolerated silently, like the old auto-fetch was:
  // solution stays null and the control stays enabled for a retry.)
  const [solution, setSolution] = useState<(string[] | null)[][] | null>(null)
  const handleRevealBoard = useCallback(async () => {
    await commonDb.rpc('reveal_solution', { target_game: gameId })
  }, [gameId])
  useEffect(() => {
    if (!solutionRevealed || solution) return
    let alive = true
    void db
      .from('games_state')
      .select('solution')
      .eq('id', gameId)
      .single()
      .then(({ data }) => {
        if (alive && data?.solution) {
          setSolution(data.solution as unknown as (string[] | null)[][])
        }
      })
    return () => {
      alive = false
    }
  }, [solutionRevealed, solution, gameId])

  /**
   * The solution as the GRID may draw it — the fetched answers, but only while
   * the server still says they're revealed.
   *
   * `solution` above is a one-way cache: the effect only ever sets it, so it
   * outlived `solutionRevealed` going back to false. Nothing noticed until
   * Restart, which is the one action that clears every fill at once — and since
   * <Grid> paints an answer into any EMPTY cell that has one, a restart wiped
   * the player's letters and immediately painted the whole solution in their
   * place. It read as "Restart did nothing": the letters on screen didn't
   * change, they just stopped being yours.
   *
   * Derived rather than cleared, for two reasons: a sync setState in an effect
   * is a lint error here (docs/code-conventions.md), and deriving fixes EVERY
   * path that lowers the flag rather than the one that happened to be reported.
   * The cache itself stays — a restart replays the SAME puzzle, so a later
   * re-reveal needs no refetch.
   */
  const shownSolution = solutionRevealed ? solution : null

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
  const { peers, recentFills, broadcastFill, broadcastFills, broadcastNote } = usePeerCursors(
    gameId,
    mode === 'coop',
    cursor,
    myId,
    myColor,
    // A teammate hit "Show note" — open the setter's note here too (coop).
    () => setNoteOpen(true),
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
        // Classified, not raw: the compete race (a rival finishing while this
        // keystroke was in flight) shows game-not-in-play's "Game over" info
        // pill; a dead connection shows the `letter: Server; try refresh`
        // fault; anything else faults carrying what the server actually said.
        showLocalFeedback(failureMessage(res.error, 'letter'))
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
      if ('error' in res) showLocalFeedback(failureMessage(res.error, 'mark'))
    },
    [cells, setMark, showLocalFeedback],
  )

  // Does the puzzle carry a setter's note? Gates the Show-note / Explain menu
  // items AND their ⌥N / ⌥X keyboard shortcuts.
  const hasNote = (game?.meta.note ?? '').trim().length > 0

  // The ⌥-shortcut action handlers, held in a stable ref so the keyboard's
  // kbRef can call them without listing the (later-declared) handlers in its
  // deps. Populated by an effect once handleCheck/handleReveal/handleExplain
  // exist (below); read at key-event time, like kbRef itself.
  const actionsRef = useRef<{
    togglePencil: () => void
    check: (scope: Scope) => void
    reveal: (scope: Scope) => void
    enterRebus: () => void
    showNote: () => void
    explain: () => void
    endGame: () => void
    concede: () => void
    newGame: () => void
  } | null>(null)

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
            // Terminal keeps the keyboard ALIVE for navigation — walking the
            // revealed grid with arrows/Tab is part of the post-game — while
            // readOnly blocks every writing key. (Paused / conceded-mid-race
            // stay fully disabled, as before.)
            enabled: isPlayable || isTerminal,
            readOnly: !isPlayable,
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
            // ⌥-shortcut actions dispatch through the stable actionsRef.
            // Nullability mirrors the Controls bar / menu: no reveal in
            // compete, no note/explain without a setter note.
            onTogglePencil: () => actionsRef.current?.togglePencil(),
            onCheck: (scope) => actionsRef.current?.check(scope),
            onReveal: mode === 'coop' ? (scope) => actionsRef.current?.reveal(scope) : null,
            onShowNote: hasNote ? () => actionsRef.current?.showNote() : null,
            onExplain: hasNote ? () => actionsRef.current?.explain() : null,
            onScratchpad: () => setScratchpadOpen(true),
          }
        : null
  }, [grid, cursor, isPlayable, isTerminal, pencil, cells, handleSetCell, handleMark, rebus, numberJumpOpen, mode, hasNote])
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
      // Mobile: the clue lists live in the info sheet, which covers the grid —
      // close it so the moved cursor (and the grid) are visible. No-op on
      // desktop, where the sheet is never open (the lists show inline).
      closeInfoSheet()
    },
    [grid, closeInfoSheet],
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

  // "Print / Save as PDF" menu item. The grid is snapshotted at click-time via a
  // ref, so the menu item is set once (not rebuilt on every keystroke). The
  // PDF is a verbatim port of crossplay's — puzzle only, no answer key.
  const printStateRef = useRef<PuzzleState | null>(null)
  useEffect(() => {
    printStateRef.current = game
      ? { meta: game.meta, snapshot: { version: 0, cells: buildPrintCells(game.meta, cells) } }
      : null
  })
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

  // Snapshot of the clue under the cursor, for the "Explain cryptic clue" menu
  // item (read at click time via a ref, so the menu isn't rebuilt per keystroke).
  const explainRef = useRef<{
    label: string
    cells: CellPos[]
    clueText: string
    enumeration: string
  } | null>(null)
  useEffect(() => {
    if (grid && cursor && activeNumber != null && activeClueText) {
      const word = wordCells(grid, cursor.row, cursor.col, cursor.dir)
      explainRef.current = {
        label: `${activeNumber}${dir === 'across' ? 'A' : 'D'}`,
        cells: word,
        // Strip <em> tags — the AI wants the plain clue, not markup.
        clueText: stripClueEmphasis(activeClueText),
        enumeration: enumerationFor(word, cells, dir),
      }
    } else {
      explainRef.current = null
    }
  })

  // Ask the AI to explain the clue under the cursor. The edge function returns
  // 409 unless the word is already solved (so it's never a spoiler).
  const handleExplain = useCallback(async () => {
    const ctx = explainRef.current
    if (!ctx) {
      setExplainLabel('clue')
      setExplain({ kind: 'error', message: 'Put your cursor on a clue first.' })
      return
    }
    setExplainLabel(ctx.label)
    setExplain({ kind: 'loading' })
    // Failures come classified through callEdgeFn (fe-error-key + SQLSTATE +
    // the answered marker); "unsolved" is not one of them — it's an ANSWER,
    // a 200 `{ reason: 'unsolved' }` this side narrates in its own words.
    // (This used to be a hand unwrap of a 409 body; moving the answer to a
    // 200 is what let it fold into the shared wrapper.)
    const res = await callEdgeFn('crosswords-explain-clue', {
      gameId, cells: ctx.cells, clueText: ctx.clueText, enumeration: ctx.enumeration,
    })
    if (res.error) {
      setExplain({ kind: 'error', message: failureText(res.error, 'explain') })
      return
    }
    const payload = res.data as { explanation?: string; reason?: string; error?: string } | null
    if (payload?.reason === 'unsolved') {
      setExplain({ kind: 'error', message: 'Solve this clue correctly first, then I can explain it.' })
      return
    }
    if (!payload?.explanation) {
      setExplain({
        kind: 'error',
        message: failureText(
          { message: payload?.error ?? 'no explanation in the response', answered: true },
          'explain',
        ),
      })
      return
    }
    setExplain({ kind: 'ok', explanation: payload.explanation })
  }, [gameId])

  // Clear board — a destructive "start over" (blanks my grid, keeps givens +
  // the answer). Confirm first (window.confirm, like GamePage's End action);
  // the server restores the grid to its initial state and the CDC stream
  // repaints. In coop this clears the SHARED grid for everyone. Declared here
  // (above the menu effect that lists it) so it's in scope for the effect.
  // Restart — what used to be "Clear board" (2026-08-03). Same act, the name
  // and path every other game uses, and two things the old one couldn't do: it
  // clears EVERY grid (a restart is for the table, not just the caller) and it
  // un-terminals a finished puzzle, so a solved crossword can be run back.
  // Confirmed mid-game through the styled modal, like everywhere else.
  const handleRestart = useCallback(async () => {
    if (!isTerminal && !(await confirmAction(RESTART_CONFIRM))) return
    clearLocalFeedback()
    const bad = await callRpc(db, 'replay_board', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [isTerminal, gameId, confirmAction, showLocalFeedback, clearLocalFeedback])

  // Show note — open the setter's note locally AND (in coop) broadcast so
  // teammates open it too ("read it together", crossplay's showNotes). A no-op
  // broadcast in compete, where the peer channel is disabled.
  const handleShowNote = useCallback(() => {
    setNoteOpen(true)
    broadcastNote()
  }, [broadcastNote])

  // Download the current board as a standard `.ipuz` file (review M4) — the
  // template + current fills (from the click-time `printStateRef` snapshot) +
  // the answer grid, fetched via `export_solution` (the export gets the solution
  // any time, unlike the terminal-gated reveal). Re-uploadable to continue.
  const handleDownloadIpuz = useCallback(async () => {
    const state = printStateRef.current
    if (!state) return
    const { data, error } = await db.rpc('export_solution', { target_game: gameId })
    if (error || !data) {
      showLocalFeedback(failureMessage(error, 'download'))
      return
    }
    const ipuz = writeIpuz(state, data as unknown as (string[] | null)[][])
    const blob = new Blob([ipuz], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Guardian ids carry slashes (e.g. "crosswords/quick/123"); sanitize so the
    // download gets a clean name instead of a browser-mangled one.
    a.download = `${fileStem(state.meta.id)}.ipuz`
    a.click()
    URL.revokeObjectURL(url)
  }, [gameId, showLocalFeedback])

  // Print the answer-key PDF (crossplay's `generateSolutionPdf`). Like the
  // .ipuz export it fetches the solution via `export_solution` — the menu gates
  // WHEN it's offered (coop any time; compete only once the game's over), but
  // `export_solution` itself isn't terminal-gated, so the gate is UI-only (same
  // posture as Download-as-.ipuz, tolerated under the friends-only trust model).
  const handlePrintSolution = useCallback(async () => {
    const state = printStateRef.current
    if (!state) return
    const { data, error } = await db.rpc('export_solution', { target_game: gameId })
    if (error || !data) {
      showLocalFeedback(failureMessage(error, 'answer key'))
      return
    }
    await printCrosswordsSolutionPdf(
      state,
      data as unknown as (string[] | null)[][],
      `${fileStem(state.meta.id)}-answers`,
    )
  }, [gameId, showLocalFeedback])

  // Game-menu items. `hasNote` is stable per game, and `handleExplain` reads the
  // current clue via a ref, so this doesn't rebuild per keystroke — only on the
  // one-shot terminal / reveal / playable transitions.
  useEffect(() => {
    if (!game) return
    const title = game.meta.title || 'crossword'
    // The puzzle title + credits, pinned at the top of the menu — crossplay shows
    // this "title / by author / copyright" block in its menu. Empty fields drop out.
    const menuHeader = {
      title: game.meta.title || 'Untitled',
      lines: [
        game.meta.author ? `by ${game.meta.author}` : null,
        game.meta.copyright || null,
      ].filter((line): line is string => line !== null),
    }
    // The FULL crosswords menu (crossplay order, single column): the play
    // actions ALSO live here with their ⌥-shortcut hints (crossplay advertised
    // them in the menu). Play actions dispatch through the stable `actionsRef`
    // so this effect needn't depend on the later-declared handlers. Help + the
    // End/Concede + Back-to-club tail come from `buildGameMenu`.
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode,
        isTerminal,
        conceded: myConceded,
        header: menuHeader,
        onEndGame: () => actionsRef.current?.endGame(),
        onConcede: () => actionsRef.current?.concede(),
        extra: [
          // Mobile-only "Game info" item (opens the clue-lists + controls sheet);
          // empty on desktop where the clue columns are always visible.
          {
            items: [
              {
                id: 'pencil',
                label: pencil ? 'Switch to pen' : 'Switch to pencil',
                shortcut: '⌥P',
                disabled: !isPlayable,
                onClick: () => actionsRef.current?.togglePencil(),
              },
              {
                id: 'enter-rebus',
                label: 'Enter rebus',
                shortcut: '⇧↵',
                disabled: !isPlayable,
                onClick: () => actionsRef.current?.enterRebus(),
              },
              {
                // Display-only toggle: collapse multi-char rebuses to their
                // first letter (persisted per browser).
                id: 'collapse-rebuses',
                label: collapseRebus ? 'Expand rebuses' : 'Collapse rebuses',
                onClick: () => setCollapseRebus((v) => !v),
              },
            ],
          },
          {
            items: [
              { id: 'note', label: 'Show note', shortcut: '⌥N', disabled: !hasNote, onClick: handleShowNote },
              {
                // The AI clue-explainer is for cryptics; a setter note is the
                // proxy (crossplay gates it the same way).
                id: 'explain',
                label: 'Explain cryptic clue',
                shortcut: '⌥X',
                disabled: !hasNote,
                onClick: () => void handleExplain(),
              },
              {
                id: 'scratchpad',
                icon: IconScratchpad,
                label: 'Scratchpad',
                shortcut: '⌥S',
                onClick: () => setScratchpadOpen(true),
              },
              {
                id: 'print',
                icon: IconPrint,
                label: 'Print / Save as PDF',
                onClick: () => {
                  const s = printStateRef.current
                  if (s) void printCrosswordsPdf(s, title)
                },
              },
              { id: 'download-ipuz', label: 'Download as .ipuz', onClick: () => void handleDownloadIpuz() },
              {
                // Answer-key PDF. Coop: any time. Compete: only once the game
                // is over — an answer key mid-race is a giveaway. (See
                // handlePrintSolution: this is a UI gate, not a server one.)
                id: 'print-solution',
                label: 'Print answer key (PDF)',
                disabled: mode === 'compete' && !isTerminal,
                onClick: () => void handlePrintSolution(),
              },
            ],
          },
          // The two assistance families, each collapsed behind a submenu. They
          // were six flat rows — a third of this menu, which already runs ~20
          // items and scrolls. Nesting them turns that into two, and the scope
          // becomes the CHILD's whole label ("Check › Letter") rather than being
          // repeated in each row ("Check letter / Check word / Check grid").
          //
          // `disabled` sits on the PARENT only: a disabled parent can't be
          // opened, so repeating it per child would be dead weight. The
          // shortcuts stay on the children, where the actions are.
          //
          // One section, not two: they're the same family (help me with this
          // square), and as two rows they no longer need a divider between them.
          {
            items: [
              {
                id: 'check',
                label: 'Check',
                disabled: !isPlayable,
                items: [
                  { id: 'check-letter', label: SCOPE_LABEL.letter, shortcut: '⌥C', onClick: () => actionsRef.current?.check('letter') },
                  { id: 'check-word', label: SCOPE_LABEL.word, shortcut: '⌥⇧C', onClick: () => actionsRef.current?.check('word') },
                  { id: 'check-puzzle', label: SCOPE_LABEL.puzzle, onClick: () => actionsRef.current?.check('puzzle') },
                ],
              },
              // Reveal is coop-only (revealing your own grid would trivially win
              // a compete race) — the whole submenu is omitted in compete.
              ...(mode === 'coop'
                ? [
                    {
                      id: 'reveal',
                      label: 'Reveal',
                      disabled: !isPlayable,
                      items: [
                        { id: 'reveal-letter', label: SCOPE_LABEL.letter, shortcut: '⌥R', onClick: () => actionsRef.current?.reveal('letter') },
                        { id: 'reveal-word', label: SCOPE_LABEL.word, shortcut: '⌥⇧R', onClick: () => actionsRef.current?.reveal('word') },
                        { id: 'reveal-puzzle', label: SCOPE_LABEL.puzzle, onClick: () => actionsRef.current?.reveal('puzzle') },
                      ],
                    },
                  ]
                : []),
            ],
          },
          {
            items: [
              // Destructive "start over": blank my grid (givens + answer kept).
              // Restart replaced "Clear board": the same wipe, under the name
              // the other twelve games use, and reachable at terminal too.
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => void handleRestart() },
              {
                // Post-game answer key — disabled until terminal (the server
                // only unshields the solution then); disables itself once shown.
                id: 'reveal-board',
                icon: IconReveal,
                label: 'Reveal board',
                disabled: !isTerminal || solutionRevealed,
                onClick: () => void handleRevealBoard(),
              },
              {
                // Every game carries New game in the menu; crosswords' opens the
                // club's setup dialog (see handleNewGame) rather than creating a
                // game directly. Also the phone route to it — the terminal row
                // lives in the off-canvas info sheet there.
                id: 'new-game',
                icon: IconNewGame,
                label: 'New game',
                shortcut: '+',
                onClick: () => actionsRef.current?.newGame(),
              },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, hasNote, pencil, collapseRebus, mode, myConceded, handleShowNote, handleExplain, handleRevealBoard, handleRestart, handleDownloadIpuz, handlePrintSolution, isPlayable, isTerminal, solutionRevealed])

  const over: (TerminalCopy & { verdictNode?: ReactNode }) | null = isTerminal
    ? buildOver(playState, status, mode, myId, players)
    : null

  /**
   * What the below-board pill slot shows. The terminal verdict wins, then an
   * active own-move pill, then the "you're out, the rest race on" indicator for
   * a conceded compete player (so their greyed-out input has an explanation).
   *
   * DERIVED, like every other game (`over ? terminalPill(…) : …` in strands /
   * wordle / waffle / spellingbee). crosswords alone used to PUSH the verdict
   * into stored feedback from an effect, and that's what broke Restart: the
   * store is created `locked: isTerminal`, which makes `clearLocalFeedback()` a
   * deliberate no-op at terminal — so `handleRestart` cleared nothing, the RPC
   * then un-terminalled the game, and the stale "Game ended" pill sat on a
   * board that was playable again with nothing left able to remove it.
   *
   * Deriving fixes it by construction: the verdict is a function of
   * `isTerminal`, so it disappears the instant the restart lands. It also drops
   * a setState-in-effect the file had to `eslint-disable`.
   */
  const slotPill: GenericFeedbackMsg | null =
    isTerminal && over
      ? terminalPill(over.tone, over.verdictNode ?? over.verdict)
      : (localFeedback ?? (myConceded ? outOfRacePill(true) : null))

  // Always confirmed via the shared modal — crosswords previously ended unconfirmed.
  const handleEndGame = useCallback(async () => {
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const bad = await callRpc(db, 'end_game', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [gameId, showLocalFeedback, confirmAction])

  const handleConcede = useCallback(async () => {
    const bad = await callRpc(db, 'concede', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [gameId, showLocalFeedback])

  // New game — unlike every other game's "same setup, fresh randomness", this
  // opens the club's SETUP dialog rather than creating a game directly. A
  // crossword has no randomness: `setup` names a PUZZLE, so replaying it would
  // re-serve the grid just solved (library / nyt / guardian all do), and an
  // uploaded board is stripped before it's persisted (manifest.ts — the
  // solution must never reach the unshielded setup blob), so there's nothing
  // to re-send at all. Picking the next puzzle is the only sane "another one",
  // and the setup dialog is where puzzles are picked.
  // (`navigate` directly rather than ctx's goToClub, which takes no query.)
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    navigate(`/c/${clubHandle}?new=crosswords_${mode}`)
  }, [clubHandle, mode, confirmAction, isTerminal])

  // Single-flight guard. New game has THREE triggers (the terminal button, the
  // game-menu item, and the global `+` shortcut), and `common.create_game` is
  // NOT idempotent — every call shelves the club's current game and starts
  // another, orphaning the last in the club list and toasting every peer.
  // Guarding the HANDLER covers all three triggers at once, which a `disabled`
  // button could never do. `startingNewGame` then greys the button so a slow
  // network reads as "working" rather than "nothing happened".
  //
  // The MENU ITEM deliberately takes no `disabled`: its effect is built above
  // this line and is kept independent of handler identity on purpose (the
  // actionsRef indirection). It doesn't need one — `+` and the menu both route
  // through this same guarded handler.
  const [handleNewGame, startingNewGame] = useSingleFlight(createNewGame)

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
      // Mobile: Check is tapped from inside the full-width info sheet, which
      // covers the grid AND the active-clue bar where the result pill renders —
      // close it so the marked cells + the pill are actually visible. No-op on
      // desktop (sheet never open) and when already closed (menu path).
      closeInfoSheet()
      clearLocalFeedback()
      const bad = await callRpc(db, 'check_cells', { target_game: gameId, p_cells: target })
      if (bad) {
        showLocalFeedback(bad)
        return
      }
      // Check deliberately skips pencil cells (a pencilled letter is a guess, not
      // a committed answer — mirror `_check_cells` / crossplay's `applyCheck`). So
      // if the checked scope held any pencilled fill, it went un-flagged; a timed
      // info pill says so, so an unmarked pencil cell doesn't read as "correct."
      const skippedPencil = target.some((p) => {
        const c = cells.get(cellKey(p.row, p.col))
        return Boolean(c?.pencil && c.fill)
      })
      if (skippedPencil) showLocalFeedback(PENCIL_SKIPPED_MSG)
    },
    [scopeCells, gameId, cells, showLocalFeedback, clearLocalFeedback, closeInfoSheet],
  )

  const handleReveal = useCallback(
    async (scope: Scope) => {
      const target = scopeCells(scope)
      if (target.length === 0) return
      // See handleCheck: close the covering sheet so the revealed cells (and any
      // error pill) are visible. No-op on desktop / when already closed.
      closeInfoSheet()
      clearLocalFeedback()
      const bad = await callRpc(db, 'reveal_cells', { target_game: gameId, p_cells: target })
      if (bad) {
        showLocalFeedback(bad)
        return
      }
      // Flash the revealed cells on teammates' grids in my color — the reveal's
      // CDC arrives colorless (like a typed fill), so it needs its own signal.
      broadcastFills(target)
    },
    [scopeCells, gameId, showLocalFeedback, clearLocalFeedback, broadcastFills, closeInfoSheet],
  )

  // Keep the ⌥-shortcut action handlers current (read by the keyboard's kbRef
  // via the stable actionsRef). setPencil / setNoteOpen are stable setters.
  useEffect(() => {
    actionsRef.current = {
      togglePencil: () => setPencil((p) => !p),
      check: handleCheck,
      reveal: handleReveal,
      enterRebus: () => cursor && setRebus({ row: cursor.row, col: cursor.col }),
      showNote: handleShowNote,
      explain: () => void handleExplain(),
      endGame: () => void handleEndGame(),
      concede: () => void handleConcede(),
      newGame: handleNewGame,
    }
  }, [handleCheck, handleReveal, handleShowNote, handleExplain, handleEndGame, handleConcede, handleNewGame, cursor])

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
            solution={shownSolution}
            peerCells={peerCells}
            recentFills={recentFillCells}
            collapseRebus={collapseRebus}
          />
        </div>

        {/* Active-clue bar — doubles as the local-feedback slot. Priority:
            an active local pill (own move / terminal verdict), else the
            "you conceded, others race on" indicator for a conceded compete
            player, else the active clue. Desktop: mid-right column. Mobile:
            directly under the grid — the ONE clue readout on the main view
            (the full lists are in the sheet). DOM order differs from the
            desktop visual order; the grid placements position it. */}
        {/* data-active-clue: a stable e2e hook (the class name is hashed). */}
        <div className={styles.activeClue} data-active-clue>
          {slotPill ? (
            <GenericFeedbackPill msg={slotPill} onClose={clearLocalFeedback} />
          ) : (
            activeNumber != null && (
              <>
                <span className={styles.activeClueLabel}>
                  {activeNumber}
                  {dir === 'across' ? 'A' : 'D'}
                </span>
                <span className={styles.activeClueText}>
                  <ClueText text={activeClueText} />
                </span>
              </>
            )
          )}
        </div>

        {/* The clue lists + the controls strip. Desktop: `display: contents`
            all the way down (InfoSheet wrap + .sheetContent), so .clues and
            .strip stay grid items of .layout, byte-identical to before.
            Mobile: the whole block is the off-canvas "Game info" sheet. */}
        <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
          <div className={styles.sheetContent}>
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

            {/* Chrome strip — three states, one slot:
                  - PLAYING: the full control bar (fill / check / reveal / end).
                  - CONCEDED (compete, the others still racing): the terminal
                    LOOK — a status line + the now-inert Concede. No Reveal: the
                    solution stays server-shielded until the GAME is terminal.
                  - TERMINAL: the controls all vanish (checking and pencilling a
                    finished grid is meaningless) and the row becomes the three
                    things left to do. Deliberately NO outcome message here — a
                    documented departure from the shared <TerminalActionRow>,
                    whose whole shape is message-plus-actions: crosswords already
                    renders the verdict as a permanent pill in the active-clue
                    slot right above (the one readout a phone shows), so a
                    second copy one line below would just be noise.
                The strip's height changing between these is FINE, not a
                no-reflow violation: the board column is `min-content` and spans
                all three grid rows of a viewport-height grid, so it can't move
                — only the `1fr` clue list above absorbs the difference. */}
            <div className={styles.strip}>
              {isTerminal ? (
                <div className={styles.actions}>
                  <RevealButton
                    label="Reveal solution"
                    iconOnly
                    // Self-disables once shown, like its game-menu twin.
                    disabled={solutionRevealed}
                    onClick={() => void handleRevealBoard()}
                  />
                  <RestartButton iconOnly onClick={() => void handleRestart()} />
                  <NewGameButton iconOnly onClick={handleNewGame} disabled={startingNewGame} />
                  <BackToClubButton onClick={goToClub} variant="primary" compact iconOnly />
                </div>
              ) : myConceded ? (
                <LocalTerminalRow label="You conceded">
                  {/* Inert, but present: the solution opens only when the game
                      is over for EVERYONE (common.reveal_solution enforces it
                      server-side too), so a player who dropped out can't spoil
                      a live race — and the row keeps its shape for when the
                      last solver finishes. */}
                  <RevealButton iconOnly disabled tooltip="Can't reveal until all end" />
                  <ConcedeGameButton iconOnly disabled />
                </LocalTerminalRow>
              ) : (
                <div className={styles.toolRow}>
                  {/* End / Concede rides INSIDE the bar as icon-only children,
                      in its own rule-separated group — one row of uniform
                      squares, grouped by what they do. */}
                  <Controls
                    mode={mode}
                    pencil={pencil}
                    onPencilChange={setPencil}
                    onCheck={(scope) => void handleCheck(scope)}
                    onReveal={(scope) => void handleReveal(scope)}
                    disabled={!isPlayable}
                  >
                    {isPlayable &&
                      (mode === 'compete' ? (
                        <ConcedeGameButton iconOnly onClick={() => void handleConcede()} />
                      ) : (
                        <EndGameButton iconOnly onClick={() => void handleEndGame()} />
                      ))}
                  </Controls>
                </div>
              )}
            </div>
          </div>
        </InfoSheet>
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

      {explain && (
        <ExplainDialog clueLabel={explainLabel} state={explain} onClose={() => setExplain(null)} />
      )}

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the pill in the active-clue slot + the info-column line, and
          a coop solve gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationDialog
          title="Solved! 🎉"
          body="The grid is complete."
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
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

/**
 * Map the terminal play_state to the shared TerminalCopy shape. `tone` +
 * `verdict` drive the permanent pill in the active-clue slot; `message` + `tone`
 * drive the short info-column outcome line.
 *
 * Verdicts lead with the outcome word (`Won:` / `Lost:`) and carry no trailing
 * period: the pill is a one-line, ellipsising row (~48 chars on a phone), so
 * it's a LABEL, not prose.
 *
 * The compete loser's verdict names WHO beat them — the one case that wants a
 * WIDGET (the winner's identity dot, the way peer feedback names people
 * elsewhere), returned as `verdictNode`; `verdict` carries the plain-text twin.
 */
function buildOver(
  playState: string,
  status: Record<string, unknown> | null,
  mode: 'coop' | 'compete',
  myId: string,
  players: Member[],
): TerminalCopy & { verdictNode?: ReactNode } {
  const winner = status?.winner_user_id as string | undefined
  // The handle cached in `status` at finish time — a rename is rare enough that a
  // stale name beats a follow-up query. The roster row drives the identity DOT.
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  // `submit_timeout` stamps this. Of the two `lost*` states only
  // `lost_compete` has a second way in (all-conceded, via common.concede);
  // coop's `lost` is clock-only — coop has no concede.
  const timedOut = status?.outcome === 'timeout'
  switch (playState) {
    case 'won':
      return { verdict: 'Won: grid complete', message: 'Solved!', tone: 'won' }
    case 'won_compete':
      if (winner === myId) {
        return { verdict: 'Won: solved it first', message: 'You won!', tone: 'won' }
      }
      return {
        verdict: `${winnerName} solved it first`,
        verdictNode: (
          <>
            <ActorDot actor={players.find((p) => p.user_id === winner)} fallback="Someone" show="both" />{' '}
            solved it first
          </>
        ),
        message: `${winnerName} won`,
        tone: 'lost',
      }
    case 'lost_compete':
      // Both compete collective losses land here, told apart by `outcome`:
      // the countdown taking the whole table down together
      // (crosswords.submit_timeout, the roster's shared no-winner phrasing),
      // or the last active player conceding (common.concede's
      // last-active-conceder path — the same `Lost: all conceded` verdict
      // spellingbee/wordwheel use, matching the club card's label).
      if (timedOut) {
        return { verdict: 'Out of time — no winner', message: 'Out of time', tone: 'lost' }
      }
      return { verdict: 'Lost: all conceded', message: 'All conceded', tone: 'lost' }
    case 'lost':
      // Coop only, and clock-only: the countdown expired before the grid was
      // done (crosswords.concede is compete-gated, so no concede path here).
      return { verdict: 'Lost: out of time', message: 'Out of time', tone: 'lost' }
    case 'ended':
    default:
      return endedCopy(mode)
  }
}
