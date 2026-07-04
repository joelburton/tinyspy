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
 * / `localFeedback` / …) DOWN and this column renders them. Like the other games'
 * BoardCol it does NOT own the game state: PlayArea hands it the display `grid`, and
 * the below-board `over` pill / `localFeedback`. See docs/playarea-decomposition-plan.md.
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
  entryDisabled,
  // ── Below-board pill (channel owned by PlayArea) ──
  over,
  localFeedback,
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
  entryDisabled: boolean

  // ── Below-board pill ──
  /** Terminal copy — its verdict shows as a permanent below-board pill at game-over. */
  over: TerminalCopy | null
  /** The own-move pill to show while the entry is empty (a word result), or null. */
  localFeedback: GenericFeedbackMsg | null
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

  return (
    <div
      className={cls(shared.boardCol, styles.boardCol)}
      style={{ ['--cols' as string]: n, ['--rows' as string]: n }}
    >
      <div className={styles.grid}>
        {view.flatMap((row, y) =>
          row.map((cell, x) => (
            <div key={`${y}-${x}`} className={styles.tile} data-boggle-tile>
              {/* a blank tile (face 0) shows a faint "?", like a scrabble blank */}
              <span className={cell === '?' ? styles.blank : undefined}>{cell}</span>
            </div>
          )),
        )}
      </div>
      {/* Rotate floats over the board's top-right — a fresh visual scan of the SAME
          board (letters stay upright), not a turn action. Local to this player in
          both modes; never persisted, never seen by others. */}
      <ShuffleButton
        onShuffle={() => setTurns((t) => (t + 1) % 4)}
        label="Rotate board"
        className={shared.floatingShuffle}
      />
      {/* The below-board slot — the shared <EntryRow> (icon-only Delete + the EntryBox
          + icon-only Submit, plus the capture keyboard). It renders the terminal
          verdict / own-move feedback pill in place of the controls when `pill` is set
          (terminal takes precedence; an own-move result shows only while the entry is
          empty so typing reclaims the slot). */}
      <div className={styles.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <EntryRow
            value={word}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder="Type a word"
            disabled={entryDisabled}
            onAnyKey={onAnyKey}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            pill={
              over ? terminalPill(over.tone, over.verdict) : word === '' ? localFeedback : null
            }
          />
        </div>
      </div>
    </div>
  )
}
