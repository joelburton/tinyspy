// cs-unmet

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { ActionButton } from '@/common/actions/ActionButton'
import { useAppAction, useBoundAction, type ActionState } from '@/common/actions/useBoundAction'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { useFeedbackSlot, useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Actor } from '@/common/members/member'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { navigate } from '@/common/routing/router'
import { clubPath } from '@/common/routing/routes'
import { writeIpuz } from '../lib/parse/ipuz'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { cls } from '@/common/utils/cls'
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
import { type Cell, type Direction, type MarkSide, type PuzzleState, type PuzzleTemplate, type Scope } from '../lib/types'
import { nextMarkState } from '../lib/marks'
import { printCrosswordsPdf, printCrosswordsSolutionPdf } from '../pdf/printCrosswordsPdf'
import type { CellsMap } from '../hooks/useCells'
import { colorVarFor } from '@/common/members/memberColor'
import { useGame } from '../hooks/useGame'
import { cellKey, useCells } from '../hooks/useCells'
import { usePeerCursors } from '../hooks/usePeerCursors'
import { useGridKeyboard } from '../hooks/useGridKeyboard'
import { Grid, type RebusPostCommit } from './Grid'
import { CrosswordsNumberJumpBlockingModal } from './CrosswordsNumberJumpBlockingModal'
import { CrosswordsNoteCompanion } from './CrosswordsNoteCompanion'
import { CrosswordsExplainCompanion, type ExplainState } from './CrosswordsExplainCompanion'
import { enumerationFor } from '../lib/enumeration'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { readRows, runRpc } from '@/common/supabase/dbResult'
import { ClueLists } from './ClueLists'
import { ClueText } from './ClueText'
import { stripClueEmphasis } from '../lib/clueRuns'
import { Controls, type ScopeActions } from './Controls'
import { db } from '../db'
import styles from './PlayArea.module.css'
import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useStickyChoice } from '@/common/web-storage/useStickyChoice'

/** Where the display-only "collapse rebuses" preference is remembered, per
 *  browser. Not per game or per player — it is how you like to READ a grid. */
const REBUS_KEY = 'puzpuzpuz:crosswords:collapseRebus'
const REBUS_OPTIONS = ['off', 'on'] as const

/** The acknowledgment shown after a Check whose scope contained penciled
 *  cells — Check skips them (see `handleCheck`), so this flags that they
 *  weren't tested. Unpunctuated: the pill is a one-line LABEL, not prose. */
const pencilSkippedMessage = () => FeedbackMessage.acknowledgment('noted', 'Check skips pencil marks')

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
/** What `check_cells` answers: one `ok`, and HOW MANY cells it flagged — a
 *  number the RPC computes anyway. */
type CheckAnswer = { result: 'checked'; wrong_count: number }

/** What `reveal_cells` answers. `solved` matters: a reveal can complete the
 *  grid, and that lands the ordinary coop `won` terminal on purpose — a
 *  revealed grid is a finished one. */
type RevealAnswer = { result: 'revealed'; solved: boolean }

/** What `export_solution` answers — the solution grid, typed once for its two
 *  call sites. */
type ExportAnswer = { result: 'exported'; solution: (string[] | null)[][] }

