// cs-unmet

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useFlash } from '@/common/board-marks/useFlash'
import { ATTENTION_FLASH_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { cls } from '@/common/utils/cls'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { askConfirmation } from '@/common/floating-panels/confirmationService'
import type { ConfirmOptions } from '@/common/floating-panels/confirmations'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { Dot } from '@/common/members/Dot'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { useBoardCursorKeys } from '@/shared/board-cursor/useBoardCursorKeys'
import { useDragGesture, type DragGesture } from '@/shared/grid-and-drag/useDragGesture'
import { moveCursor, stepBack } from '@/shared/board-cursor/gridCursor'
import { db } from '../db'
import { BLANK, BOARD_SIZE, cellIndex, inBounds } from '../lib/board'
import { boardUpToSeq, evaluatePlay, type Placement } from '../lib/play'
import type { SharedMovePayload } from '../hooks/useSharedMove'
import type { ScrabbleGame, PlayerRow, PlayRow } from '../hooks/useGame'
import { Board, type Cursor, type Tentative } from './Board'
import { Rack } from './Rack'
import { Controls } from './Controls'
import { ScrabbleBlankPickerBlockingModal } from './ScrabbleBlankPickerBlockingModal'
import shared from '@/common/game-page/playArea.module.css'
import dragGhost from '@/shared/grid-and-drag/dragGhost.module.css'
import history from '@/common/turn-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** Pass's question. Scrabble's own rather than the registry's: passing here
 *  forfeits the turn's points and feeds the blocked-end streak, which is why
 *  it asks at all. */
const PASS_CONFIRM: ConfirmOptions = {
  title: 'Pass your turn?',
  message: 'You score nothing this turn, and if every seat passes in a row the game ends.',
  confirmLabel: 'Pass',
  cancelLabel: 'Keep playing',
}

/** A tile staged on the board this turn, tied to its rack slot. */
type Staged = Placement & { rackIdx: number }
type XY = { x: number; y: number }
type DragSource = { kind: 'rack'; rackIdx: number } | { kind: 'board'; x: number; y: number }

/**
 * What read-only overlay is open on the board — the shared history viewer's id,
 * widened for scrabble to carry BOTH kinds of read-only board it can show:
 *   - **`turn`** — a past turn's committed board (the history viewer).
 *   - **`shared`** — a coop teammate's in-progress move (their staged tiles laid
 *     on the live board), received over Broadcast (see useSharedMove).
 * Both wear the same viewer chrome (frame + banner + frozen input) and the same
 * exits (click / keystroke / ✕ / a new move) — so they ride one `useHistoryViewer`
 * as `useHistoryViewer<ViewTarget>`, and this switches on `kind` to render.
 */
export type ViewTarget =
  | { kind: 'turn'; seq: number }
  | { kind: 'shared'; placements: Placement[]; sharerId: string; words: string[]; score: number }

/** The board cell under a screen point (via data-cell), or null. */
function cellAtPoint(x: number, y: number): XY | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
  if (!el) return null
  return { x: Number(el.dataset.x), y: Number(el.dataset.y) }
}
function overRackAtPoint(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="rack"]')
}

// Stable empties for the turn-viewer (the live board's overlays are suppressed),
// so the Board doesn't get a fresh Set/Map each render.
const NO_CELLS: Set<number> = new Set()
const NO_TENT: Map<number, Tentative> = new Map()

/** The turn-viewer banner line for a play — terse so it fits even with a couple of
 *  long words: "#1 moth: +10 APPLE, BERRY" for a word, or the action ("#5 moth
 *  passed", "#5 moth exchanged 3 tiles") for the others. */
function turnSummary(p: PlayRow, nameOf: (id: string | null) => string): string {
  const who = nameOf(p.user_id)
  const n = `#${p.seq}`
  if (p.kind === 'word') {
    const words = (p.words ?? []).map((w) => w.toUpperCase()).join(', ')
    return `${n} ${who}: +${p.score ?? 0} ${words}`
  }
  if (p.kind === 'exchange') return `${n} ${who} exchanged ${p.tile_count} tiles`
  if (p.kind === 'pass') return `${n} ${who} passed`
  return `${n} ${who} ended — ${-(p.score ?? 0)} tiles unplayed` // forfeit
}

/**
 * The display position (0..N) a rack tile dropped at screen-x `px` should land at,
 * by comparing `px` to each rendered rack tile's horizontal midpoint — so dropping
 * left-of a tile inserts before it, right-of the last inserts at the end. Returns
 * null if the rack isn't on screen.
 */
function rackInsertIndexAtPoint(px: number): number | null {
  const tray = document.querySelector('[data-zone="rack"]')
  if (!tray) return null
  const tiles = [...tray.querySelectorAll('[data-rack-tile]')]
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect()
    if (px < r.left + r.width / 2) return i
  }
  return tiles.length
}

/**
 * The rack display order after a draw: keep the tiles that remain in their
 * current display order (compacted left), then append the freshly-drawn tiles
 * on the right — so it's obvious which are new. `removed` are the OLD rack
 * indices that left (played or exchanged); the server rebuilds the rack as
 * `[remaining-in-ascending-order ++ drawn]`, so new server indices
 * `[remainingCount .. newLen-1]` are the new tiles. Falls back to identity on
 * the first load (no prior action) or any length mismatch.
 */
