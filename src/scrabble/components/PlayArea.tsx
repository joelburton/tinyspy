import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GamePageCtx, Member } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { useDragGesture, type DragGesture } from '../../common/hooks/useDragGesture'
import { moveCursor, stepBack } from '../../common/lib/gridCursor'
import { db } from '../db'
import { BLANK, BOARD_SIZE, cellIndex, inBounds } from '../lib/board'
import { evaluatePlay, type Placement } from '../lib/play'
import { useGame } from '../hooks/useGame'
import { Board, type Cursor, type Tentative } from './Board'
import { Rack } from './Rack'
import { Controls } from './Controls'
import { BlankPicker } from './BlankPicker'
import { PlayLog } from './PlayLog'
import styles from './PlayArea.module.css'
import '../theme.css'

/** A tile staged on the board this turn, tied to its rack slot. */
type Staged = Placement & { rackIdx: number }
type XY = { x: number; y: number }
type DragSource = { kind: 'rack'; rackIdx: number } | { kind: 'board'; x: number; y: number }

/** The board cell under a screen point (via data-cell), or null. */
function cellAtPoint(x: number, y: number): XY | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
  if (!el) return null
  return { x: Number(el.dataset.x), y: Number(el.dataset.y) }
}
function overRackAtPoint(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-zone="rack"]')
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
 * scrabble's play surface (coop + compete). Left: the board, sized to grow
 * as tall as the layout allows. Right (fixed column): score / whose-turn, the
 * rack, a live score preview, the action row, and the move log.
 *
 * Placement mirrors bananagrams exactly, two ways:
 *   - DRAG a tile from the rack to a square (or move/return a staged tile by
 *     dragging it). A blank prompts for its letter on drop.
 *   - KEYBOARD: a cursor sits on the board (tap a square to move it); arrow
 *     keys move it (a perpendicular arrow rotates →/↓ first), letters place a
 *     matching rack tile (or a blank declared as the typed letter) and advance,
 *     Backspace removes + steps back, Enter plays the word.
 * A plain tap on a rack tile toggles it for Exchange.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (geometry +
 * scoring — also shown live as the preview) and sends words + score to
 * `scrabble.play_word`, which trusts them and checks only the dictionary on
 * submit. Staged tiles clear whenever the server version moves.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  status,
  feedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const { game, players: playerStates, plays, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  const [staged, setStaged] = useState<Staged[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set()) // exchange selection
  const [order, setOrder] = useState<number[]>([])
  const [blankAt, setBlankAt] = useState<{ x: number; y: number; rackIdx: number } | null>(null)
  const [cursor, setCursor] = useState<Cursor>({ x: 7, y: 7, dir: 'h' })
  const [submitting, setSubmitting] = useState(false)
  // Just-played tiles, rendered as committed until the realtime refetch brings
  // them in for real — so an accepted word never blinks off the board.
  const [optimistic, setOptimistic] = useState<Placement[]>([])
  // Brief outlines: green on the cells just played, yellow on the rack slots
  // just drawn (from a play or an exchange). Both clear after ~1s.
  const [greenFlash, setGreenFlash] = useState<Set<number>>(new Set())
  const [yellowFlash, setYellowFlash] = useState<Set<number>>(new Set())
  // Red on the new cells of a rejected (not-in-dictionary) word.
  const [redFlash, setRedFlash] = useState<Set<number>>(new Set())

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
  const myTurn = !isCompete || game?.currentUserId === session.user.id
  const canAct = !!self && !isTerminal && !submitting && myTurn

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
  // checked on submit — see docs §6).
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
  const canActRef = useRef(canAct)
  const orderRef = useRef(order)
  useEffect(() => {
    boardRef.current = board
    stagedRef.current = staged
    actingRackRef.current = actingRack
    canActRef.current = canAct
    orderRef.current = order
  }, [board, staged, actingRack, canAct, order])

  // A shown "not in the dictionary" pill is closeable (no auto-timer); we
  // also clear it the moment the staged tiles change (see the effect below).
  const dictErrorRef = useRef(false)
  // How many tiles the last play/exchange drew — turned into a yellow rack
  // flash once the new rack arrives (the drawn tiles are the rack's last N).
  const pendingDrawRef = useRef(0)
  // Which OLD rack slots left on the last play/exchange (+ the old rack length),
  // so the next order keeps the remaining tiles put and adds the new ones right.
  const lastActionRef = useRef<{ removed: Set<number>; oldLen: number } | null>(null)

  // Reset staged + selection + cursor on any server version move.
  const prevVersion = useRef<number | null>(null)
  const rackLen = actingRack.length
  useEffect(() => {
    if (!game) return
    if (prevVersion.current !== game.version) {
      prevVersion.current = game.version
      setStaged([])
      setSelected(new Set())
      // Leave the cursor where it is — the next word is usually nearby, so
      // snapping back to center each turn would just be in the way. (Its
      // initial center comes from useState on load.)
      // Keep remaining tiles put (compacted left); new tiles land on the right.
      setOrder(nextRackOrder(orderRef.current, lastActionRef.current, rackLen))
      lastActionRef.current = null
      setOptimistic([]) // the server board now holds the played tiles
      // Flash the freshly-drawn tiles — the rack's last N slots (the SQL
      // appends drawn tiles to the end).
      if (pendingDrawRef.current > 0 && rackLen > 0) {
        const n = Math.min(pendingDrawRef.current, rackLen)
        setYellowFlash(new Set(Array.from({ length: n }, (_, i) => rackLen - n + i)))
      }
      pendingDrawRef.current = 0
    }
  }, [game, game?.version, rackLen])

  // Flash timers — each outline clears itself after ~1s.
  useEffect(() => {
    if (greenFlash.size === 0) return
    const id = setTimeout(() => setGreenFlash(new Set()), 1000)
    return () => clearTimeout(id)
  }, [greenFlash])
  useEffect(() => {
    if (yellowFlash.size === 0) return
    const id = setTimeout(() => setYellowFlash(new Set()), 1000)
    return () => clearTimeout(id)
  }, [yellowFlash])
  useEffect(() => {
    if (redFlash.size === 0) return
    const id = setTimeout(() => setRedFlash(new Set()), 1000)
    return () => clearTimeout(id)
  }, [redFlash])

  // Dismiss a lingering "not in the dictionary" pill as soon as the player
  // adds / moves / removes a tile (staged changes). The pill itself stays up
  // until then (or until they click its X) — it's a result to read, not a
  // flash. No-ops unless such a pill is currently showing.
  useEffect(() => {
    if (dictErrorRef.current) {
      feedback.clear()
      setRedFlash(new Set()) // the offending tiles are moving — drop the red outline
      dictErrorRef.current = false
    }
  }, [staged, feedback])

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
      if (!canActRef.current) return
      const tent = stagedAt(x, y) // only staged tiles are draggable; committed are locked
      start({ kind: 'board', x, y }, tent ? tent.letter : null, { x, y }, e)
    },
    [stagedAt, start],
  )

  const onRackPointerDown = useCallback(
    (rackIdx: number, glyph: string, e: React.PointerEvent) => {
      if (!canActRef.current) return
      start({ kind: 'rack', rackIdx }, glyph, null, e)
    },
    [start],
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
        feedback.show({ tone: 'info', text: `No “${letter}” (or blank) on your rack`, dismiss: { kind: 'timed', ms: 1200 } })
        return
      }
      setStaged((prev) => [...prev.filter((s) => !(s.x === tx && s.y === ty)), { x: tx, y: ty, letter, blank, rackIdx }])
      const nxt = nextEmpty(tx, ty, cursor.dir)
      setCursor(nxt ? { x: nxt.x, y: nxt.y, dir: cursor.dir } : { x: tx, y: ty, dir: cursor.dir })
    },
    [cursor, staged, actingRack, committedAt, nextEmpty, feedback],
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
    dictErrorRef.current = false // a new attempt: stop tracking any prior dict-error pill
    const placements: Placement[] = staged.map(({ x, y, letter, blank }) => ({ x, y, letter, blank }))
    const ev = evaluatePlay(board, placements)
    if (!ev.valid) {
      feedback.show({ tone: 'error', text: ev.error, dismiss: { kind: 'timed', ms: 2000 } })
      return
    }
    setSubmitting(true)
    const { data, error } = await db.rpc('play_word', {
      target_game: gameId,
      base_version: game.version,
      placements: placements as unknown as never,
      words: ev.words.map((w) => w.word),
      score: ev.score,
    })
    setSubmitting(false)
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 2000 } })
      return
    }
    const res = data as { result: string; bad_words?: string[]; drawn?: string[] }
    if (res.result === 'accepted') {
      // Hold the played tiles on the board (as committed) until the realtime
      // refetch lands, so they don't blink out; green-flash them. The new
      // rack tiles get the yellow flash once the rack arrives.
      setOptimistic(placements)
      setGreenFlash(new Set(placements.map((p) => cellIndex(p.x, p.y))))
      pendingDrawRef.current = res.drawn?.length ?? 0
      lastActionRef.current = { removed: new Set(staged.map((s) => s.rackIdx)), oldLen: actingRack.length }
      setStaged([])
      setSelected(new Set())
      feedback.show({
        tone: 'success',
        text: `${ev.words.map((w) => w.word).join(' · ')} — +${ev.score}${ev.bingo ? ' · BINGO! +50' : ''}`,
        dismiss: { kind: 'timed', ms: 2500 },
      })
    } else if (res.result === 'stale') {
      feedback.show({ tone: 'info', text: 'The board changed — your tiles came back. Take another look.', dismiss: { kind: 'timed', ms: 2500 } })
    } else if (res.result === 'invalid') {
      // Persistent: stays until the player clicks its X or changes the board.
      feedback.show({ tone: 'error', text: `Not in the dictionary: ${(res.bad_words ?? []).join(', ')}`, dismiss: { kind: 'closeable' } })
      dictErrorRef.current = true
      // Red-flash the NEW cells in each rejected word (match the server's
      // bad_words back to the words evaluatePlay read off the board).
      const bad = new Set((res.bad_words ?? []).map((w) => w.toUpperCase()))
      const cells = new Set<number>()
      for (const w of ev.words) {
        if (!bad.has(w.word.toUpperCase())) continue
        for (const c of w.cells) if (c.isNew) cells.add(cellIndex(c.x, c.y))
      }
      setRedFlash(cells)
    }
  }, [game, board, staged, actingRack, gameId, feedback])

  const exchange = useCallback(async () => {
    if (!game) return
    const tiles = [...selected].map((i) => actingRack[i])
    setSubmitting(true)
    const { data, error } = await db.rpc('exchange_tiles', { target_game: gameId, base_version: game.version, rack_tiles: tiles })
    setSubmitting(false)
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 2000 } })
      return
    }
    const res = data as { result: string; drawn?: string[] }
    if (res.result === 'stale') {
      feedback.show({ tone: 'info', text: 'The board changed — try again.', dismiss: { kind: 'timed', ms: 2000 } })
    } else {
      lastActionRef.current = { removed: new Set(selected), oldLen: actingRack.length }
      setSelected(new Set())
      pendingDrawRef.current = res.drawn?.length ?? tiles.length
      feedback.show({ tone: 'success', text: `Exchanged ${tiles.length} tiles`, dismiss: { kind: 'timed', ms: 1800 } })
    }
  }, [game, selected, actingRack, gameId, feedback])

  const pass = useCallback(async () => {
    if (!game) return
    const { error } = await db.rpc('pass_turn', { target_game: gameId, base_version: game.version })
    if (error) feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 2000 } })
  }, [game, gameId, feedback])

  useEndGameMenu({ isTerminal, menu, feedback, endGame: () => db.rpc('end_game', { target_game: gameId }) })

  useGlobalKeyHandler((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // (The "~" word-lookup shortcut is now app-global; see useAppShortcuts.)
    if (!game || !canAct) return
    const k = e.key
    if (k === 'Enter') {
      e.preventDefault()
      if (staged.length > 0) void submit()
    } else if (k === 'Backspace') {
      e.preventDefault()
      backspace()
    } else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault()
      setCursor((cur) => moveCursor(cur, k, BOARD_SIZE - 1))
    } else if (k.length === 1 && /^[a-z]$/i.test(k)) {
      e.preventDefault()
      typeLetter(k.toUpperCase())
    }
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const over = isTerminal ? buildOver({ game, playState, status, selfId: session.user.id, nameOf }) : null

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <Board
          board={board}
          tentative={tentativeMap}
          cursor={cursor}
          hover={hover}
          greenCells={greenFlash}
          redCells={redFlash}
          dragSource={drag && drag.source.kind === 'board' ? { x: drag.source.x, y: drag.source.y } : null}
          dragging={!!drag}
          onCellPointerDown={onCellPointerDown}
        />
      </div>

      <div className={styles.sideCol}>
        {over ? (
          <div className={styles.gameOver}>
            <span>
              <span className="muted">Game over:</span> {over.status}
            </span>
            <BackToClubButton onClick={goToClub} />
          </div>
        ) : (
          <>
            {isCompete ? (
              <>
                <div className={styles.turn}>{myTurn ? 'Your turn' : `${nameOf(game.currentUserId)}'s turn`}</div>
                <OpponentStrip
                  players={members}
                  selfId={session.user.id}
                  metricFor={(player) => {
                    const ps = playerStates.find((p) => p.user_id === player.user_id)
                    return <>{ps?.score ?? 0}</>
                  }}
                />
              </>
            ) : (
              <div className={styles.turn}>Team score: {game.teamScore ?? 0}</div>
            )}
            <div className="muted">Bag: {game.bagCount} tiles</div>
            {!self && <p className="muted">Watching — you're not in this game.</p>}
            {self && (
              <>
                <Rack tiles={rackTiles} used={usedRackIdx} selected={selected} flashIds={yellowFlash} active={canAct} onPointerDown={onRackPointerDown} />
                <div className={styles.preview}>
                  {preview &&
                    (preview.valid ? (
                      <span className={styles.previewOk}>
                        {preview.words.map((w) => w.word).join(' · ')} — {preview.score} pts
                        {preview.bingo ? ' (+50 bingo)' : ''}
                      </span>
                    ) : (
                      <span className={styles.previewBad}>{preview.error}</span>
                    ))}
                </div>
                <Controls
                  isCompete={isCompete}
                  canAct={canAct}
                  hasTentative={staged.length > 0}
                  selectedCount={selected.size}
                  canExchange={game.bagCount >= 7}
                  submitting={submitting}
                  onSubmit={() => void submit()}
                  onRecall={recallAll}
                  onShuffle={shuffle}
                  onExchange={() => void exchange()}
                  onPass={() => void pass()}
                />
                <p className={`muted ${styles.hint}`}>
                  Drag tiles onto the board, or tap a square and type. Arrows move the cursor (a sideways arrow turns it ↓). Enter plays.
                </p>
              </>
            )}
          </>
        )}
        <PlayLog plays={plays} players={members} />
      </div>

      {blankAt && <BlankPicker onPick={pickBlank} onCancel={() => setBlankAt(null)} />}

      {drag && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }}>
          {drag.letter === BLANK ? '' : drag.letter}
        </div>
      )}

      {showModal && over && (
        <GameOverModal outcome={over.outcome} verdict={over.verdict} onClose={closeModal} onBackToClub={goToClub} />
      )}
    </div>
  )
}

/** Terminal verdict + status copy, mode- and self-aware. */
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
}): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  const outcome = (status?.outcome as string | undefined) ?? ''
  if (game.mode === 'coop') {
    const score = game.teamScore ?? 0
    if (outcome === 'manual') return { outcome: 'won', verdict: `Game ended — ${score} points.`, status: `${score} points` }
    if (outcome === 'timeout') return { outcome: 'won', verdict: `Time's up — ${score} points.`, status: `${score} points` }
    return { outcome: 'won', verdict: `Board cleared — ${score} points! 🎉`, status: `${score} points` }
  }
  if (playState === 'ended') return { outcome: 'won', verdict: 'Game ended — no winner.', status: 'ended' }
  const winner = status?.winner as string | null | undefined
  if (winner === selfId) return { outcome: 'won', verdict: 'You won the game! 🎉', status: 'you won' }
  if (winner) return { outcome: 'lost', verdict: `${nameOf(winner)} won.`, status: `${nameOf(winner)} won` }
  return { outcome: 'won', verdict: "It's a tie — co-winners!", status: 'tie' }
}
