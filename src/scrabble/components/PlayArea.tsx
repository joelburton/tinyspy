import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { playerOutcome } from '../../common/lib/games'
import { useFlash } from '../../common/hooks/useFlash'
import { timerLabel } from '../../common/lib/timerLabel'
import type { GenericFeedbackMsg, GenericFeedbackTone, GamePageCtx, Member } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import { TerminalModal } from '../../common/components/TerminalModal'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useBoardCursorKeys } from '../../common/hooks/useBoardCursorKeys'
import { useDragGesture, type DragGesture } from '../../common/hooks/useDragGesture'
import { moveCursor, stepBack } from '../../common/lib/gridCursor'
import { db } from '../db'
import { BLANK, BOARD_SIZE, cellIndex, inBounds } from '../lib/board'
import { boardUpToSeq, evaluatePlay, type Placement } from '../lib/play'
import type { ScrabbleSetup } from '../lib/setup'
import { useGame, type PlayRow } from '../hooks/useGame'
import { Board, type Cursor, type Tentative } from './Board'
import { Rack } from './Rack'
import { Controls } from './Controls'
import { BlankPicker } from './BlankPicker'
import { PlayLog } from './PlayLog'
import { SetupDisclosure } from '../../common/components/SetupDisclosure'
import shared from '../../common/components/PlayArea.module.css'
import history from '../../common/components/historyViewer.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/** A tile staged on the board this turn, tied to its rack slot. */
type Staged = Placement & { rackIdx: number }
type XY = { x: number; y: number }
type DragSource = { kind: 'rack'; rackIdx: number } | { kind: 'board'; x: number; y: number }
/** The player's own-move result, shown as a sticky pill in the commit slot. */
type LocalFeedbackMsg = { tone: GenericFeedbackTone; text: string }

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
 * scrabble's play surface (coop + compete), on the shared two-column scaffold.
 *
 *   - **Board column** — the 15×15 board (sized like waffle/boggle: the largest
 *     square that fits), and below it scrabble's **GameEntryArea**: the rack +
 *     the action row. The rack IS the input here, so it lives in the board column
 *     with everything else needed to play. The action row is split by a divider
 *     into the non-committing actions (Shuffle, Recall) and the **commit slot**
 *     ([Swap] [Submit] [Pass]) — which doubles as the **local feedback area**: an
 *     own-move result (or the terminal verdict) shows as a sticky `<GenericFeedbackPill>`
 *     in place of the commit buttons, dismissed by the player's next move (a tile
 *     tap / a keystroke). The Submit button doubles as the live score PREVIEW —
 *     its label is the staged play + score ("ARROW +23").
 *   - **Info column** — the live turn/score state, the compete OpponentStrip, the
 *     End/Concede action row (the terminal outcome line at game-over), a help
 *     line, the setup disclosure, and the Moves log filling the rest.
 *
 * Placement mirrors bananagrams exactly, two ways:
 *   - DRAG a tile from the rack to a square (or move/return a staged tile by
 *     dragging it). A blank prompts for its letter on drop.
 *   - KEYBOARD: a cursor sits on the board (tap a square to move it); arrow keys
 *     move it (a perpendicular arrow rotates →/↓ first), letters place a matching
 *     rack tile (or a blank declared as the typed letter) and advance, Backspace
 *     removes + steps back, Enter plays the word.
 * A plain tap on a rack tile toggles it for Exchange.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (geometry + scoring —
 * also shown live as the Submit-button preview) and sends words + score to
 * `scrabble.play_word`, which trusts them and checks only the dictionary. Staged
 * tiles clear whenever the server version moves.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  status,
  setup,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, plays, loading } = useGame(gameId)

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

  // The player's own-move result — a sticky pill in the commit slot (the local
  // feedback area). v3: own-move feedback is LOCAL (docs/design-decisions.md →
  // Feedback), not the global header `ctx.globalFeedback`. Kept terse — the slot is
  // narrow (it sits where [Swap][Submit][Pass] go). Dismissed by the player's
  // next move (clearLocalFeedback, below), not a timer.
  // The shared hook owns the state + cleanup; this thin builder keeps scrabble's
  // terse `{ tone, text }` call sites over it (own-move results are outline +
  // sticky — the next move dismisses them via `clearLocalFeedback`).
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  const showLocalFeedback = useCallback(
    (m: LocalFeedbackMsg) => showMsg({ ...m, variant: 'outline', dismiss: { kind: 'sticky' } }),
    [showMsg],
  )

  // Turn viewer: the play `seq` whose historical board is being inspected, or null
  // (live). Local + view-only — never shared/persisted, doesn't pause; the live
  // `staged` is untouched (it re-renders on exit). See exitViewing below.
  const [viewingSeq, setViewingSeq] = useState<number | null>(null)
  const exitViewing = useCallback(() => setViewingSeq(null), [])

  // ─── Derived (null-safe until the loading guard) ──────────────
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const mode = game?.mode
  const isCompete = mode === 'compete'
  const sharedRack = game?.sharedRack
  const myRack = self?.rack
  const actingRack = useMemo(
    () => (mode === 'coop' ? (sharedRack ?? []) : (myRack ?? [])),
    [mode, sharedRack, myRack],
  )
  // Concede lives on the common roster (ctx.players → `members`). A conceder is
  // out of the turn order (the server skips them), so they can't place or commit.
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))
  const myTurn = !isCompete || game?.currentUserId === session.user.id
  // Two gates. `canPlace` — may stage / recall / reorder tiles: in COMPETE this is
  // allowed even when it ISN'T your turn ("pre-play": line a move up while waiting,
  // and see its score). `canCommit` — may actually commit a turn-consuming move
  // (Submit / Swap / Pass), which requires it to be your turn. In coop there are no
  // turns (myTurn is always true), so the two coincide.
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
    const base = game?.board ?? []
    if (optimistic.length === 0) return base
    const b = [...base]
    for (const p of optimistic) b[cellIndex(p.x, p.y)] = { l: p.letter, b: p.blank }
    return b
  }, [game?.board, optimistic])

  // Live preview: geometry + score of the staged tiles (dictionary is only
  // checked on submit — see docs §6). Drives the Submit-button label.
  const preview = useMemo(
    () => (staged.length > 0 ? evaluatePlay(board, staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))) : null),
    [board, staged],
  )

  const nameOf = useCallback(
    (userId: string | null) => members.find((m: Member) => m.user_id === userId)?.username ?? 'someone',
    [members],
  )

  // Refs the always-on pointer handlers read, so they can stay stable
  // (registered once) instead of re-binding on every state change.
  const boardRef = useRef(board)
  const stagedRef = useRef(staged)
  const actingRackRef = useRef(actingRack)
  const canPlaceRef = useRef(canPlace)
  const orderRef = useRef(order)
  const viewingSeqRef = useRef(viewingSeq)
  useEffect(() => {
    boardRef.current = board
    stagedRef.current = staged
    actingRackRef.current = actingRack
    canPlaceRef.current = canPlace
    orderRef.current = order
    viewingSeqRef.current = viewingSeq
  }, [board, staged, actingRack, canPlace, order, viewingSeq])

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
    if (!game) return
    if (prevVersion.current === game.version) return
    prevVersion.current = game.version
    setSelected(new Set())
    setViewingSeq(null) // a new move landed — drop back to the live board
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
        // Terse on purpose — the commit slot is narrow (a name + disc would
        // overflow with a longer username).
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
  }, [game, game?.version, rackLen, isCompete, showLocalFeedback, flashYellow])

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
      // While viewing a past turn the board is read-only; a click exits to live
      // (interacting ends the peek) rather than placing a tile.
      if (viewingSeqRef.current != null) {
        setViewingSeq(null)
        return
      }
      if (!canPlaceRef.current) return
      clearLocalFeedback() // a board interaction dismisses the sticky own-move pill
      const tent = stagedAt(x, y) // only staged tiles are draggable; committed are locked
      start({ kind: 'board', x, y }, tent ? tent.letter : null, { x, y }, e)
    },
    [stagedAt, start, clearLocalFeedback],
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
    if (!game) return
    const placements: Placement[] = staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))
    const ev = evaluatePlay(board, placements)
    // Submit is allowed for any placed tiles (it doesn't gate on legal geometry —
    // see the label note). An illegal shape never reaches the server; surface the
    // reason as an own-move error pill in the commit slot and stop here.
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
  }, [game, board, staged, actingRack, gameId, showLocalFeedback, flashGreen, flashRed])

  const exchange = useCallback(async () => {
    if (!game) return
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
  }, [game, selected, actingRack, gameId, showLocalFeedback])

  const pass = useCallback(async () => {
    if (!game) return
    // Confirm — passing forfeits the turn (a scoreless turn toward the blocked-end
    // counter), and the button is easy to misclick. Exchange needs no confirm: it's
    // disabled until tiles are selected, so it's rarely hit by accident.
    if (!window.confirm('Do you really want to pass your turn?')) return
    const { error } = await db.rpc('pass_turn', { target_game: gameId, base_version: game.version })
    if (error) showLocalFeedback({ tone: 'error', text: error.message })
  }, [game, gameId, showLocalFeedback])

  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `End game failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  // Concede (compete) — drop out of the race. Turn-based, so the server hands
  // off the turn / ends the game (scrabble.concede); the conceder forfeits any
  // win. Distinct from End, which is coop's neutral mutual stop.
  const handleConcede = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `Concede failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  // Board-cursor keyboard — the shared 2-D placement engine (bananagrams's twin;
  // it owns the modifier bail, focused-input guard, arrows→cursor, Backspace/Enter
  // dispatch, and the skip-Enter-when-a-button-is-focused). scrabble supplies its
  // 5%: type stages a tile (committed tiles are locked, unlike bananagrams), Enter
  // plays the staged word, and the first keystroke exits a turn-viewer.
  useBoardCursorKeys({
    enabled: !!game && canPlace,
    onAnyKey: () => {
      // While viewing a past turn, ANY key exits to the live board (navigation is
      // by clicking Moves-log rows) — consume this key.
      if (viewingSeq != null) {
        setViewingSeq(null)
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

  if (loading) return <p className={styles.loading}>Loading game…</p>
  if (!game) return <p className={styles.loading}>Game not found.</p>

  const scrabbleSetup = setup as unknown as ScrabbleSetup
  const over = isTerminal ? buildOver({ game, playState, status, selfId: session.user.id, nameOf }) : null
  // The player whose turn it is (compete) — for the "Turn: ● name" state line.
  const currentMember = members.find((m: Member) => m.user_id === game.currentUserId)

  // The Submit button's live score preview: the play's score when tiles are
  // staged (0 for a not-yet-legal arrangement), or null (an em-dash) on an empty
  // board. Submitting is allowed for any placed tiles; an illegal shape is
  // explained by an error pill on submit, not by disabling the button.
  const submitScore = staged.length > 0 ? (preview?.valid ? preview.score : 0) : null
  // Submittable only on your turn (compete) — so a pre-played move shows its score
  // (a disabled Submit displaying "+N") and becomes enabled the moment your turn
  // starts with tiles already staged.
  const canSubmit = staged.length > 0 && canCommit

  // The commit-slot pill: the terminal verdict (permanent fill) takes precedence,
  // else the sticky own-move result (transient outline), else nothing (the commit
  // buttons show).
  const localFeedbackMsg: GenericFeedbackMsg | null = over
    ? {
        tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
        text: over.message,
        variant: 'fill',
        dismiss: { kind: 'sticky' },
      }
    : localFeedback

  // Turn viewer: when active, the board renders the replayed historical state with
  // that turn's tiles outlined; the live overlays (staged/cursor/flashes) are off.
  const viewing = viewingSeq != null
  const viewedPlay: PlayRow | null = viewing ? (plays.find((p) => p.seq === viewingSeq) ?? null) : null
  const renderBoard = viewing ? boardUpToSeq(plays, viewingSeq) : board
  const viewingCells =
    viewing && viewedPlay?.kind === 'word'
      ? new Set((viewedPlay.placements ?? []).map((pl) => cellIndex(pl.x, pl.y)))
      : NO_CELLS

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={cls(shared.boardCol, styles.boardCol)}>
        <Board
          board={renderBoard}
          tentative={viewing ? NO_TENT : tentativeMap}
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
          {/* Turn-viewer banner — overlays the input area (the rack stays mounted
              underneath, so `staged` is preserved). Click anywhere to exit; the ✕
              at the far right also exits. Navigation is by clicking Moves-log rows. */}
          {viewing && viewedPlay && (
            <div className={history.banner} onClick={exitViewing} title="Click to exit">
              <span className={history.bannerLabel}>{turnSummary(viewedPlay, nameOf)}</span>
              <button
                type="button"
                className={history.bannerExit}
                onClick={(e) => {
                  e.stopPropagation()
                  exitViewing()
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
                pill={localFeedbackMsg}
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

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
              state → opponent strip → action row → help → setup disclosure → log. */}

          {/* State — whose turn (compete) / team score (coop) + the bag count.
              The other player's turn reads "Turn: ● name" (a leading color disc +
              the bare name) — never the possessive "name's turn" (we don't
              apostrophize usernames). */}
          <p className={shared.infoState}>
            {isCompete ? (
              myTurn ? (
                <strong>Your turn</strong>
              ) : (
                <>
                  Turn:{' '}
                  <span style={{ color: colorVarFor(currentMember?.color) }} aria-hidden>
                    ●
                  </span>{' '}
                  {currentMember?.username ?? 'someone'}
                </>
              )
            ) : (
              <>Team score: <strong>{game.teamScore ?? 0}</strong></>
            )}{' · '}
            {game.bagCount} in bag
          </p>

          {/* Opponent strip (compete) — each peer's score, identity on a leading
              disc. Scores aren't hidden (the board reveals them). */}
          {isCompete && (
            <OpponentStrip
              players={members}
              selfId={session.user.id}
              metricLabel="Score"
              metricFor={(player) => {
                const ps = playerStates.find((p) => p.user_id === player.user_id)
                const score = ps?.score ?? 0
                // Mid-game a conceder reads as "out"; at terminal the score line
                // is prefixed with the outcome verb (Quit / Lost / Won). The strip
                // types `player` as Member, so read the concede/result bits back
                // off the GamePlayer roster (`members`).
                if (!isTerminal) return concededIds.has(player.user_id) ? 'out' : score
                const gpm = members.find((m) => m.user_id === player.user_id)
                const outcome = gpm ? playerOutcome(gpm) : 'lost'
                const verb = outcome === 'won' ? 'Won' : outcome === 'quit' ? 'Quit' : 'Lost'
                return `${verb} · ${score}`
              }}
            />
          )}

          {/* Action row — End (coop) / Concede (compete) during play; the
              "You conceded" terminal look once I've dropped out (others race on);
              at terminal the bold outcome line + a compact back-to-club button. */}
          {over ? (
            <TerminalActionRow over={over} onBackToClub={goToClub} />
          ) : isCompete && myConceded ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>You conceded</span>
              <ConcedeGameButton className={shared.helperButton} disabled />
            </div>
          ) : (
            <div className={shared.infoActions}>
              {isCompete ? (
                <ConcedeGameButton className={shared.helperButton} onClick={() => void handleConcede()} />
              ) : (
                <EndGameButton className={shared.helperButton} onClick={() => void handleEndGame()} />
              )}
            </div>
          )}

          {/* Help — only while the player can act on it (never silently swapped). */}
          {!over && (
            <p className={shared.infoHelp}>
              Drag tiles onto the board, or tap a square and type. Arrows move the cursor (a sideways
              arrow turns it ↓). Enter plays.
            </p>
          )}

          {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
          <SetupDisclosure>
              <li>2-letter words: {DIFFICULTY_LABELS[scrabbleSetup.dict_2 - 1] ?? '—'}</li>
              <li>Longer words: {DIFFICULTY_LABELS[scrabbleSetup.dict_3plus - 1] ?? '—'}</li>
              <li>{timerLabel(scrabbleSetup.timer)}</li>
            </SetupDisclosure>
        </div>

        <PlayLog plays={plays} players={members} viewingSeq={viewingSeq} onSelectTurn={setViewingSeq} />
      </div>

      {blankAt && <BlankPicker onPick={pickBlank} onCancel={() => setBlankAt(null)} />}

      {drag && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }}>
          {drag.letter === BLANK ? '' : drag.letter}
        </div>
      )}

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Terminal copy, mode- and self-aware. Returns `{ outcome, verdict, message,
 * tone }`: `outcome` + `verdict` drive the GameOverModal; `message` (terse) +
 * `tone` drive BOTH the info-column outcome line AND the permanent below-board
 * pill (so the narrow commit slot stays one line).
 */
function buildOver({
  game,
  playState,
  status,
  selfId,
  nameOf,
}: {
  game: { mode: 'coop' | 'compete'; teamScore: number | null }
  playState: string
  status: Record<string, unknown> | null
  selfId: string
  nameOf: (id: string | null) => string
}): { outcome: 'won' | 'lost'; verdict: string; message: string; tone: 'won' | 'lost' | 'neutral' } {
  const outcome = (status?.outcome as string | undefined) ?? ''
  if (game.mode === 'coop') {
    const score = game.teamScore ?? 0
    if (outcome === 'manual') return { outcome: 'won', verdict: `Game ended — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    if (outcome === 'timeout') return { outcome: 'won', verdict: `Time's up — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    return { outcome: 'won', verdict: `Board cleared — ${score} points! 🎉`, message: `${score} pts`, tone: 'won' }
  }
  if (playState === 'ended') return { outcome: 'won', verdict: 'Game ended — no winner.', message: 'Ended', tone: 'neutral' }
  const winner = status?.winner as string | null | undefined
  if (winner === selfId) return { outcome: 'won', verdict: 'You won the game! 🎉', message: 'You won!', tone: 'won' }
  if (winner) return { outcome: 'lost', verdict: `${nameOf(winner)} won.`, message: `${nameOf(winner)} won`, tone: 'lost' }
  return { outcome: 'won', verdict: "It's a tie — co-winners!", message: 'Tie', tone: 'neutral' }
}