function nextRackOrder(
  prevOrder: number[],
  action: { removed: Set<number>; oldLen: number } | null,
  newLen: number,
): number[] {
  const identity = Array.from({ length: newLen }, (_, i) => i)
  if (!action) return identity
  const remainingAsc: number[] = []
  for (let i = 0; i < action.oldLen; i++) if (!action.removed.has(i)) remainingAsc.push(i)
  const oldToNew = new Map(remainingAsc.map((oldIdx, k) => [oldIdx, k]))
  const remaining = prevOrder.filter((i) => oldToNew.has(i)).map((i) => oldToNew.get(i)!)
  const drawn: number[] = []
  for (let i = remainingAsc.length; i < newLen; i++) drawn.push(i)
  const result = [...remaining, ...drawn]
  return result.length === newLen ? result : identity
}

/**
 * scrabble's board column — the 15×15 board plus the below-board GameEntryArea (the
 * rack + the action row). This is the **turn machine**: staging (drag + keyboard
 * cursor), the blank picker, the drag ghost, the optimistic just-played tiles, the
 * flashes, and — because they're inseparable from that state — the `play_word` /
 * `exchange` / `pass` RPCs themselves (they claim `lastActionRef` before the await
 * for the realtime-beats-RPC race, and their results mutate `optimistic`/`staged`,
 * which the version-reset effect reads). So, unlike the other games' BoardCol which
 * emit one action up, scrabble's owns its RPCs; PlayArea hands it the game data +
 * gameId + the local feedback slot + the history-view inputs, and renders it beside
 * the InfoCol. See docs/playarea.md.
 *
 * Two more deliberate divergences from the stackdown/waffle contract, for the same
 * reason (the raw play data already lives here):
 *   - **It reconstructs the viewed board itself.** stackdown/waffle compute the
 *     historical snapshot in PlayArea and hand a ready-to-render board *down*;
 *     scrabble takes the raw `plays` + `viewingSeq` and runs `boardUpToSeq` (and
 *     builds the banner via `turnSummary`) in here, since `plays` is already the
 *     input the live board reads.
 *   - **It keys the viewer by `seq`, not log position.** The shared history hook
 *     returns a neutral `viewingId`; scrabble aliases it to `viewingSeq` (a stable
 *     turn number `boardUpToSeq` indexes by), where stackdown/waffle alias it to
 *     `viewingIndex` (an array position). Same hook, deliberately different key.
 */
/**
 * What the three move RPCs answer. Every one of them keeps `version`, and
 * `terminal` is on all three because the FE branches on it uniformly.
 *
 * `stale` is NOT here: a board that moved under you is a RACE, so it arrives on
 * the not-ok arm with the server's own "Board changed". The board version
 * rides in that refusal's `detail`, where the `[db]` line shows it — the
 * frontend's own `game.version` comes from the games-row subscription, which is
 * the authority.
 */
type PlayAnswer =
  | { result: 'accepted'; drawn: string[]; version: number; terminal: boolean }
  | { result: 'invalid'; bad_words: string[] }

type SwapAnswer = { result: 'exchanged'; drawn: string[]; version: number; terminal: boolean }

type PassAnswer = { result: 'passed'; version: number; terminal: boolean }

