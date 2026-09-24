// cs-unmet

import { useCallback, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TraceCells } from '../lib/boardTrace'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { TypedWord } from './TypedWord'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { Stats, type BoggleStats } from './Stats'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import styles from './PlayArea.module.css'

/** Rotate a square grid 90° clockwise — repositions tiles; the letters themselves
 *  render upright (no spin). new[i][j] = old[n-1-j][i]. */
function rotateCW(g: string[][]): string[][] {
  const n = g.length
  return g.map((_, i) => g.map((_, j) => g[n - 1 - j][i]))
}

/** A tile position in the (displayed, possibly-rotated) grid. */
type Cell = { y: number; x: number }

/** The letters a tile contributes to the word: its display string (a multiface
 *  tile like "Qu" gives two), uppercased — except a blank ("?"), which matches no
 *  letter, so it can't be part of a word. */
function tileLetters(cell: string): string {
  return cell === '?' ? '' : cell.toUpperCase()
}

/** King-move adjacency (8-way), the Boggle path rule. */
function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.y - b.y) <= 1 && Math.abs(a.x - b.x) <= 1 && !(a.y === b.y && a.x === b.x)
}

/** The word spelled by a path of tiles through the current view. */
function pathWord(path: Cell[], view: string[][]): string {
  return path.map((c) => tileLetters(view[c.y][c.x])).join('')
}

