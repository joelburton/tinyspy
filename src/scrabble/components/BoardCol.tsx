import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
import { useFlash } from '../../common/hooks/ui/useFlash'
import { cls } from '../../common/lib/util/cls'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { useBoardCursorKeys } from '../../common/hooks/input/useBoardCursorKeys'
import { useDragGesture, type DragGesture } from '../../common/hooks/ui/useDragGesture'
import { moveCursor, stepBack } from '../../common/lib/game/gridCursor'
import { db } from '../db'
import { BLANK, BOARD_SIZE, cellIndex, inBounds } from '../lib/board'
import { boardUpToSeq, evaluatePlay, type Placement } from '../lib/play'
import type { SharedMovePayload } from '../hooks/useSharedMove'
import type { ScrabbleGame, PlayerRow, PlayRow } from '../hooks/useGame'
import { Board, type Cursor, type Tentative } from './Board'
import { Rack } from './Rack'
import { Controls } from './Controls'
import { BlankPicker } from './BlankPicker'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** A tile staged on the board this turn, tied to its rack slot. */
type Staged = Placement & { rackIdx: number }
type XY = { x: number; y: number }
type DragSource = { kind: 'rack'; rackIdx: number } | { kind: 'board'; x: number; y: number }
/** The player's own-move result, shown as a sticky pill in the commit slot. The
 *  turn machine reports these UP via `showLocalFeedback`; PlayArea owns the channel (it
 *  also folds the terminal verdict in), because InfoCol's End/Concede write to it too. */