export function BoardCol({
  mobileStatus,
  game,
  gameId,
  self,
  myTurn,
  isTerminal,
  myConceded,
  localFeedbackSlot,
  plays,
  viewTarget,
  viewing,
  viewTargetRef,
  onExitViewing,
  nameOf,
  memberColorOf,
  canShare,
  shareMove,
  selfId,
  registerSuggestionApplier,
}: {
  // ── Mobile-only status strip ──
  /** The core state readout (the `<StateLine>` the InfoCol also renders), shown
   *  above the board ONLY below the `--mobile` breakpoint — where the info
   *  column is off-canvas in the InfoSheet and would otherwise take a tap to
   *  read. Hidden by CSS on desktop; see `<MobileStatusBar>`. */
  mobileStatus: ReactNode

  // ── Game data (the turn machine reads board/version/rack/bag off this) ──
  game: ScrabbleGame
  gameId: string
  /** My player row (rack in compete; null in coop where the rack is shared). undefined = I'm watching. */
  self: PlayerRow | undefined
  /** Is it my turn (compete); always true in coop. Gates committing (canCommit). */
  myTurn: boolean
  isTerminal: boolean
  myConceded: boolean

  // ── Below-board feedback (the slot is PlayArea's) ──
  /** PlayArea's below-board slot. The turn machine shows its results into it
   *  (played / rejected / no-tile / …), Controls draws it in the commit slot,
   *  and a board or rack interaction or a keystroke dismisses a gesture-
   *  cleared result. */
  localFeedbackSlot: FeedbackSlot

  // ── Board viewer (state owned by PlayArea; this renders the snapshot) ──
  plays: PlayRow[]
  /** The read-only overlay open on the board (a past turn OR a teammate's shared
   *  move), or null when live. */
  viewTarget: ViewTarget | null
  /** viewTarget !== null. */
  viewing: boolean
  /** A ref to viewTarget, read by the once-registered board-drag pointerdown. */
  viewTargetRef: RefObject<ViewTarget | null>
  /** Return to the live board (a board interaction / a keystroke / a new move). */
  onExitViewing: () => void
  /** Username for a user id — for the viewer banners. */
  nameOf: (id: string | null) => string
  /** Identity-disc color NAME for a user id — for the share banner's disc. */
  memberColorOf: (id: string) => string | undefined

  // ── Show-a-move (coop only — see useSharedMove) ──
  /** Coop with ≥2 players — gates the Share button (there's a teammate to show). */
  canShare: boolean
  /** Broadcast my staged tiles to teammates for a read-only preview. */
  shareMove: (payload: SharedMovePayload) => void
  /** My user id — stamped on a broadcast as its `sharerId`. */
  selfId: string

  // ── Suggest-a-move (coop only — see docs/scrabble-ai.md S5) ──
  /** Register (or, with null, unregister) the "stage this suggested move"
   *  applier with PlayArea, which calls it from the InfoCol list's click —
   *  staging lives here, the suggest state there (the menu.setGameSections
   *  register shape). */
  registerSuggestionApplier: (fn: ((placements: Placement[]) => void) | null) => void
}) {
  const [staged, setStaged] = useState<Staged[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set()) // exchange selection
  const [order, setOrder] = useState<number[]>([])
  const [blankAt, setBlankAt] = useState<{ x: number; y: number; rackIdx: number } | null>(null)
  const [cursor, setCursor] = useState<Cursor>({ x: 7, y: 7, dir: 'h' })
  const [submitting, setSubmitting] = useState(false)
  // Just-played tiles, rendered as committed until the realtime refetch brings
  // them in for real — so an accepted word never blinks off the board.
  const [optimistic, setOptimistic] = useState<Placement[]>([])
  // Three brief outlines, each on the beat the vocabulary gives its KIND
  // (feedbackTiming): the rack slots just drawn are news arriving in place that
  // the player did not choose, so they take the attention beat; the cells just
  // played and the cells of a refused word are both a word's ANSWER on the
  // board, which is read rather than glanced at and stays accordingly.
  //
  // WHETHER these are the right marks at all is scrabble's own tile-feedback
  // pass to say — the green one marks the player's own move, which the audience
  // rule says needs no mark, since the pill already answers.
  const [greenFlash, flashGreen] = useFlash<number>(WORD_ANSWER_MS)
  const [yellowFlash, flashYellow] = useFlash<number>(ATTENTION_FLASH_MS)
  const [redFlash, flashRed] = useFlash<number>(WORD_ANSWER_MS)

  // ─── Derived ───────────────────────────────────────────────────
  const mode = game.mode
  const isCompete = mode === 'compete'
  const actingRack = useMemo(
    () => (mode === 'coop' ? (game.sharedRack ?? []) : (self?.rack ?? [])),
    [mode, game.sharedRack, self?.rack],
  )
  // Two gates. `canPlace` — may stage / recall / reorder tiles: in COMPETE this is
  // allowed even when it ISN'T your turn ("pre-play"). `canCommit` — may actually
  // commit a turn-consuming move (Submit / Swap / Pass), which requires it to be
  // your turn. In coop myTurn is always true, so the two coincide.
  const canPlace = !!self && !isTerminal && !myConceded && !submitting
  const canCommit = canPlace && myTurn

  const usedRackIdx = useMemo(() => new Set(staged.map((s) => s.rackIdx)), [staged])
  const tentativeMap = useMemo(() => {
    const m = new Map<number, Tentative>()
    for (const s of staged) m.set(cellIndex(s.x, s.y), { letter: s.letter, blank: s.blank })
    return m
  }, [staged])
  const rackTiles = useMemo(
    () => order.filter((i) => i < actingRack.length).map((i) => ({ glyph: actingRack[i], rackIdx: i })),
    [order, actingRack],
  )
  // The board we render + validate against: the server's committed board with
  // the optimistic just-played tiles overlaid (they read as committed).
  const board = useMemo(() => {
    const base = game.board ?? []
    if (optimistic.length === 0) return base
    const b = [...base]
    for (const p of optimistic) b[cellIndex(p.x, p.y)] = { l: p.letter, b: p.blank }
    return b
  }, [game.board, optimistic])

  // Live preview: geometry + score of the staged tiles (dictionary is only
  // checked on submit). Drives the Submit-button label.
  const preview = useMemo(
    () => (staged.length > 0 ? evaluatePlay(board, staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))) : null),
    [board, staged],
  )

  // Refs the always-on pointer handlers read, so they can stay stable
  // (registered once) instead of re-binding on every state change.
  const boardRef = useRef(board)
  const stagedRef = useRef(staged)
  const actingRackRef = useRef(actingRack)
  const canPlaceRef = useRef(canPlace)
  const orderRef = useRef(order)
  // (viewingSeqRef is owned by useHistoryViewer, passed down — synced there.)
  useEffect(() => {
    boardRef.current = board
    stagedRef.current = staged
    actingRackRef.current = actingRack
    canPlaceRef.current = canPlace
    orderRef.current = order
  }, [board, staged, actingRack, canPlace, order])

  // How many tiles the last play/exchange drew — turned into a yellow rack
  // flash once the new rack arrives (the drawn tiles are the rack's last N).
  const pendingDrawRef = useRef(0)
  // Which OLD rack slots left on the last play/exchange (+ the old rack length),
  // so the next order keeps the remaining tiles put and adds the new ones right.
  const lastActionRef = useRef<{ removed: Set<number>; oldLen: number } | null>(null)

  // On a server version move, distinguish MY commit from an OPPONENT'S move:
  //   - MY play/exchange (`lastActionRef` set when I acted, so I drew tiles), or
  //     ANY coop commit (shared rack changed): reset staging + rebuild the rack
  //     order (remaining tiles kept, drawn tiles appended + flashed).
  //   - COMPETE + an opponent moved (I didn't act → my rack is untouched): KEEP my
  //     pre-played tiles AND my rack order. Only if the opponent committed onto a
  //     cell I'd pre-played do I clear the pre-play + warn (the move is invalid now).
  const prevVersion = useRef<number | null>(null)
  const rackLen = actingRack.length
  useEffect(() => {
    if (prevVersion.current === game.version) return
    prevVersion.current = game.version
    setSelected(new Set())
    onExitViewing() // a new move landed — drop back to the live board
    setOptimistic([]) // the server board now holds any just-played tiles
    // Leave the cursor where it is — the next word is usually nearby.

    const myMove = lastActionRef.current !== null
    if (isCompete && !myMove) {
      // An opponent's compete move (or the very first load): my rack is unchanged,
      // so don't rebuild order/flash — EXCEPT seed the initial order when it's still
      // empty (first load takes this branch, since I haven't acted), or the rack
      // renders no tiles.
      if (orderRef.current.length === 0 && rackLen > 0) {
        setOrder(Array.from({ length: rackLen }, (_, i) => i))
      }
      // Keep my pre-play unless a tile I staged is now occupied on the board.
      const committed = game.board ?? []
      const conflict = stagedRef.current.some((s) => committed[cellIndex(s.x, s.y)] != null)
      if (conflict) {
        setStaged([])
        // Terse on purpose — the commit slot is narrow.
        localFeedbackSlot.show(FeedbackMessage.result('warning', 'Pre-play cleared: conflict'))
      }
      pendingDrawRef.current = 0
      return
    }

    // My commit (compete or coop), or any coop commit: reset staging + rebuild rack.
    setStaged([])
    setOrder(nextRackOrder(orderRef.current, lastActionRef.current, rackLen))
    lastActionRef.current = null
    if (pendingDrawRef.current > 0 && rackLen > 0) {
      const n = Math.min(pendingDrawRef.current, rackLen)
      flashYellow(Array.from({ length: n }, (_, i) => rackLen - n + i))
    }
    pendingDrawRef.current = 0
  }, [game.version, game.board, rackLen, isCompete, localFeedbackSlot, flashYellow, onExitViewing])

  // Apply an accepted AI suggestion (docs/scrabble-ai.md S5): fill the staging
  // state with the suggested placements — the SAME state a hand-placed move
  // uses, so the player reviews the ghost tiles on the board and commits
  // through the normal play flow. The suggester is advisory: it never submits.
  // Each placement is re-resolved against the live rack (a blank consumes a
  // '?'), and the whole apply bails with a terse result if the board or rack
  // changed under it (a teammate played while the list was open — PlayArea
  // derives staleness off game.version, but the click can race it). Runs in
  // the InfoCol list's click handler — PlayArea holds it via the register
  // prop (an external-registry effect, like menu.setGameSections).
  const applySuggestedMove = useCallback(
    (placements: Placement[]) => {
      if (!canPlaceRef.current) return
      onExitViewing() // staging happens on the live board, never under a viewer overlay
      const used = new Set<number>()
      const next: Staged[] = []
      for (const p of placements) {
        const free = boardRef.current[cellIndex(p.x, p.y)] == null
        const want = p.blank ? BLANK : p.letter
        const rackIdx = actingRackRef.current.findIndex((g, i) => !used.has(i) && g === want)
        if (!free || rackIdx < 0) {
          localFeedbackSlot.show(FeedbackMessage.result('warning', 'Board changed'))
          return
        }
        used.add(rackIdx)
        next.push({ x: p.x, y: p.y, letter: p.letter, blank: p.blank, rackIdx })
      }
      localFeedbackSlot.dismiss()
      setStaged(next) // replaces any hand-staged tiles — the player asked for this move
    },
    [onExitViewing, localFeedbackSlot],
  )
  useEffect(() => {
    registerSuggestionApplier(applySuggestedMove)
    return () => registerSuggestionApplier(null)
  }, [registerSuggestionApplier, applySuggestedMove])

  // ─── Cell-state helpers (ref-based; used by stable handlers) ──
  const committedAt = useCallback((x: number, y: number) => !!boardRef.current[cellIndex(x, y)], [])
  const stagedAt = useCallback(
    (x: number, y: number) => stagedRef.current.find((s) => s.x === x && s.y === y),
    [],
  )

  // ─── Drag gesture (shared pointer plumbing — see useDragGesture) ──
  const toggleSelect = useCallback((rackIdx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rackIdx)) next.delete(rackIdx)
      else next.add(rackIdx)
      return next
    })
  }, [])

  const finishDrag = useCallback(
    (g: DragGesture<DragSource, XY>, px: number, py: number) => {
      const target = cellAtPoint(px, py)
      if (target) {
        const ownCell = g.source.kind === 'board' && g.source.x === target.x && g.source.y === target.y
        const occupied = (committedAt(target.x, target.y) || !!stagedAt(target.x, target.y)) && !ownCell
        if (occupied) return // taken → snap back
        if (g.source.kind === 'rack') {
          const rackIdx = g.source.rackIdx
          const glyph = actingRackRef.current[rackIdx]
          if (glyph === BLANK) {
            setBlankAt({ x: target.x, y: target.y, rackIdx })
            return
          }
          setStaged((prev) => [...prev, { x: target.x, y: target.y, letter: glyph, blank: false, rackIdx }])
        } else {
          // Move a staged tile to a new square.
          const s = stagedAt(g.source.x, g.source.y)
          if (!s) return
          setStaged((prev) => [
            ...prev.filter((p) => !(p.x === s.x && p.y === s.y)),
            { x: target.x, y: target.y, letter: s.letter, blank: s.blank, rackIdx: s.rackIdx },
          ])
        }
        return
      }
      // Dropped off the grid onto the rack → recall a staged tile.
      if (g.source.kind === 'board' && overRackAtPoint(px, py)) {
        const { x, y } = g.source
        setStaged((prev) => prev.filter((p) => !(p.x === x && p.y === y)))
        return
      }
      // A rack tile dropped back on the rack → REORDER it (people rearrange tiles
      // to hunt for anagrams). Move it to the drop position in the display `order`.
      if (g.source.kind === 'rack' && overRackAtPoint(px, py)) {
        const insertAt = rackInsertIndexAtPoint(px)
        if (insertAt === null) return
        const rackIdx = g.source.rackIdx
        setOrder((prev) => {
          const from = prev.indexOf(rackIdx)
          if (from < 0) return prev
          let to = insertAt
          const next = [...prev]
          next.splice(from, 1)
          if (from < to) to -= 1 // removal shifted later positions left
          next.splice(Math.min(to, next.length), 0, rackIdx)
          return next
        })
      }
    },
    [committedAt, stagedAt],
  )

  // A plain tap: on a rack tile toggles it for exchange; on a board square
  // moves the keyboard cursor there.
  const onTap = useCallback(
    (g: DragGesture<DragSource, XY>) => {
      if (g.source.kind === 'rack') toggleSelect(g.source.rackIdx)
      else if (g.cell) setCursor({ x: g.cell.x, y: g.cell.y, dir: 'h' })
    },
    [toggleSelect],
  )

  const { drag, hover, start } = useDragGesture<DragSource, XY>({
    dragClass: 'scrabble-dragging',
    cellAtPoint,
    onDrop: finishDrag,
    onTap,
  })

  const onCellPointerDown = useCallback(
    (x: number, y: number, e: React.PointerEvent) => {
      // While a read-only overlay is open (a past turn or a teammate's shared
      // move) the board is read-only; a click exits to live rather than placing.
      if (viewTargetRef.current != null) {
        onExitViewing()
        return
      }
      if (!canPlaceRef.current) return
      localFeedbackSlot.dismiss() // a board interaction is the next move
      const tent = stagedAt(x, y) // only staged tiles are draggable; committed are locked
      start({ kind: 'board', x, y }, tent ? tent.letter : null, { x, y }, e)
    },
    // onExitViewing + viewTargetRef are stable (from useHistoryViewer), so listing
    // them keeps this handler's single-registration without churn.
    [stagedAt, start, localFeedbackSlot, onExitViewing, viewTargetRef],
  )

  const onRackPointerDown = useCallback(
    (rackIdx: number, glyph: string, e: React.PointerEvent) => {
      if (!canPlaceRef.current) return
      localFeedbackSlot.dismiss() // a rack interaction is the next move
      start({ kind: 'rack', rackIdx }, glyph, null, e)
    },
    [start, localFeedbackSlot],
  )

  const pickBlank = useCallback(
    (letter: string) => {
      if (!blankAt) return
      setStaged((prev) => [...prev, { x: blankAt.x, y: blankAt.y, letter, blank: true, rackIdx: blankAt.rackIdx }])
      setBlankAt(null)
    },
    [blankAt],
  )

  // ─── Keyboard cursor (mirrors bananagrams's keys) ──────────────
  const isFilled = useCallback(
    (x: number, y: number) => committedAt(x, y) || !!stagedAt(x, y),
    [committedAt, stagedAt],
  )
  const nextEmpty = useCallback(
    (x: number, y: number, dir: 'h' | 'v'): XY | null => {
      let cx = x
      let cy = y
      do {
        if (dir === 'h') cx++
        else cy++
      } while (inBounds(cx, cy) && isFilled(cx, cy))
      return inBounds(cx, cy) ? { x: cx, y: cy } : null
    },
    [isFilled],
  )

  const typeLetter = useCallback(
    (letter: string) => {
      // Skip forward over committed (locked) tiles to the first placeable cell.
      let tx = cursor.x
      let ty = cursor.y
      while (inBounds(tx, ty) && committedAt(tx, ty)) {
        if (cursor.dir === 'h') tx++
        else ty++
      }
      if (!inBounds(tx, ty)) return
      // A rack tile for the letter (or a blank declared as it); the slot under
      // the cursor (if we're overwriting a staged tile) is available again.
      const usedExcept = new Set(staged.filter((s) => !(s.x === tx && s.y === ty)).map((s) => s.rackIdx))
      let rackIdx = actingRack.findIndex((g, i) => !usedExcept.has(i) && g === letter)
      let blank = false
      if (rackIdx < 0) {
        rackIdx = actingRack.findIndex((g, i) => !usedExcept.has(i) && g === BLANK)
        blank = true
      }
      if (rackIdx < 0) {
        localFeedbackSlot.show(FeedbackMessage.result('noted', `No “${letter}” tile`))
        return
      }
      setStaged((prev) => [...prev.filter((s) => !(s.x === tx && s.y === ty)), { x: tx, y: ty, letter, blank, rackIdx }])
      const nxt = nextEmpty(tx, ty, cursor.dir)
      setCursor(nxt ? { x: nxt.x, y: nxt.y, dir: cursor.dir } : { x: tx, y: ty, dir: cursor.dir })
    },
    [cursor, staged, actingRack, committedAt, nextEmpty, localFeedbackSlot],
  )

  const backspace = useCallback(() => {
    setStaged((prev) => prev.filter((s) => !(s.x === cursor.x && s.y === cursor.y)))
    setCursor((cur) => stepBack(cur, BOARD_SIZE - 1))
  }, [cursor])

  const recallAll = useCallback(() => setStaged([]), [])
  const shuffle = useCallback(() => setOrder((prev) => [...prev].sort(() => Math.random() - 0.5)), [])

  // ─── Server moves ─────────────────────────────────────────────
  const submit = useCallback(async () => {
    const placements: Placement[] = staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))
    const ev = evaluatePlay(board, placements)
    // Submit is allowed for any placed tiles (it doesn't gate on legal geometry).
    // An illegal shape never reaches the server; surface the reason as an
    // own-move result in the commit slot and stop here. (`ev.error` is
    // evaluatePlay's own FE-authored sentence, not server text.)
    if (!ev.valid) {
      localFeedbackSlot.show(FeedbackMessage.result('lost', ev.error))
      return
    }
    setSubmitting(true)
    // Claim the move BEFORE the await: if my own realtime write bumps game.version
    // during the RPC round-trip, the version effect must attribute it to ME (rebuild
    // my rack), not take the OPPONENT branch — which would flash a spurious
    // "Pre-play cleared: conflict" and leak lastActionRef into the next real opponent
    // move (a scrambled rack). Snapshot for rollback: a rejected play never commits
    // and never bumps the version, so it must un-claim.
    const prevAction = lastActionRef.current
    const prevDraw = pendingDrawRef.current
    lastActionRef.current = { removed: new Set(staged.map((s) => s.rackIdx)), oldLen: actingRack.length }
    pendingDrawRef.current = staged.length // optimistic; corrected to res.drawn on accept
    const res = await runRpc<PlayAnswer>(db.rpc('play_word', {
      target_game: gameId,
      base_version: game.version,
      placements: placements as unknown as never,
      words: ev.words.map((w) => w.word),
      score: ev.score,
    }))
    setSubmitting(false)
    // ONE un-claim, covering every answer that didn't commit. `stale` is a
    // RACE — somebody else's move bumped the board version — so it arrives
    // here with the server's own "Board changed", in the orange a race reads as.
    if (res.type === 'not-ok') {
      lastActionRef.current = prevAction // the move didn't land — un-claim it
      pendingDrawRef.current = prevDraw
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'accepted') {
      // Hold the played tiles on the board (as committed) until the realtime
      // refetch lands, so they don't blink out; green-flash them. The new rack
      // tiles get the yellow flash once the rack arrives.
      setOptimistic(placements)
      flashGreen(placements.map((p) => cellIndex(p.x, p.y)))
      pendingDrawRef.current = res.data.drawn.length // exact draw count now known
      setStaged([])
      setSelected(new Set())
      const words = ev.words.map((w) => w.word).join(' · ')
      localFeedbackSlot.show(
        FeedbackMessage.result('won', `${words} +${ev.score}${ev.bingo ? ' 🎉' : ''}`),
      )
      return
    } else if (res.type === 'ok' && res.data.result === 'invalid') {
      // The dictionary refused it — the one validation this client cannot do,
      // so an ok rather than a failure. Nothing was written and no version was
      // bumped, so the claim comes back.
      lastActionRef.current = prevAction
      pendingDrawRef.current = prevDraw
      const badWords = res.data.bad_words ?? []
      localFeedbackSlot.show(
        FeedbackMessage.result('lost', `No: ${badWords.join(', ').toUpperCase()}`),
      )
      // Red-flash the NEW cells in each rejected word (match the server's
      // bad_words back to the words evaluatePlay read off the board).
      const bad = new Set(badWords.map((w) => w.toUpperCase()))
      const cells = new Set<number>()
      for (const w of ev.words) {
        if (!bad.has(w.word.toUpperCase())) continue
        for (const c of w.cells) if (c.isNew) cells.add(cellIndex(c.x, c.y))
      }
      flashRed(cells)
      return
    } else {
      lastActionRef.current = prevAction
      pendingDrawRef.current = prevDraw
      reportUnhandled('play_word', res)
      return
    }
  }, [game.version, board, staged, actingRack, gameId, localFeedbackSlot, flashGreen, flashRed])

  const exchange = useCallback(async () => {
    const tiles = [...selected].map((i) => actingRack[i])
    setSubmitting(true)
    // Claim before the await — same realtime-beats-RPC race as play_word.
    const prevAction = lastActionRef.current
    const prevDraw = pendingDrawRef.current
    lastActionRef.current = { removed: new Set(selected), oldLen: actingRack.length }
    pendingDrawRef.current = tiles.length // optimistic; corrected on success
    const res = await runRpc<SwapAnswer>(
      db.rpc('exchange_tiles', { target_game: gameId, base_version: game.version, rack_tiles: tiles }),
    )
    setSubmitting(false)
    if (res.type === 'not-ok') {
      lastActionRef.current = prevAction // no commit — un-claim
      pendingDrawRef.current = prevDraw
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'exchanged') {
      setSelected(new Set())
      pendingDrawRef.current = res.data.drawn?.length ?? tiles.length
      localFeedbackSlot.show(FeedbackMessage.result('won', `Swapped ${tiles.length}`))
      return
    } else {
      lastActionRef.current = prevAction
      pendingDrawRef.current = prevDraw
      reportUnhandled('exchange_tiles', res)
      return
    }
  }, [game.version, selected, actingRack, gameId, localFeedbackSlot])

  const pass = useCallback(async () => {
    // Confirm — passing forfeits the turn AND feeds the blocked-end streak (once
    // every seat passes in a row the game is over), and the button is easy to
    // misclick. Asked here rather than by the registry because the question is
    // scrabble's alone: codenamesduet's end-turn is an every-turn move and asks
    // nothing. Exchange needs no confirm: it's disabled until tiles are
    // selected, so it's rarely hit by accident.
    if ((await askConfirmation(PASS_CONFIRM)) !== 'confirm') return
    const res = await runRpc<PassAnswer>(
      db.rpc('pass_turn', { target_game: gameId, base_version: game.version }),
    )
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'passed') {
      // Nothing to say: the turn hands on, and the seat strip redraws from the
      // games row. The pass is in the turn log either way.
      return
    } else {
      reportUnhandled('pass_turn', res)
      return
    }
  }, [game.version, gameId, localFeedbackSlot])

  // Show-a-move (coop): broadcast my staged tiles to teammates for a read-only
  // preview. Snapshot semantics — one send per click; re-click to re-show an
  // updated move. `words`/`score` ride along for the banner (empty/0 if the
  // arrangement isn't a legal play yet). Ephemeral: never stored, and a teammate
  // who misses it simply doesn't see it (see useSharedMove).
  const shareCurrentMove = useCallback(() => {
    if (staged.length === 0) return
    const placements: Placement[] = staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))
    const ev = evaluatePlay(board, placements)
    shareMove({
      placements,
      sharerId: selfId,
      baseVersion: game.version,
      words: ev.valid ? ev.words.map((w) => w.word) : [],
      score: ev.valid ? ev.score : 0,
    })
  }, [staged, board, shareMove, selfId, game.version])

  // Any key dismisses a gesture-cleared result. A NON-consuming watcher, so the
  // same press still stages its tile — which is why this is the shared hook
  // rather than a branch inside the board's keys.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // Board-cursor keyboard — the shared 2-D placement engine (bananagrams' twin),
  // four bound actions. scrabble supplies its 5%: type stages a tile, Backspace
  // takes the last one back, and the commit is a SUBMIT of the staged word.
  //
  // Leaving a turn viewer is not the board's concern: `useHistoryViewer` binds
  // that itself, and the dispatcher runs an any-key MODE ahead of any particular
  // key, so the press reaches it without the board standing aside.
  const { actCommit: actSubmit } = useBoardCursorKeys({
    enabled: canPlace,
    commit: 'act-submit',
    // NARROWER than `canPlace`: in compete you may stage a play before your turn
    // ("pre-play"), and the Submit button shows its score while it waits. The
    // same answer grays the button and stops Enter firing a no-op.
    canCommit: staged.length > 0 && canCommit,
    onArrow: (k) => setCursor((cur) => moveCursor(cur, k, BOARD_SIZE - 1)),
    onLetter: (letter) => typeLetter(letter),
    onBackspace: backspace,
    onEnter: () => void submit(),
  })

  // The Submit button's live score preview: the play's score when tiles are staged
  // (0 for a not-yet-legal arrangement), or null (an em-dash) on an empty board.
  const submitScore = staged.length > 0 ? (preview?.valid ? preview.score : 0) : null
  // Submittable only on your turn (compete) — a pre-played move shows its score
  // (a disabled Submit displaying "+N") and enables the moment your turn starts.
  // Swapping needs a bag deep enough to draw a fresh hand from.
  const canExchange = game.bagCount >= 7

  // ─── The rack + commit row's own commands ──────────────
  // Each is ONE binding behind its control, so what a button says about itself
  // and what it does are the same answer. A key comes with the binding: Shuffle
  // answers `⌥Z` because the registry says so, and giving another one a key is
  // a line there rather than a change here.
  const actShuffle = useBoundAction('act-shuffle', {
    // Live whenever there are tiles to reorder, a frozen board included:
    // rearranging your own rack is not acting on the game.
    describe: () => (rackTiles.length === 0 ? 'hidden' : 'active'),
    run: shuffle,
  })

  // Recall — every staged tile back to the rack at once. Distinct from ⌫, which
  // takes the last one back.
  const actRecallTiles = useBoundAction('act-recall-tiles', {
    describe: () => (staged.length > 0 ? 'active' : 'disabled'),
    run: recallAll,
  })

  // Show the staged play to teammates, read-only. Coop with somebody to show it
  // to, so it hides itself in a race and in a solo game.
  const actSharePreview = useBoundAction('act-share-preview', {
    describe: () => {
      if (!canShare) return 'hidden'
      return staged.length > 0 ? { state: 'active', label: 'Show move to team' } : { state: 'disabled', label: 'Show move to team' }
    },
    run: shareCurrentMove,
  })

  // Swap rack tiles for fresh ones — a turn-consuming move, so it waits for your
  // turn, for a selection, and for a bag deep enough to draw from. The two gates
  // a player can do something about say so in the bubble; the words stay "Swap".
  const actExchange = useBoundAction('act-exchange', {
    describe: () => {
      if (!canExchange) return { state: 'disabled', label: 'Swap', tooltip: 'Need ≥ 7 tiles in the bag' }
      if (!canCommit || staged.length > 0) return { state: 'disabled', label: 'Swap' }
      if (selected.size === 0) return { state: 'disabled', label: 'Swap', tooltip: 'Select rack tiles first' }
      return {
        state: 'active',
        label: `Swap ${selected.size} selected tile${selected.size === 1 ? '' : 's'}`,
      }
    },
    run: exchange,
  })

  // Pass the turn — compete only (in coop the table simply plays on), and only
  // with nothing staged: passing is what you do INSTEAD of a move.
  const actPass = useBoundAction('act-pass', {
    describe: () => {
      if (!isCompete) return 'hidden'
      return canCommit && staged.length === 0 ? 'active' : 'disabled'
    },
    run: pass,
  })

  // Board viewer: two read-only overlays share the chrome (frame + banner + frozen
  // input + suppressed live overlays), picked by `viewTarget.kind`:
  //   - a past TURN — the replayed historical board, that turn's played cells
  //     outlined (via boardUpToSeq); or
  //   - a teammate's SHARED move — the live board with their staged tiles laid on
  //     as tentative, those cells outlined.
  const viewTurn = viewTarget?.kind === 'turn' ? viewTarget : null
  const viewShared = viewTarget?.kind === 'shared' ? viewTarget : null
  const viewedPlay: PlayRow | null = viewTurn
    ? (plays.find((p) => p.seq === viewTurn.seq) ?? null)
    : null
  const renderBoard = viewTurn ? boardUpToSeq(plays, viewTurn.seq) : board
  // A shared move's tiles, as a tentative map over the live board (stable ref when
  // not sharing, like NO_TENT, so the Board doesn't churn).
  const sharedTent = useMemo(() => {
    if (!viewShared) return NO_TENT
    const m = new Map<number, Tentative>()
    for (const p of viewShared.placements) m.set(cellIndex(p.x, p.y), { letter: p.letter, blank: p.blank })
    return m
  }, [viewShared])
  const viewingCells = viewTurn
    ? viewedPlay?.kind === 'word'
      ? new Set((viewedPlay.placements ?? []).map((pl) => cellIndex(pl.x, pl.y)))
      : NO_CELLS
    : viewShared
      ? new Set(viewShared.placements.map((pl) => cellIndex(pl.x, pl.y)))
      : NO_CELLS

  return (
    <>
      {/* `.sharePreview` on the column recolors the frame + banner via the
          cascading `--viewer-accent` var, so a teammate's shared move reads
          distinctly from a history replay (theme.css → --view-sharePreview-color). */}
      <div className={cls(shared.boardCol, styles.boardCol, viewShared && history.sharePreview)}>
        {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
            the live turn/score + bag readout, above the board. It's a fixed-height
            row, and the square board sizes off `--avail-h` — so PlayArea.module.css
            subtracts this row's height there too, in BOTH the --mobile and --phone
            regimes, or the board would overflow (the hard no-scroll invariant). */}
        <MobileStatusBar>{mobileStatus}</MobileStatusBar>
        <Board
          board={renderBoard}
          tentative={viewTurn ? NO_TENT : viewShared ? sharedTent : tentativeMap}
          cursor={cursor}
          hover={viewing ? null : hover}
          greenCells={viewing ? NO_CELLS : greenFlash}
          redCells={viewing ? NO_CELLS : redFlash}
          dragSource={drag && drag.source.kind === 'board' ? { x: drag.source.x, y: drag.source.y } : null}
          dragging={!!drag}
          viewing={viewing}
          viewingCells={viewingCells}
          onCellPointerDown={onCellPointerDown}
        />

        <div className={styles.belowBoard}>
          {/* Viewer banner — overlays the input area (the rack stays mounted
              underneath, so `staged` is preserved). Click anywhere to exit; the ✕
              at the far right also exits. Either a past turn's summary, or a
              teammate's shared move ("● moth showing: +18 BERRY"). */}
          {viewing && (viewedPlay || viewShared) && (
            <div className={history.banner} onClick={onExitViewing} title="Click to exit">
              <span className={history.bannerLabel}>
                {viewShared ? (
                  <>
                    <Dot color={memberColorOf(viewShared.sharerId)} />{' '}
                    {nameOf(viewShared.sharerId)} showing:{' '}
                    {viewShared.words.length > 0
                      ? `+${viewShared.score} ${viewShared.words.map((w) => w.toUpperCase()).join(', ')}`
                      : `${viewShared.placements.length} tile${viewShared.placements.length === 1 ? '' : 's'}`}
                  </>
                ) : (
                  turnSummary(viewedPlay!, nameOf)
                )}
              </span>
              <button
                type="button"
                className={history.bannerExit}
                onClick={(e) => {
                  e.stopPropagation()
                  onExitViewing()
                }}
                aria-label="Exit viewing"
              >
                ✕
              </button>
            </div>
          )}
          {self ? (
            <div className={styles.moveArea}>
              <div className={styles.rackWrap}>
                <Rack tiles={rackTiles} used={usedRackIdx} selected={selected} flashIds={yellowFlash} active={canPlace} onPointerDown={onRackPointerDown} />
                {/* Shuffle floats over the rack's top-right corner — a quick
                    reshuffle of the RACK (not a turn action), so it sits on the
                    rack, not in the commit row. Hidden when the rack is empty
                    (nothing to shuffle); it floats absolutely, so no reflow. */}
                {rackTiles.length > 0 && (
                  <ShuffleButton action={actShuffle} tooltip="Shuffle rack" className={styles.rackShuffle} />
                )}
              </div>
              <Controls
                submitScore={submitScore}
                actSubmit={actSubmit}
                actRecallTiles={actRecallTiles}
                actSharePreview={actSharePreview}
                actExchange={actExchange}
                actPass={actPass}
                localFeedbackSlot={localFeedbackSlot}
              />
            </div>
          ) : (
            <p className="muted">Watching — you're not in this game.</p>
          )}
        </div>
      </div>

      {blankAt && <ScrabbleBlankPickerBlockingModal onPick={pickBlank} onCancel={() => setBlankAt(null)} />}

      {drag && (
        <div className={cls(dragGhost.ghost, styles.ghost)} style={{ left: drag.x, top: drag.y }}>
          {drag.letter === BLANK ? '' : drag.letter}
        </div>
      )}
    </>
  )
}
