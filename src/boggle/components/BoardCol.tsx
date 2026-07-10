import { useMemo, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { terminalPill } from '../../common/lib/game/localPills'
import { EntryRow } from '../../common/components/game/entry/EntryRow'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { asciiLetters } from '../../common/hooks/input/useCaptureKeys'
import shared from '../../common/components/game/PlayArea.module.css'
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
 * top-right, and the below-board slot (the shared `<EntryRow>` — the typed-word input
 * + capture keyboard — which renders the own-move / terminal pill in place of the
 * controls when `pill` is set).
 *
 * It owns the **local board rotation** (a per-player view-only matrix rotation — the
 * tiles reposition, each letter stays upright — never persisted or shared). The
 * word-entry ENGINE (`useWordSubmit`: the typed word, the submit RPC, the feedback)
 * stays in PlayArea, because its feedback channel is also written by InfoCol's End /
 * Concede — so PlayArea passes the entry primitives (`word` / `onChange` / `onSubmit`
 * / `localPill` / …) DOWN and this column renders them. Like the other games'
 * BoardCol it does NOT own the game state: PlayArea hands it the display `grid`, and
 * the below-board `over` pill / `localPill`. See docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  // ── Board to render ──
  grid,
  n,
  // ── Word entry (engine in PlayArea; rendered here) ──
  word,
  onChange,
  onSubmit,
  onAnyKey,
  lastWord,
  readOnly,
  // ── Below-board pill (channel owned by PlayArea) ──
  over,
  localPill,
}: {
  // ── Board to render ──
  /** The display grid (letters in board order) — PlayArea builds it from the board;
   *  this column rotates the local view on top. */
  grid: string[][]
  /** The board dimension (game.n) — drives the grid's --cols / --rows. */
  n: number

  // ── Word entry ──
  /** The pending typed word. */
  word: string
  onChange: (next: string) => void
  onSubmit: () => void
  /** Dismiss the sticky own-move pill on any keystroke (a new move clears it). */
  onAnyKey: () => void
  /** The last submitted word, for ArrowUp recall. */
  lastWord: string
  /** Freeze entry (terminal / conceded). */
  readOnly: boolean

  // ── Below-board pill ──
  /** Terminal copy — its verdict shows as a permanent below-board pill at game-over. */
  over: TerminalCopy | null
  /** The own-move pill to show while the entry is empty (a word result), or null. */
  localPill: GenericFeedbackMsg | null
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

  // ── Tap-to-trace a word (docs/mobile.md) ──────────────────────────────────
  // Build a word by tapping tiles along a Boggle path — the touch input, and a
  // fine desktop affordance too. `path` is the selected tiles (in VIEW coords, so
  // it's cleared on rotate below, since the coords would no longer point at the
  // same letters). The traced word drives the shared `word`/`onChange` engine, so
  // submit + validation (traceableStr) are unchanged. Typing clears the path (you
  // switched to the keyboard); submitting clears it (fresh word).
  const [path, setPath] = useState<Cell[]>([])
  const handleTap = (y: number, x: number) => {
    if (readOnly || view[y][x] === '?') return // frozen, or a blank (matches nothing)
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
  // Typing / the Delete key edits the word directly — the traced path no longer
  // matches it, so drop the highlight (and its coords).
  const handleTyping = (next: string) => {
    setPath([])
    onChange(next)
  }
  const handleSubmit = () => {
    setPath([])
    onSubmit()
  }

  return (
    <div
      className={cls(shared.boardCol, styles.boardCol)}
      style={{ ['--cols' as string]: n, ['--rows' as string]: n }}
    >
      <div className={styles.grid}>
        {view.flatMap((row, y) =>
          row.map((cell, x) => {
            const isBlank = cell === '?'
            const step = path.findIndex((c) => c.y === y && c.x === x) // -1 if not on the path
            return (
              <div
                key={`${y}-${x}`}
                className={cls(styles.tile, step >= 0 && styles.selected)}
                data-boggle-tile
                // A blank isn't part of any word, so it isn't interactive.
                role={isBlank ? undefined : 'button'}
                tabIndex={isBlank || readOnly ? undefined : 0}
                aria-label={isBlank ? undefined : cell}
                aria-pressed={step >= 0 || undefined}
                // Don't let a pointer tap FOCUS the tile (same guard as spellingbee's
                // hex Letter). Word entry is the window-level capture keyboard, so a
                // focused tile would hijack the player's next Enter — pressing Enter to
                // submit a typed word would instead fire this tile's onKeyDown and trace
                // the tile onto the word ("submitted 2 letters / a stray last tile").
                // preventDefault on mousedown keeps focus where it is (touch on iOS
                // never focuses a div, but desktop/other browsers do).
                onMouseDown={isBlank ? undefined : (e) => e.preventDefault()}
                onClick={isBlank ? undefined : () => handleTap(y, x)}
                onKeyDown={
                  isBlank
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleTap(y, x)
                        }
                      }
                }
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
        <ShuffleButton
          onShuffle={() => {
            setTurns((t) => (t + 1) % 4)
            setPath([])
          }}
          label="Rotate board"
          className={shared.floatingShuffle}
        />
      </div>
      {/* The below-board slot — the shared <EntryRow> (icon-only Delete + the EntryBox
          + icon-only Submit, plus the capture keyboard). It renders the terminal
          verdict / own-move feedback pill in place of the controls when `pill` is set
          (terminal takes precedence; an own-move result shows only while the entry is
          empty so typing reclaims the slot). */}
      <div className={styles.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <EntryRow
            value={word}
            onChange={handleTyping}
            onSubmit={handleSubmit}
            placeholder="Type or tap letters"
            disabled={readOnly}
            onAnyKey={onAnyKey}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            pill={
              over ? terminalPill(over.tone, over.verdict) : word === '' ? localPill : null
            }
          />
        </div>
      </div>
    </div>
  )
}
