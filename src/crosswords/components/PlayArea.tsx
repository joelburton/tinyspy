import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { setScratchpadOpen } from '../../common/lib/scratchpad/scratchpadOpenStore'
import { writeIpuz } from '../lib/parse/ipuz'
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
import { supabase } from '../../common/lib/supabase/supabase'
import { ClueLists } from './ClueLists'
import { ClueText } from './ClueText'
import { stripClueEmphasis } from '../lib/clueRuns'
import { Controls } from './Controls'
import { db } from '../db'
import styles from './PlayArea.module.css'
import '../theme.css'

/** Timed info pill shown after a Check whose scope contained pencilled cells —
 *  Check skips them (see `handleCheck`), so this flags that they weren't tested. */
const PENCIL_SKIPPED_MSG: GenericFeedbackMsg = {
  tone: 'info',
  text: 'Check skips pencil marks.',
  dismiss: { kind: 'timed' },
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
  const { gameId, players, isTerminal, playState, goToClub, session, status, menu } = ctx
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

  // Mobile (docs/mobile.md): below --mobile the grid + the active-clue bar ARE
  // the main view (grid maximized; the bar is how you read the clue you're on),
  // and the clue lists + the check/reveal controls move into the off-canvas
  // "Game info" sheet. Keyboard-REQUIRED still holds — this is the layout for a
  // tablet (or phone) WITH a keyboard, not a touch-entry mode. `wide`: the
  // Across|Down columns want the full device width, like the WordList games.
  const infoSheet = useInfoSheet()

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
  // blanks stay blank until someone picks "Reveal board" from the game menu,
  // so ending a game doesn't spoil a puzzle the group may want to keep
  // chewing on. (Errors are tolerated silently, like the old auto-fetch was:
  // solution stays null and the menu item stays enabled for a retry.)
  const [solution, setSolution] = useState<(string[] | null)[][] | null>(null)
  const handleRevealBoard = useCallback(async () => {
    const { data } = await db.from('games_state').select('solution').eq('id', gameId).single()
    if (data?.solution) setSolution(data.solution as unknown as (string[] | null)[][])
  }, [gameId])

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
    const { data, error } = await supabase.functions.invoke('crosswords-explain-clue', {
      body: { gameId, cells: ctx.cells, clueText: ctx.clueText, enumeration: ctx.enumeration },
    })
    if (error || (data as { error?: string } | null)?.error) {
      // supabase-js reports a non-2xx as its own error; the real body is on
      // `error.context` (a Response we read once) — a 409 carries `reason`.
      let reason: string | undefined
      let serverMsg: string | undefined
      const resp = (error as { context?: Response } | null)?.context
      if (resp) {
        try {
          const parsed = (await resp.json()) as { reason?: string; error?: string }
          reason = parsed.reason
          serverMsg = parsed.error
        } catch {
          // not JSON — fall through
        }
      }
      setExplain({
        kind: 'error',
        message:
          reason === 'unsolved'
            ? 'Solve this clue correctly first, then I can explain it.'
            : (serverMsg ?? (data as { error?: string } | null)?.error ?? error?.message ?? 'Could not fetch an explanation.'),
      })
      return
    }
    setExplain({ kind: 'ok', explanation: (data as { explanation: string }).explanation })
  }, [gameId])

  // Clear board — a destructive "start over" (blanks my grid, keeps givens +
  // the answer). Confirm first (window.confirm, like GamePage's End action);
  // the server restores the grid to its initial state and the CDC stream
  // repaints. In coop this clears the SHARED grid for everyone. Declared here
  // (above the menu effect that lists it) so it's in scope for the effect.
  const handleClear = useCallback(async () => {
    const shared = mode === 'coop' ? ' This clears the shared grid for everyone.' : ''
    if (!window.confirm(`Clear the board?${shared} You can't undo this.`)) return
    clearLocalFeedback()
    const { error } = await db.rpc('clear_board', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `Clear failed: ${error.message}`))
  }, [mode, gameId, showLocalFeedback, clearLocalFeedback])

  // Show note — open the setter's note locally AND (in coop) broadcast so
  // teammates open it too ("read it together", crossplay's showNotes). A no-op
  // broadcast in compete, where the peer channel is disabled.
  const handleShowNote = useCallback(() => {
    setNoteOpen(true)
    broadcastNote()
  }, [broadcastNote])

  // Download the current board as a standard `.ipuz` file (review M4) — the
  // template + current fills (from the click-time `printStateRef` snapshot) +
  // the answer grid, fetched via `solution_for` (the export gets the solution
  // any time, unlike the terminal-gated reveal). Re-uploadable to continue.
  const handleDownloadIpuz = useCallback(async () => {
    const state = printStateRef.current
    if (!state) return
    const { data, error } = await db.rpc('solution_for', { target_game: gameId })
    if (error || !data) {
      showLocalFeedback(stickyPill('error', `Download failed: ${error?.message ?? 'no solution'}`))
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
  // .ipuz export it fetches the solution via `solution_for` — the menu gates
  // WHEN it's offered (coop any time; compete only once the game's over), but
  // `solution_for` itself isn't terminal-gated, so the gate is UI-only (same
  // posture as Download-as-.ipuz, tolerated under the friends-only trust model).
  const handlePrintSolution = useCallback(async () => {
    const state = printStateRef.current
    if (!state) return
    const { data, error } = await db.rpc('solution_for', { target_game: gameId })
    if (error || !data) {
      showLocalFeedback(stickyPill('error', `Answer key failed: ${error?.message ?? 'no solution'}`))
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
          ...infoSheet.menuSections,
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
              { id: 'scratchpad', label: 'Scratchpad', shortcut: '⌥S', onClick: () => setScratchpadOpen(true) },
              {
                id: 'print',
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
          {
            items: [
              { id: 'check-letter', label: 'Check letter', shortcut: '⌥C', disabled: !isPlayable, onClick: () => actionsRef.current?.check('letter') },
              { id: 'check-word', label: 'Check word', shortcut: '⌥⇧C', disabled: !isPlayable, onClick: () => actionsRef.current?.check('word') },
              { id: 'check-puzzle', label: 'Check puzzle', disabled: !isPlayable, onClick: () => actionsRef.current?.check('puzzle') },
            ],
          },
          // Reveal is coop-only (revealing your own grid would trivially win a
          // compete race) — the whole section is omitted in compete.
          ...(mode === 'coop'
            ? [
                {
                  items: [
                    { id: 'reveal-letter', label: 'Reveal letter', shortcut: '⌥R', disabled: !isPlayable, onClick: () => actionsRef.current?.reveal('letter') },
                    { id: 'reveal-word', label: 'Reveal word', shortcut: '⌥⇧R', disabled: !isPlayable, onClick: () => actionsRef.current?.reveal('word') },
                    { id: 'reveal-puzzle', label: 'Reveal puzzle', disabled: !isPlayable, onClick: () => actionsRef.current?.reveal('puzzle') },
                  ],
                },
              ]
            : []),
          {
            items: [
              // Destructive "start over": blank my grid (givens + answer kept).
              { id: 'clear-board', label: 'Clear board', disabled: !isPlayable, onClick: () => void handleClear() },
              {
                // Post-game answer key — disabled until terminal (the server
                // only unshields the solution then); disables itself once shown.
                id: 'reveal-board',
                label: 'Reveal board',
                disabled: !isTerminal || solution !== null,
                onClick: () => void handleRevealBoard(),
              },
            ],
          },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, hasNote, pencil, collapseRebus, mode, myConceded, handleShowNote, handleExplain, handleRevealBoard, handleClear, handleDownloadIpuz, handlePrintSolution, isPlayable, isTerminal, solution, infoSheet.menuSections])

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

  // Always confirmed via the shared modal — crosswords previously ended unconfirmed.
  const handleEndGame = useCallback(async () => {
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `End game failed: ${error.message}`))
  }, [gameId, showLocalFeedback, confirmAction])

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
      if (error) {
        showLocalFeedback(stickyPill('error', `Check failed: ${error.message}`))
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
    [scopeCells, gameId, cells, showLocalFeedback, clearLocalFeedback],
  )

  const handleReveal = useCallback(
    async (scope: Scope) => {
      const target = scopeCells(scope)
      if (target.length === 0) return
      clearLocalFeedback()
      const { error } = await db.rpc('reveal_cells', { target_game: gameId, p_cells: target })
      if (error) {
        showLocalFeedback(stickyPill('error', `Reveal failed: ${error.message}`))
        return
      }
      // Flash the revealed cells on teammates' grids in my color — the reveal's
      // CDC arrives colorless (like a typed fill), so it needs its own signal.
      broadcastFills(target)
    },
    [scopeCells, gameId, showLocalFeedback, clearLocalFeedback, broadcastFills],
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
    }
  }, [handleCheck, handleReveal, handleShowNote, handleExplain, handleEndGame, handleConcede, cursor])

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
        <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close} wide>
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

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
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