export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, playState, session, status, menu, clubHandle } = ctx
  const myId = session.user.id

  const { game, loading, failure } = useGame(gameId)
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
  const ownerId = mode === 'compete' ? myId : null
  const { cells, setCell, setMark } = useCells(gameId, ownerId)

  // The local slot — drawn in the active-clue bar, which doubles as the
  // below-board slot here: a keystroke's or a cheat's not-ok, the pencil
  // acknowledgment, and the two standing conditions further down.
  const localFeedbackSlot = useFeedbackSlot('local')
  const topFeedbackMsg = useTopFeedbackMessage(localFeedbackSlot)

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
  const [rebusPref, setRebusPref] = useStickyChoice(REBUS_KEY, REBUS_OPTIONS, 'off')
  const collapseRebus = rebusPref === 'on'
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
  // The ask is MINE (useSolutionReveal): my looking doesn't fill a partner's
  // grid while they're still working out what they got wrong, and the same
  // control puts the author's answers away again — back to exactly the fill the
  // players left, which is the whole point for a game whose grid can
  // legitimately differ from his (rebuses, quantum clues). The fetch below
  // hangs off the toggle rather than a flag. (Errors are tolerated silently,
  // like the old auto-fetch was: solution stays null and the control stays
  // live for a retry.)
  const { revealed: solutionShown, toggle: toggleSolution, hide: hideSolution } =
    useSolutionReveal()
  const [solution, setSolution] = useState<(string[] | null)[][] | null>(null)
  useEffect(() => {
    if (!solutionShown || solution) return
    let alive = true
    void (async () => {
      // No `.single()`: it treats zero rows as an ERROR, so a game this club
      // cannot see would arrive looking exactly like a broken connection.
      // `readRows` hands back rows, and `id` is the PK, so this is 0 or 1.
      const res = await readRows(
        db.from('games_state').select('solution').eq('id', gameId),
      )
      if (!alive) return
      // A failed read leaves `solution` null, which is the SAME state as "not
      // fetched yet" — and that is the honest one: the reveal toggle is on, so
      // the effect will ask again. `readRows` has raised the modal, and the
      // grid keeps drawing what the player has actually filled.
      if (res.type === 'not-ok') return
      // Zero rows is its own answer here: the shield is still up (games_state
      // gates the solution to terminal), which is not a failure to report.
      const row = res.data[0]
      if (row?.solution) setSolution(row.solution as unknown as (string[] | null)[][])
    })()
    return () => {
      alive = false
    }
  }, [solutionShown, solution, gameId])

  /**
   * The solution as the GRID may draw it — the fetched answers, but only while
   * the server still says they're revealed.
   *
   * `solution` above is a one-way cache: the effect only ever sets it, so it
   * outlived the reveal going back off. Nothing noticed until
   * Restart, which is the one action that clears every fill at once — and since
   * <Grid> paints an answer into any EMPTY cell that has one, a restart wiped
   * the player's letters and immediately painted the whole solution in their
   * place. It read as "Restart did nothing": the letters on screen didn't
   * change, they just stopped being yours.
   *
   * Derived rather than cleared, for two reasons: a sync setState in an effect
   * is a lint error here (docs/code-conventions.md), and deriving fixes EVERY
   * path that turns the reveal off — including Hide, which is now an ordinary
   * thing to do — rather than the one that happened to be reported. The cache
   * itself stays: a hide-then-show, or a restart replaying the SAME puzzle,
   * needs no refetch.
   */
  const shownSolution = solutionShown ? solution : null

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

  // Write a cell (optimistic) + surface any not-ok. Solved → terminal flow
  // lands via ctx.isTerminal; the verdict effect below shows it. On a coop
  // letter, also announce the fill so teammates flash it in my color (a
  // no-op in compete — broadcastFill is disabled there).
  const handleSetCell = useCallback(
    async (row: number, col: number, fill: string | null, pencil: boolean) => {
      localFeedbackSlot.dismiss() // a keystroke is the next move
      const res = await setCell(row, col, fill, pencil)
      // The two refusals a keystroke can meet are RACES — a teammate finished
      // the grid, or your own concede landed — so they read orange and say the
      // server's own words. Everything else here is a fault, which raises the
      // modal centrally and leaves its sentence in this slot.
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'set') {
        if (fill != null) broadcastFill(row, col)
        return
      } else {
        reportUnhandled('set_cell', res)
        return
      }
    },
    [setCell, localFeedbackSlot, broadcastFill],
  )

  // Cycle a cryptic edge mark (none → break → hyphen → none) on the cursor
  // cell's right/bottom edge, then persist via set_mark. Display-only, so no
  // cursor move + no solve — just the write (with the same error surfacing).
  const handleMark = useCallback(
    async (row: number, col: number, side: MarkSide) => {
      const cur = cells.get(cellKey(row, col))
      const current = side === 'right' ? cur?.markRight : cur?.markBottom
      const res = await setMark(row, col, side, nextMarkState(current ?? undefined))
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'marked') {
        // Nothing to say: the mark is already drawn optimistically and the
        // authoritative version was adopted inside the hook.
        return
      } else {
        reportUnhandled('set_mark', res)
        return
      }
    },
    [cells, setMark, localFeedbackSlot],
  )

  // Does the puzzle carry a setter's note? Gates the Show-note / Explain menu
  // items AND their ⌥N / ⌥X keyboard shortcuts.
  const hasNote = (game?.meta.note ?? '').trim().length > 0

  /** Is this cell the author's? A given letter lives on the immutable template
   *  and can never be typed over. */
  const isGiven = (row: number, col: number) => {
    const tile = grid?.[row]?.[col]
    return tile?.kind === 'cell' && tile.given === true
  }
  /** What a cell READS right now — a given's printed letter, or the players'
   *  fill. The peek box shows this; the writing keys ask `cells` alone. */
  const shownFillAt = (row: number, col: number): string | null => {
    const tile = grid?.[row]?.[col]
    if (tile?.kind === 'cell' && tile.given === true) return tile.fill ?? null
    return cells.get(cellKey(row, col))?.fill ?? null
  }

  // The grid's own keys, as the bound actions they are: a binding is asked what
  // it does at the moment the key lands.
  const { actRebus } = useGridKeyboard({
    // Terminal keeps the keys ALIVE for navigation — walking the revealed grid
    // with arrows/Tab is part of the post-game — while `readOnly` freezes the
    // writing half. (Paused / conceded-mid-race stay fully disabled.)
    enabled: isPlayable || isTerminal,
    readOnly: !isPlayable,
    // One of this game's own overlays owns the keyboard.
    suspended: rebus !== null || numberJumpOpen,
    grid,
    cursor,
    pencil,
    setCursor,
    fillAt: (r, c) => cells.get(cellKey(r, c))?.fill ?? null,
    isGiven,
    setCell: (r, c, fill, penciled) => void handleSetCell(r, c, fill, penciled),
    onRebus: (r, c) => setRebus({ row: r, col: c }),
    onNumberJump: () => setNumberJumpOpen(true),
    onPeek: (r, c) => setPeek({ row: r, col: c, value: shownFillAt(r, c) ?? '' }),
    peeking: peek !== null,
    clearPeek: () => setPeek(null),
    onMark: (r, c, side) => void handleMark(r, c, side),
  })

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
      localFeedbackSlot.dismiss() // a click is the next move, like a keystroke
      setCursor((prev) => {
        if (!prev) return { row, col, dir: 'across' }
        // Clicking the cell you're already on toggles direction.
        if (prev.row === row && prev.col === col) {
          return { ...prev, dir: prev.dir === 'across' ? 'down' : 'across' }
        }
        return { row, col, dir: prev.dir }
      })
    },
    [localFeedbackSlot],
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