/**
 * boggle's board column — the square tile grid, a floating Rotate control over its
 * top-right, and the below-board slot (the shared `<WordEntryArea>` — the typed-word input
 * + capture keyboard — which draws the local feedback slot's top message in
 * place of the controls).
 *
 * It owns the **local board rotation** (a per-player view-only matrix rotation — the
 * tiles reposition, each letter stays upright — never persisted or shared). The
 * word-entry ENGINE (`useFoundWordSubmit`: the typed word, the submit RPC, the results)
 * stays in PlayArea, as does the local feedback slot it shows into — InfoCol's
 * End / Concede and PlayArea's standing conditions show into the same slot — so
 * PlayArea passes the entry primitives (`word` / `onChange` / `onSubmit` / the
 * slot / …) DOWN and this column renders them. Like the other games' BoardCol
 * it does NOT own the game state: PlayArea hands it the display `grid`. See
 * docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status block (above the board) ──
  stats,
  // ── Board to render ──
  grid,
  n,
  answered,
  typedCells,
  // ── Word entry (engine in PlayArea; rendered here) ──
  word,
  onChange,
  onSubmit,
  localFeedbackSlot,
  lastWord,
  readOnly,
}: {
  // ── Mobile-only status block ──
  /** The figures behind the 4-cell `<Stats>` grid — the SAME component the info
   *  column renders, mirrored above the board below the `--mobile` breakpoint
   *  (where the info column is off-canvas in the InfoSheet). Hidden by CSS on
   *  desktop; see `<MobileStatusBar>`. */
  stats: BoggleStats

  // ── Board to render ──
  /** The display grid (letters in board order) — PlayArea builds it from the board;
   *  this column rotates the local view on top. */
  grid: string[][]
  /** The board dimension (game.n) — drives the grid's --cols / --rows. */
  n: number
  /** The tiles a refused word used, wearing its answer, in BOARD cell indices —
   *  this column turns them into the view the player is looking at. Null when
   *  nothing was just refused, which is nearly always. The mark's `nonce` counts
   *  the raises; the marked tiles are keyed by it so the head-shake replays
   *  (see below). */
  answered: Mark<{ cells: number[]; outcome: Outcome }> | null
  /** Where the TYPED word's letters can sit, in board cells: `certain` is a
   *  letter with one candidate tile, `possible` a letter with several. Null when
   *  nothing is typed. Ignored while a tapped path exists — that one is the
   *  player's own choice, not a deduction. */
  typedCells: TraceCells | null

  // ── Word entry ──
  /** The pending typed word. */
  word: string
  onChange: (next: string) => void
  onSubmit: () => void
  /** PlayArea's below-board slot — the entry row draws its top in place of the
   *  controls, and a keystroke or tile tap is the player's next action, so it
   *  dismisses a gesture-cleared result. */
  localFeedbackSlot: FeedbackSlot
  /** The last submitted word, for ArrowUp recall. */
  lastWord: string
  /** Freeze entry (terminal / conceded). */
  readOnly: boolean
}) {
  // Number of 90° clockwise turns applied to the displayed grid (local view only).
  const [turns, setTurns] = useState(0)
  // Rotating repositions the tiles but keeps each letter upright (a matrix rotation,
  // not a visual spin) — so it stays readable from any side.
  const view = useMemo(() => {
    let g = grid
    for (let i = 0; i < turns; i++) g = rotateCW(g)
    return g
  }, [grid, turns])

  /** Board cells → the keys the grid below draws by, through however many turns
   *  the player has given the board. One clockwise turn sends (row, col) to
   *  (col, n-1-row). */
  const inView = useCallback(
    (cells: number[]) => {
      const out = new Set<string>()
      for (const cell of cells) {
        let y = (cell / n) | 0
        let x = cell % n
        for (let i = 0; i < turns; i++) {
          const py = y
          y = x
          x = n - 1 - py
        }
        out.add(`${y}-${x}`)
      }
      return out
    },
    [n, turns],
  )

  const answeredCells = useMemo(
    () =>
      answered
        ? {
            cells: inView(answered.value.cells),
            outcome: answered.value.outcome,
            nonce: answered.nonce,
          }
        : null,
    [answered, inView],
  )
  const typed = useMemo(
    () =>
      typedCells
        ? { certain: inView(typedCells.certain), possible: inView(typedCells.possible) }
        : null,
    [typedCells, inView],
  )

  // ── Tap-to-trace a word ───────────────────────────────────────────────────
  // Build a word by tapping tiles along a Boggle path — the touch input, and a
  // fine desktop affordance too. `path` is the selected tiles (in VIEW coords, so
  // it's cleared on rotate below, since the coords would no longer point at the
  // same letters). The traced word drives the shared `word`/`onChange` engine, so
  // submit + validation (traceableStr) are unchanged. Typing clears the path (you
  // switched to the keyboard); Backspace/Delete steps it back one tile (see
  // `handleTyping`); submitting clears it (fresh word).
  const [path, setPath] = useState<Cell[]>([])
  const handleTap = (y: number, x: number) => {
    if (readOnly || view[y][x] === '?') return // frozen, or a blank (matches nothing)
    localFeedbackSlot.dismiss() // a tap is the next move, like a keystroke
    const idx = path.findIndex((c) => c.y === y && c.x === x)
    let next: Cell[]
    if (idx >= 0) {
      // Tapping a selected tile deselects it AND everything after — tap the last
      // to step back one, tap an earlier one to undo back to it, tap the first to
      // clear.
      next = path.slice(0, idx)
    } else if (path.length === 0 || adjacent(path[path.length - 1], { y, x })) {
      next = [...path, { y, x }] // start, or extend along an adjacent tile
    } else {
      return // an unused, non-adjacent tile — not a legal next step; ignore
    }
    setPath(next)
    onChange(pathWord(next, view))
  }
  // Every non-tap edit of the word (typing, Backspace, the Delete button, ArrowUp
  // recall) arrives here. A typed character makes the word stop describing the
  // traced path, so the highlight (and its coords) has to go — but a DELETE is
  // exactly the undo the path can express, so it steps the trace back one tile
  // instead of dropping the whole highlight. Detected by shape rather than by
  // plumbing a "this was Backspace" flag down from the capture keyboard: a
  // one-character shortening of a word that still equals the traced path can only
  // be Backspace/Delete (a recalled word is a whole different string).
  //
  // A multiface tile (`Qu`) is one tile but two characters, so stepping back one
  // tile takes both — the trace stays a real path, which is what submit validates.
  const handleTyping = (next: string) => {
    const traced = path.length > 0 && word === pathWord(path, view)
    if (traced && next === word.slice(0, -1)) {
      const back = path.slice(0, -1)
      setPath(back)
      onChange(pathWord(back, view))
      return
    }
    setPath([])
    onChange(next)
  }
  const handleSubmit = () => {
    setPath([])
    onSubmit()
  }

  // ⌥Z rotates — a fresh visual scan of the SAME board, never a move. Bound HERE
  // rather than in the PlayArea because this column owns the view's rotation, and
  // plainly active: rotating writes nothing and reaches nobody else, so the
  // post-game fidget is deliberate. Rotating invalidates the traced path's
  // coords (they point at view positions), so clear it — said once for the key
  // and the round pill below, which are one binding.
  const handleRotate = useCallback(() => {
    setTurns((t) => (t + 1) % 4)
    setPath([])
  }, [])
  const actRotate = useBoundAction('act-rotate', {
    describe: () => 'active',
    run: handleRotate,
  })

  return (
    <div
      className={cls(shared.boardCol, styles.boardCol)}
      style={{ ['--cols' as string]: n, ['--rows' as string]: n }}
    >
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the Req/Bonus × Words/Score grid, above the board. A fixed-height
          block — the board's `--side` already has it subtracted, so the tray
          shrinks by exactly this much and the page still doesn't scroll. */}
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <Stats {...stats} />
        </div>
      </MobileStatusBar>
      <div className={cls(shared.boardSeal, styles.grid)}>
        {view.flatMap((row, y) =>
          row.map((cell, x) => {
            const isBlank = cell === '?'
            const step = path.findIndex((c) => c.y === y && c.x === x) // -1 if not on the path
            return (
              <div
                // A tile wearing an answer is keyed by the RAISE, not just by
                // its place: the head-shake is a CSS animation, and an animation
                // runs once per mount, so refusing the same word twice inside
                // the answer's beat would leave the class where it was and shake
                // nothing the second time. Changing the key remounts the tile
                // and the shake starts over. (letterboxed's letters carry the
                // same nonce in their keys, for the same reason.)
                key={
                  answeredCells?.cells.has(`${y}-${x}`)
                    ? `${y}-${x}#${answeredCells.nonce}`
                    : `${y}-${x}`
                }
                className={cls(
                  styles.tile,
                  // A refused word's tiles: the answer's own color, and the
                  // head-shake, for the beat. No attention flash — you know
                  // what you typed and where it went.
                  answeredCells?.cells.has(`${y}-${x}`) && styles.answered,
                  answeredCells?.cells.has(`${y}-${x}`) &&
                    VERDICT_TONE[answeredCells.outcome],
                  answeredCells?.cells.has(`${y}-${x}`) && shared.verdictShake,
                  // A blank takes no clicks (its handlers are dropped below), so
                  // it takes none of the pointer/hover/press treatment either —
                  // said on the TILE, since `.blank` styles the letter inside it.
                  isBlank && styles.tileBlank,
                  // Selected: the tiles this word uses — the ones tapped, or,
                  // for a typed word, the ones a letter has settled on.
                  (step >= 0 || (path.length === 0 && typed?.certain.has(`${y}-${x}`))) &&
                    styles.selected,
                  // …and the same border, held back, where a letter still has more
                  // than one tile it could mean.
                  path.length === 0 && typed?.possible.has(`${y}-${x}`) && styles.maybeSelected,
                )}
                // The stable test handle; `data-step` is the tile's 1-based
                // position in the traced word, absent when it isn't on the path.
                data-boggle-tile
                data-step={step >= 0 ? step + 1 : undefined}
                // POINTER-ONLY: no tabIndex, no role, no Enter/Space keydown.
                // A tile isn't keyboard-reachable — the page's tab ring is
                // empty — so the button costume was unreachable,
                // and it was actively harmful: a focused tile's own keydown
                // would eat the player's next Enter, tracing a stray tile onto
                // the word instead of submitting it. Nothing to eat it now.
                // (spellingbee's Letter carries the same note at length.)
                //
                // preventDefault on mousedown remains, to stop a click
                // selecting the tile's letter — the tile can't take focus any
                // more, so that's all it's for.
                onMouseDown={isBlank ? undefined : (e) => e.preventDefault()}
                onClick={isBlank ? undefined : () => handleTap(y, x)}
              >
                {/* a blank tile (face 0) shows a faint "?", like a scrabble blank */}
                <span className={isBlank ? styles.blank : undefined}>{cell}</span>
              </div>
            )
          }),
        )}
        {/* Rotate floats over the board's top-right — a fresh visual scan of the SAME
            board (letters stay upright), not a turn action. Local to this player in
            both modes; never persisted, never seen by others. INSIDE the grid (its
            position anchor) so it hugs the visual board, not the column. Rotating
            invalidates the traced path's coords, so clear it. */}
        <ShuffleButton action={actRotate} tooltip="Rotate board" className={shared.floatingShuffle} />
      </div>
      {/* The below-board slot — the shared <WordEntryArea> (icon-only Delete + the WordEntryInput
          + icon-only Submit, plus the capture keyboard). While the slot holds a
          message it draws it in place of the controls — the verdict, "you're
          out", a word result, whichever ranks highest. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={word}
            onChange={handleTyping}
            onSubmit={handleSubmit}
            placeholder="Type or tap letters"
            disabled={readOnly}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            localFeedbackSlot={localFeedbackSlot}
          >
            {/* Per-character: the letters past where the board can follow are
                dimmed. A tapped word is traced by construction, so `reach` is
                its whole length and nothing dims. */}
            <TypedWord word={word} reach={typedCells?.reach ?? word.length} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