export type LocalFeedbackMsg = { tone: GenericFeedbackTone; text: string }

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
 * gameId + the feedback channel + the history-view inputs, and renders it beside the
 * InfoCol. See docs/playarea-decomposition-plan.md.
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
export function BoardCol({
  game,
  gameId,
  self,
  myTurn,
  isTerminal,
  myConceded,
  showLocalFeedback,
  clearLocalFeedback,
  localPill,
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
}: {
  // ── Game data (the turn machine reads board/version/rack/bag off this) ──
  game: ScrabbleGame
  gameId: string
  /** My player row (rack in compete; null in coop where the rack is shared). undefined = I'm watching. */
  self: PlayerRow | undefined
  /** Is it my turn (compete); always true in coop. Gates committing (canCommit). */
  myTurn: boolean
  isTerminal: boolean
  myConceded: boolean

  // ── Below-board feedback (channel owned by PlayArea — see LocalFeedbackMsg) ──
  /** Report an own-move result (played / rejected / no-tile / …). */
  showLocalFeedback: (m: LocalFeedbackMsg) => void
  /** Clear the sticky own-move pill (a board/rack interaction or a keystroke dismisses it). */
  clearLocalFeedback: () => void
  /** The pill to render in the commit slot (terminal verdict or own-move result), or null. */
  localPill: GenericFeedbackMsg | null

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
  /** Identity-disc color for a user id — for the share banner's disc. */
  memberColorOf: (id: string) => string

  // ── Show-a-move (coop only — see useSharedMove) ──
  /** Coop with ≥2 players — gates the Share button (there's a teammate to show). */
  canShare: boolean
  /** Broadcast my staged tiles to teammates for a read-only preview. */
  shareMove: (payload: SharedMovePayload) => void
  /** My user id — stamped on a broadcast as its `sharerId`. */
  selfId: string
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
  // Brief outlines (all self-clearing after ~1s via useFlash): green on the
  // cells just played, yellow on the rack slots just drawn (from a play or an
  // exchange), red on the new cells of a rejected (not-in-dictionary) word.
  const [greenFlash, flashGreen] = useFlash<number>()
  const [yellowFlash, flashYellow] = useFlash<number>()
  const [redFlash, flashRed] = useFlash<number>()

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
        showLocalFeedback({ tone: 'warning', text: 'Pre-play cleared: conflict' })
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
  }, [game.version, game.board, rackLen, isCompete, showLocalFeedback, flashYellow, onExitViewing])

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
      clearLocalFeedback() // a board interaction dismisses the sticky own-move pill
      const tent = stagedAt(x, y) // only staged tiles are draggable; committed are locked
      start({ kind: 'board', x, y }, tent ? tent.letter : null, { x, y }, e)
    },
    // onExitViewing + viewTargetRef are stable (from useHistoryViewer), so listing
    // them keeps this handler's single-registration without churn.
    [stagedAt, start, clearLocalFeedback, onExitViewing, viewTargetRef],
  )

  const onRackPointerDown = useCallback(
    (rackIdx: number, glyph: string, e: React.PointerEvent) => {
      if (!canPlaceRef.current) return
      clearLocalFeedback() // a rack interaction dismisses the sticky own-move pill
      start({ kind: 'rack', rackIdx }, glyph, null, e)
    },
    [start, clearLocalFeedback],
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
        showLocalFeedback({ tone: 'info', text: `No “${letter}” tile` })
        return
      }
      setStaged((prev) => [...prev.filter((s) => !(s.x === tx && s.y === ty)), { x: tx, y: ty, letter, blank, rackIdx }])
      const nxt = nextEmpty(tx, ty, cursor.dir)
      setCursor(nxt ? { x: nxt.x, y: nxt.y, dir: cursor.dir } : { x: tx, y: ty, dir: cursor.dir })
    },
    [cursor, staged, actingRack, committedAt, nextEmpty, showLocalFeedback],
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
    // An illegal shape never reaches the server; surface the reason as an own-move
    // error pill in the commit slot and stop here.
    if (!ev.valid) {
      showLocalFeedback({ tone: 'error', text: ev.error })
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
    const { data, error } = await db.rpc('play_word', {
      target_game: gameId,
      base_version: game.version,
      placements: placements as unknown as never,
      words: ev.words.map((w) => w.word),
      score: ev.score,
    })
    setSubmitting(false)
    if (error) {
      lastActionRef.current = prevAction // the move didn't land — un-claim it
      pendingDrawRef.current = prevDraw
      showLocalFeedback({ tone: 'error', text: error.message })
      return
    }
    const res = data as { result: string; bad_words?: string[]; drawn?: string[] }
    if (res.result === 'accepted') {
      // Hold the played tiles on the board (as committed) until the realtime
      // refetch lands, so they don't blink out; green-flash them. The new rack
      // tiles get the yellow flash once the rack arrives.
      setOptimistic(placements)
      flashGreen(placements.map((p) => cellIndex(p.x, p.y)))
      pendingDrawRef.current = res.drawn?.length ?? 0 // exact draw count now known
      setStaged([])
      setSelected(new Set())
      const words = ev.words.map((w) => w.word).join(' · ')
      showLocalFeedback({ tone: 'success', text: `${words} +${ev.score}${ev.bingo ? ' 🎉' : ''}` })
    } else if (res.result === 'stale') {
      lastActionRef.current = prevAction // no commit — un-claim
      pendingDrawRef.current = prevDraw
      showLocalFeedback({ tone: 'info', text: 'Board changed' })
    } else if (res.result === 'invalid') {
      lastActionRef.current = prevAction // no commit — un-claim
      pendingDrawRef.current = prevDraw
      showLocalFeedback({ tone: 'error', text: `No: ${(res.bad_words ?? []).join(', ').toUpperCase()}` })
      // Red-flash the NEW cells in each rejected word (match the server's
      // bad_words back to the words evaluatePlay read off the board).
      const bad = new Set((res.bad_words ?? []).map((w) => w.toUpperCase()))
      const cells = new Set<number>()
      for (const w of ev.words) {
        if (!bad.has(w.word.toUpperCase())) continue
        for (const c of w.cells) if (c.isNew) cells.add(cellIndex(c.x, c.y))
      }
      flashRed(cells)
    }
  }, [game.version, board, staged, actingRack, gameId, showLocalFeedback, flashGreen, flashRed])

  const exchange = useCallback(async () => {
    const tiles = [...selected].map((i) => actingRack[i])
    setSubmitting(true)
    // Claim before the await — same realtime-beats-RPC race as play_word.
    const prevAction = lastActionRef.current
    const prevDraw = pendingDrawRef.current
    lastActionRef.current = { removed: new Set(selected), oldLen: actingRack.length }
    pendingDrawRef.current = tiles.length // optimistic; corrected on success
    const { data, error } = await db.rpc('exchange_tiles', { target_game: gameId, base_version: game.version, rack_tiles: tiles })
    setSubmitting(false)
    if (error) {
      lastActionRef.current = prevAction
      pendingDrawRef.current = prevDraw
      showLocalFeedback({ tone: 'error', text: error.message })
      return
    }
    const res = data as { result: string; drawn?: string[] }
    if (res.result === 'stale') {
      lastActionRef.current = prevAction // no commit — un-claim
      pendingDrawRef.current = prevDraw
      showLocalFeedback({ tone: 'info', text: 'Board changed' })
    } else {
      setSelected(new Set())
      pendingDrawRef.current = res.drawn?.length ?? tiles.length
      showLocalFeedback({ tone: 'success', text: `Swapped ${tiles.length}` })
    }
  }, [game.version, selected, actingRack, gameId, showLocalFeedback])

  const pass = useCallback(async () => {
    // Confirm — passing forfeits the turn (a scoreless turn toward the blocked-end
    // counter), and the button is easy to misclick. Exchange needs no confirm: it's
    // disabled until tiles are selected, so it's rarely hit by accident.
    if (!window.confirm('Do you really want to pass your turn?')) return
    const { error } = await db.rpc('pass_turn', { target_game: gameId, base_version: game.version })
    if (error) showLocalFeedback({ tone: 'error', text: error.message })
  }, [game.version, gameId, showLocalFeedback])

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

  // Board-cursor keyboard — the shared 2-D placement engine (bananagrams's twin;
  // it owns the modifier bail, focused-input guard, arrows→cursor, Backspace/Enter
  // dispatch, and the skip-Enter-when-a-button-is-focused). scrabble supplies its
  // 5%: type stages a tile, Enter plays the staged word, and the first keystroke
  // exits a turn-viewer.
  useBoardCursorKeys({
    enabled: canPlace,
    onAnyKey: () => {
      // While viewing a past turn, ANY key exits to the live board (navigation is
      // by clicking Moves-log rows) — consume this key. (onAnyKey carries no event,
      // so this uses `viewing`/`onExitViewing` rather than the hook's `exitOnKey`.)
      if (viewing) {
        onExitViewing()
        return true
      }
      // Otherwise any key dismisses the sticky local feedback (no-op at terminal).
      clearLocalFeedback()
    },
    onArrow: (k) => setCursor((cur) => moveCursor(cur, k, BOARD_SIZE - 1)),
    onLetter: (letter) => typeLetter(letter),
    onBackspace: backspace,
    onEnter: () => {
      if (staged.length > 0 && canCommit) void submit()
    },
  })

  // The Submit button's live score preview: the play's score when tiles are staged
  // (0 for a not-yet-legal arrangement), or null (an em-dash) on an empty board.
  const submitScore = staged.length > 0 ? (preview?.valid ? preview.score : 0) : null
  // Submittable only on your turn (compete) — a pre-played move shows its score
  // (a disabled Submit displaying "+N") and enables the moment your turn starts.
  const canSubmit = staged.length > 0 && canCommit

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
          distinctly from a history replay (theme.css → --color-share-preview). */}
      <div className={cls(shared.boardCol, styles.boardCol, viewShared && history.sharePreview)}>
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
                    <span style={{ color: memberColorOf(viewShared.sharerId) }} aria-hidden>
                      ●
                    </span>{' '}
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
                    rack, not in the commit row. */}
                <ShuffleButton onShuffle={shuffle} label="Shuffle rack" className={styles.rackShuffle} />
              </div>
              <Controls
                isCompete={isCompete}
                canCommit={canCommit}
                hasTentative={staged.length > 0}
                selectedCount={selected.size}
                canExchange={game.bagCount >= 7}
                submitting={submitting}
                submitScore={submitScore}
                canSubmit={canSubmit}
                canShare={canShare}
                onShare={shareCurrentMove}
                pill={localPill}
                onSubmit={() => void submit()}
                onRecall={recallAll}
                onExchange={() => void exchange()}
                onPass={() => void pass()}
              />
            </div>
          ) : (
            <p className="muted">Watching — you're not in this game.</p>
          )}
        </div>
      </div>

      {blankAt && <BlankPicker onPick={pickBlank} onCancel={() => setBlankAt(null)} />}

      {drag && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }}>
          {drag.letter === BLANK ? '' : drag.letter}
        </div>
      )}
    </>
  )
}