/** What `crosswords-explain-clue` puts in `data`. `unsolved` is an ANSWER, not
 *  a refusal: the menu item is live on any clue under the cursor because the FE
 *  cannot see which words are solved — the solution is server-only, and graying
 *  the item out would leak exactly what that protects. */
type Explained =
  | { result: 'explained'; explanation: string }
  | { result: 'unsolved' }
  | null

  // Ask the AI to explain the clue under the cursor. It answers `unsolved`
  // rather than the explanation unless the word is already correct, so it is
  // never a spoiler.
  const handleExplain = useCallback(async () => {
    const ctx = explainRef.current
    if (!ctx) {
      setExplainLabel('clue')
      setExplain({ kind: 'error', message: 'Put your cursor on a clue first.' })
      return
    }
    setExplainLabel(ctx.label)
    setExplain({ kind: 'loading' })
    const res = await runEdgeFn<Explained>('crosswords-explain-clue', {
      gameId, cells: ctx.cells, clueText: ctx.clueText, enumeration: ctx.enumeration,
    })

    if (res.type === 'not-ok' && res.severity === 'fault') {
      // The dialog CLOSES. `runEdgeFn` has raised the modal, and a fault leaves
      // nothing to put in the dialog (docs/ui.md → Faults).
      setExplain(null)
    } else if (res.type === 'not-ok') {
      // The dialog STAYS with the sentence: PN327 and PN328 are the model
      // declining or being cut off — it ran, it just explained nothing.
      setExplain({ kind: 'error', message: res.message })
    } else if (res.type === 'ok' && res.data?.result === 'unsolved') {
      // Not a refusal — the menu item is live on any clue, deliberately, since
      // the FE cannot see which words are solved. This side words it, because
      // the server must not hint at how close you are.
      setExplain({ kind: 'error', message: 'Solve this clue correctly first, then I can explain it.' })
    } else if (res.type === 'ok' && res.data?.result === 'explained') {
      setExplain({ kind: 'ok', explanation: res.data.explanation })
    } else {
      reportUnhandled('crosswords-explain-clue', res)
      setExplain(null)
    }
  }, [gameId])

  // ─── End / Concede / Restart — the shared trio ─────────
  // Restart is the shared wipe under the shared name: it clears EVERY grid (a
  // restart is for the table, not just the caller) and it un-terminals a
  // finished puzzle, so a solved crossword can be run back. crosswords' own
  // bit is the cleanup: put the author's answers away, so
  // the stale solution cache can't paint the grid the instant the fills go.
  const onRestarted = useCallback(() => {
    hideSolution()
    localFeedbackSlot.dismiss()
  }, [hideSolution, localFeedbackSlot])
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode,
    myConceded,
    localFeedbackSlot,
    onRestarted,
  })

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
    const res = await runRpc<ExportAnswer>(db.rpc('export_solution', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'exported') {
      const ipuz = writeIpuz(state, res.data.solution)
      const blob = new Blob([ipuz], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Guardian ids carry slashes (e.g. "crosswords/quick/123"); sanitize so the
      // download gets a clean name instead of a browser-mangled one.
      a.download = `${fileStem(state.meta.id)}.ipuz`
      a.click()
      URL.revokeObjectURL(url)
      return
    } else {
      reportUnhandled('export_solution', res)
      return
    }
  }, [gameId, localFeedbackSlot])

  // Print the answer-key PDF (crossplay's `generateSolutionPdf`). Like the
  // .ipuz export it fetches the solution via `export_solution` — the menu gates
  // WHEN it's offered (coop any time; compete only once the game's over), but
  // `export_solution` itself isn't terminal-gated, so the gate is UI-only (same
  // posture as Download-as-.ipuz, tolerated under the friends-only trust model).
  const handlePrintSolution = useCallback(async () => {
    const state = printStateRef.current
    if (!state) return
    const res = await runRpc<ExportAnswer>(db.rpc('export_solution', { target_game: gameId }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'exported') {
      await printCrosswordsSolutionPdf(
        state,
        res.data.solution,
        `${fileStem(state.meta.id)}-answers`,
      )
      return
    } else {
      reportUnhandled('export_solution', res)
      return
    }
  }, [gameId, localFeedbackSlot])

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
      // covers the grid AND the active-clue bar where the slot draws — close
      // it so the marked cells + the pill are actually visible. No-op on
      // desktop (sheet never open) and when already closed (menu path).
      closeInfoSheet()
      localFeedbackSlot.dismiss()
      const res = await runRpc<CheckAnswer>(
        db.rpc('check_cells', { target_game: gameId, p_cells: target }),
      )
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'checked') {
        // The flagged cells arrive by subscription and the grid marks them, so
        // a successful check says nothing about what it found. What it DOES owe
        // is the pencil note, and it lives here rather than after the chain
        // because it belongs to this answer alone: a refusal checked nothing,
        // so there is nothing it could have skipped.
        //
        // Check deliberately skips pencil cells (a penciled letter is a guess,
        // not a committed answer — mirror `_check_cells` / crossplay's
        // `applyCheck`). So if the checked scope held any penciled fill, it
        // went un-flagged; a timed acknowledgment says so, so an unmarked
        // pencil cell doesn't read as "correct".
        const skippedPencil = target.some((p) => {
          const c = cells.get(cellKey(p.row, p.col))
          return Boolean(c?.pencil && c.fill)
        })
        if (skippedPencil) localFeedbackSlot.show(pencilSkippedMessage())
        return
      } else {
        reportUnhandled('check_cells', res)
        return
      }
    },
    [scopeCells, gameId, cells, localFeedbackSlot, closeInfoSheet],
  )

  // Reveal-grid's question lives in the registry, so the shared run asks it
  // before this is ever called (`act-reveal-puzzle`): it is the one scope that
  // ends the puzzle rather than helping with it, it writes every player's board
  // at once, and the terminal Reveal/Hide toggle cannot take it back — the
  // letters ARE the players' fill now.
  const handleReveal = useCallback(
    async (scope: Scope) => {
      const target = scopeCells(scope)
      if (target.length === 0) return
      // See handleCheck: close the covering sheet so the revealed cells (and any
      // not-ok) are visible. No-op on desktop / when already closed.
      closeInfoSheet()
      localFeedbackSlot.dismiss()
      const res = await runRpc<RevealAnswer>(
        db.rpc('reveal_cells', { target_game: gameId, p_cells: target }),
      )
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'revealed') {
        // Flash the revealed cells on teammates' grids in my color — the
        // reveal's CDC arrives colorless (like a typed fill), so it needs its
        // own signal. Inside the branch because only a reveal that HAPPENED has
        // cells to flash.
        broadcastFills(target)
        return
      } else {
        reportUnhandled('reveal_cells', res)
        return
      }
    },
    [scopeCells, gameId, localFeedbackSlot, broadcastFills, closeInfoSheet],
  )

  // ─── The commands, bound ───────────────────────────────
  // Each one is offered exactly once here and placed twice — a menu row and a
  // square in the tool bar — so the two can't disagree about what it is called,
  // whether it applies or which key also does it.

  /** The help ladder applies while the board is writable, and grays with it. */
  const helpState = (): ActionState => (isPlayable ? 'active' : 'disabled')
  /** …and Reveal is coop-only: revealing your own grid would trivially win a
   *  race, so in compete it isn't there at all. */
  const revealState = (): ActionState => (mode === 'coop' ? helpState() : 'hidden')

  const actPencil = useBoundAction('act-pencil', {
    // Named in both faces: this row says where ⌥P takes you, and a row that
    // fell back to the registry's "Pencil" in one branch would rename itself.
    describe: () => ({ state: helpState(), label: pencil ? 'Switch to pen' : 'Switch to pencil' }),
    run: () => setPencil((p) => !p),
  })

  const actCheckLetter = useBoundAction('act-check-letter', {
    describe: helpState,
    run: () => handleCheck('letter'),
  })
  const actCheckWord = useBoundAction('act-check-word', {
    describe: helpState,
    run: () => handleCheck('word'),
  })
  const actCheckPuzzle = useBoundAction('act-check-puzzle', {
    describe: helpState,
    run: () => handleCheck('puzzle'),
  })
  const actRevealLetter = useBoundAction('act-reveal-letter', {
    describe: revealState,
    run: () => handleReveal('letter'),
  })
  const actRevealWord = useBoundAction('act-reveal-word', {
    describe: revealState,
    run: () => handleReveal('word'),
  })
  const actRevealPuzzle = useBoundAction('act-reveal-puzzle', {
    describe: revealState,
    run: () => handleReveal('puzzle'),
  })
  const check: ScopeActions = { letter: actCheckLetter, word: actCheckWord, puzzle: actCheckPuzzle }
  const reveal: ScopeActions = { letter: actRevealLetter, word: actRevealWord, puzzle: actRevealPuzzle }

  // The setter's note, and the AI explainer that needs one. The explainer is for
  // cryptics and a note is the proxy, which is how crossplay gates it too.
  const actShowNote = useBoundAction('act-show-note', {
    describe: () => (hasNote ? 'active' : 'disabled'),
    run: handleShowNote,
  })
  const actExplainClue = useBoundAction('act-explain-clue', {
    describe: () => (hasNote ? 'active' : 'disabled'),
    run: handleExplain,
  })

  // Display-only, and persisted per browser: collapse a multi-char rebus fill to
  // its first letter. Nothing about the game changes, so it is live at terminal.
  const actCollapseRebuses = useBoundAction('act-collapse-rebuses', {
    describe: () => ({ state: 'active', label: collapseRebus ? 'Expand rebuses' : 'Collapse rebuses' }),
    run: () => setRebusPref(collapseRebus ? 'off' : 'on'),
  })

  const actDownloadIpuz = useBoundAction('act-download-ipuz', {
    describe: () => (game ? 'active' : 'hidden'),
    run: handleDownloadIpuz,
  })

  // Print the puzzle — a snapshot at CLICK time (docs/pdf.md), which is what
  // `printStateRef` holds.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      const state = printStateRef.current
      if (state) void printCrosswordsPdf(state, game?.meta.title || 'crossword')
    },
  })

  // The answer key. Coop: any time. Compete: only once the game is over — an
  // answer key mid-race is a giveaway. (See handlePrintSolution: this is a UI
  // gate, not a server one.)
  const actPrintSolution = useBoundAction('act-print-solution', {
    describe: () => (mode === 'compete' && !isTerminal ? 'disabled' : 'active'),
    run: handlePrintSolution,
  })

  // The post-game answer grid — the same toggle in the menu and in the terminal
  // row, wearing the same two faces, so a player who dismissed one can reach the
  // other. Inert until terminal: the server only unshields the solution then.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (solutionShown) return { state: 'active', label: 'Hide solution', icon: IconHideSolution }
      // Named in the inert case too — the registry's bare "Reveal" would make
      // the row change its words as the game ended.
      return isTerminal
        ? { state: 'active', label: 'Reveal solution' }
        : { state: 'disabled', label: 'Reveal solution', tooltip: "Can't reveal until all end" }
    },
    run: toggleSolution,
  })

  // New game — unlike every other game's "same setup, fresh randomness", this
  // opens the club's SETUP dialog rather than creating a game directly. A
  // crossword has no randomness: `setup` names a PUZZLE, so replaying it would
  // re-serve the grid just solved (library / nyt / guardian all do), and an
  // uploaded board is stripped before it's persisted (manifest.ts — the
  // solution must never reach the unshielded setup blob), so there's nothing
  // to re-send at all. Picking the next puzzle is the only sane "another one",
  // and the setup dialog is where puzzles are picked.
  // (`navigate` directly, since the club URL needs a query and no ctx handle
  // carries one.)
  //
  // The registry asks NEW_GAME_CONFIRM mid-play — starting one SHELVES this
  // game (create_game clears the club's current-view flag, so it stays resumable
  // from the club page) and the copy says shelved, not ended.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: () => navigate(`${clubPath(clubHandle)}?new=crosswords_${mode}`),
  })

  // ⌥S is bound by the header's scratchpad mark, so this row is a reference to
  // that action rather than a second copy of it — and drops out on a page that
  // has no scratchpad.
  const actOpenScratchpad = useAppAction('act-open-scratchpad')

  // The FULL crosswords menu (crossplay order, single column): the play actions
  // ALSO live here, each advertising its own key, because crossplay's menu is
  // where a solver learns them. `buildGameMenu` supplies the framing (Help +
  // chat above, the exits + Back to club below).
  useEffect(function publishGameMenu() {
    if (!game) return
    // The puzzle title + credits, pinned at the top of the menu — crossplay shows
    // this "title / by author / copyright" block in its menu. Empty fields drop out.
    const menuHeader = {
      title: game.meta.title || 'Untitled',
      lines: [
        game.meta.author ? `by ${game.meta.author}` : null,
        game.meta.copyright || null,
      ].filter((line): line is string => line !== null),
    }
    menu.setGameSections(
      buildGameMenu({
        menu,
        header: menuHeader,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actPencil, actRebus, actCollapseRebuses] },
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
          // The two assistance families, each collapsed behind a submenu: six
          // flat rows would be a third of a menu that already scrolls. The
          // children keep their full names ("Check letter") under the parent,
          // because the same action is listed in Help with no parent to lend
          // it the verb.
          //
          // `disabled` sits on the PARENT only: a disabled parent can't be
          // opened, so repeating it per child would be dead weight. In compete
          // all three Reveal children hide, and a submenu with nothing left to
          // show is not a row you can open — so the whole family drops out
          // without this asking which mode it is.
          //
          // One section, not two: they're the same family (help me with this
          // square), and as two rows they no longer need a divider between them.
          {
            items: [
              { id: 'check', label: 'Check', disabled: !isPlayable, items: [actCheckLetter, actCheckWord, actCheckPuzzle] },
              { id: 'reveal', label: 'Reveal', disabled: !isPlayable, items: [actRevealLetter, actRevealWord, actRevealPuzzle] },
            ],
          },
          { items: [actRestart, actReveal, actNewGame] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, game, actConcede, actEndGame, actPencil, actRebus, actCollapseRebuses, actShowNote, actExplainClue, actOpenScratchpad, actPrintBoard, actDownloadIpuz, actPrintSolution, actCheckLetter, actCheckWord, actCheckPuzzle, actRevealLetter, actRevealWord, actRevealPuzzle, actRestart, actReveal, actNewGame, isPlayable])

  // ─── The two standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be. Restart is covered by the same rule: it
  // un-terminals the game, `isTerminal` flips, and the verdict's owner takes
  // it down.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. `status.winner_user_id` is the compete winner and
  // `status.winner_username` the handle cached at finish time (a rename is
  // rare enough that a stale name beats a follow-up query); the roster row is
  // read for the identity DOT, falling back to the cached name.
  const winnerId = (status?.winner_user_id as string | undefined) ?? null
  const winnerRow = players.find((p) => p.user_id === winnerId)
  const winnerName = winnerRow?.username ?? (status?.winner_username as string | undefined)
  const winnerColor = winnerRow?.color
  const timedOut = status?.outcome === 'timeout'
  const over = useMemo(
    () =>
      isTerminal
        ? buildOver({
            playState,
            mode,
            timedOut,
            selfWon: winnerId === myId,
            winner: winnerName === undefined ? undefined : { username: winnerName, color: winnerColor ?? '' },
          })
        : null,
    [isTerminal, playState, mode, timedOut, winnerId, myId, winnerName, winnerColor],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Out of the race while the others play on — a conceded compete player, so
  // their grayed-out input has an explanation.
  const isLocallyDone = myConceded && !isTerminal
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone])

  if (loading) {
    return (
      <div className={cls(styles.wrap, styles.loading)}>
        <p className="muted">Loading puzzle…</p>
      </div>
    )
  }
  // A failed read is NOT a missing game. Both leave the board unrenderable, and
  // saying "Game not found." about a dead connection is a confident wrong
  // answer — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Was fused with the loading state above, so a puzzle this club cannot see —
  // and a puzzle that failed to load — both read as "Loading puzzle…" forever.
  // `!cursor` stays here: it is derived from the grid, so it can only be absent
  // when the game is.
  if (!game || !cursor) {
    return (
      <div className={cls(styles.wrap, styles.loading)}>
        <p className="muted">Game not found.</p>
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

        {/* Active-clue bar — doubles as the local-feedback slot: whatever the
            slot holds on top (a not-ok, the verdict, "you're out", the pencil
            acknowledgment), else the active clue. Desktop: mid-right column.
            Mobile: directly under the grid — the ONE clue readout on the main
            view (the full lists are in the sheet). DOM order differs from the
            desktop visual order; the grid placements position it. */}
        {/* data-active-clue: a stable e2e hook (the class name is hashed). */}
        <div className={styles.activeClue} data-active-clue>
          {topFeedbackMsg !== null ? (
            <FeedbackPill slot={localFeedbackSlot} />
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
                  - TERMINAL: the controls all vanish (checking and penciling a
                    finished grid is meaningless) and the row becomes the three
                    things left to do. Deliberately NO outcome message here — a
                    documented departure from the shared <InfoActionsRow>,
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
                  {/* Icon-only, so the toggle's two faces occupy the same fixed
                      box: the strip cannot change width under a click, and this
                      layout is precise. */}
                  <ActionButton action={actReveal} show="icon" />
                  <ActionButton action={actRestart} show="icon" />
                  <ActionButton action={actNewGame} show="icon" />
                  <ActionButton action={menu.actBackToClub} show="icon" weight="primary" />
                </div>
              ) : myConceded ? (
                <InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }}>
                  {/* Inert, but present: the solution isn't even on this client
                      until the game is over for EVERYONE (_solution_for gates on
                      is_terminal), so a player who dropped out can't spoil a
                      live race — and the row keeps its shape for when the last
                      solver finishes. */}
                  <ActionButton action={actReveal} show="icon" />
                  <ActionButton action={actConcede} show="icon" />
                </InfoActionsRow>
              ) : (
                <div className={styles.toolRow}>
                  {/* End / Concede rides INSIDE the bar as icon-only children,
                      in its own rule-separated group — one row of uniform
                      squares, grouped by what they do. Both are placed; the one
                      this mode doesn't offer hides itself. */}
                  <Controls pencil={pencil} actPencil={actPencil} check={check} reveal={reveal}>
                    <ActionButton action={actConcede} show="icon" />
                    <ActionButton action={actEndGame} show="icon" />
                  </Controls>
                </div>
              )}
            </div>
          </div>
        </InfoSheet>
      </div>

      {numberJumpOpen && (
        <CrosswordsNumberJumpBlockingModal
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
        <CrosswordsNoteCompanion
          title={game.meta.title || 'Puzzle note'}
          note={game.meta.note}
          onClose={() => setNoteOpen(false)}
        />
      )}

      {explain && (
        <CrosswordsExplainCompanion clueLabel={explainLabel} state={explain} onClose={() => setExplain(null)} />
      )}

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the pill in the active-clue slot + the info-column line, and
          a coop solve gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="Solved! 🎉"
          body="The grid is complete."
          onClose={celebration.close}
        />
      )}
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
 * Map the terminal play_state to the shared `TerminalMessage` shape.
 * `outcome` + `pillText` are the verdict in the active-clue slot;
 * `outcome` + `infoColText` the short info-column outcome line.
 *
 * Verdicts lead with the outcome word (`Won:` / `Lost:`) and carry no trailing
 * period: the pill is a one-line, ellipsising row (~48 chars on a phone), so
 * it's a LABEL, not prose.
 *
 * The compete loser's verdict names WHO beat them: the winner rides as
 * `actor`, and the pill draws the mention the way every other message names
 * someone.
 */
function buildOver({
  playState,
  mode,
  timedOut,
  selfWon,
  winner,
}: {
  playState: string
  mode: 'coop' | 'compete'
  /** `submit_timeout` stamps `status.outcome = 'timeout'`. Of the two `lost*`
   *  states only `lost_compete` has a second way in (all-conceded, via
   *  common.concede); coop's `lost` is clock-only — coop has no concede. */
  timedOut: boolean
  selfWon: boolean
  /** The compete winner as name + color — the roster row when we have it,
   *  else the handle cached in `status` at finish time. */
  winner: Actor | undefined
}): TerminalMessage {
  switch (playState) {
    case 'won':
      return { pillText: 'Won: grid complete', infoColText: 'Solved!', outcome: 'won' }
    case 'won_compete':
      if (selfWon) {
        return { pillText: 'Won: solved it first', infoColText: 'You won!', outcome: 'won' }
      }
      return {
        pillText: 'solved it first',
        infoColText: `${winner?.username ?? 'a player'} won`,
        outcome: 'lost',
        actor: winner,
      }
    case 'lost_compete':
      // Both compete collective losses land here, told apart by `outcome`:
      // the countdown taking the whole table down together
      // (crosswords.submit_timeout, the roster's shared no-winner phrasing),
      // or the last active player conceding (common.concede's
      // last-active-conceder path — the same `Lost: all conceded` verdict
      // spellingbee/wordwheel use, matching the club card's label).
      if (timedOut) {
        return { pillText: 'Out of time — no winner', infoColText: 'Out of time', outcome: 'lost' }
      }
      return { pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' }
    case 'lost':
      // Coop only, and clock-only: the countdown expired before the grid was
      // done (crosswords.concede is compete-gated, so no concede path here).
      return { pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' }
    case 'ended':
    default:
      return gameEndedTerminalMessage(mode)
  }
}
