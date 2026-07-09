import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MAX_REBUS_LEN } from '../lib/types'
import {
  BORDER_BOTTOM,
  BORDER_LEFT,
  BORDER_RIGHT,
  BORDER_TOP,
  computeBorderMask,
} from '../lib/cursor'
import type { Cell as CellT, PuzzleTemplate } from '../lib/types'
import { cellKey, type CellsMap } from '../hooks/useCells'
import { cls } from '../../common/lib/util/cls'
import styles from './Grid.module.css'

// Board sizing — a single computed cell size, everything else in `em`.
// Keyboard-required (the layout exception); no narrow branch. The vertical
// reserve covers the game chrome (--game-chrome-height, ~6.5rem) so the
// board never exceeds the layout height and push the page into scrolling.
const VERTICAL_OVERHEAD_PX = 112
const MAX_CELL_PX = 60
const REBUS_MIN_EM = 0.22

/** Board takes 40% of viewport width at 15 cols, ramping to 55% at 21. */
function targetWidthPercent(width: number): number {
  return Math.max(40, Math.min(55, 40 + (width - 15) * (15 / 6)))
}

// Width of the rebus / peek overlay box, in cell-widths. Wider than one cell
// (crossplay's REBUS_WIDTH_EM) so a long rebus isn't clipped at the cell edge.
const REBUS_WIDTH_EM = 3

/** Position the overlay box centered horizontally on the cursor cell, clamped
 *  to stay within the grid columns. Top = the cursor row, one cell tall. */
function overlayStyle(row: number, col: number, gridWidth: number): CSSProperties {
  const idealLeft = col + 0.5 - REBUS_WIDTH_EM / 2
  const maxLeft = gridWidth - REBUS_WIDTH_EM
  const left = Math.max(0, Math.min(maxLeft, idealLeft))
  return { top: `${row}em`, left: `${left}em`, width: `${REBUS_WIDTH_EM}em`, height: '1em' }
}

/** What to do with the cursor after a rebus commit — Enter advances one cell,
 *  Tab / Shift+Tab jumps to the next / previous clue (mirrors Tab elsewhere). */
export type RebusPostCommit = 'advance' | 'jumpNext' | 'jumpPrev'

type Props = {
  meta: PuzzleTemplate
  cells: CellsMap
  cursorRow: number
  cursorCol: number
  /** `${row}:${col}` for every cell in the active word. */
  highlighted: Set<string>
  onCellClick: (row: number, col: number) => void
  /** The rebus overlay target (Shift+Enter), or null. */
  rebus: { row: number; col: number; initial: string } | null
  onRebusCommit: (value: string, post: RebusPostCommit) => void
  onRebusCancel: () => void
  /** The read-only zoom-peek (Shift+Space): the cell + its fill, or null.
   *  Mutually exclusive with `rebus` (typing wins over peeking). */
  peek: { row: number; col: number; value: string } | null
  /** The answer grid — used to fill blank cells with the revealed answer
   *  (greyed). Null until the post-game "Reveal board" menu item fetches it
   *  (mid-game the solution is shielded server-side). */
  solution: (string[] | null)[][] | null
  /** `${row}:${col}` → CSS color, for teammates' cursor frames (coop). */
  peerCells: Map<string, string>
  /** `${row}:${col}` → CSS color: a teammate JUST filled this cell (coop);
   *  the fill flashes in their color for a few seconds. */
  recentFills: Map<string, string>
  /** Display-only preference: when true, a multi-char rebus fill renders as
   *  just its first letter (the underlying fill is unchanged). Crossplay's
   *  "collapse rebuses" toggle — keeps a dense grid legible at rest. */
  collapseRebus: boolean
}

export function Grid({
  meta, cells, cursorRow, cursorCol, highlighted, onCellClick, rebus, onRebusCommit, onRebusCancel, peek, solution, peerCells, recentFills, collapseRebus,
}: Props) {
  const { width, height, cells: template } = meta

  // Border masks depend only on the (immutable) template shape.
  const masks = useMemo(() => {
    const grid: CellT[][] = template
    return grid.map((row, r) => row.map((_, c) => computeBorderMask(grid, r, c)))
  }, [template])

  const cellSize = `min(calc(${targetWidthPercent(width)}vw / ${width}), calc((100dvh - ${VERTICAL_OVERHEAD_PX}px) / ${height}), ${MAX_CELL_PX}px)`

  return (
    <div
      className={styles.board}
      style={{ fontSize: cellSize, gridTemplateColumns: `repeat(${width}, 1em)` }}
    >
      {template.map((row, r) =>
        row.map((t, c) => {
          const key = `${r}:${c}`
          if (t.kind === 'block') {
            return <Cell key={key} mask={masks[r]![c]!} hidden={t.hidden === true} />
          }
          const given = t.given === true
          const live = given ? undefined : cells.get(cellKey(r, c))
          const liveFill = given ? (t.fill ?? null) : (live?.fill ?? null)
          // Post-game "Reveal board": fill a blank cell with the answer (greyed).
          const answer = solution && liveFill == null && !given ? (solution[r]?.[c]?.[0] ?? null) : null
          return (
            <Cell
              key={key}
              row={r}
              col={c}
              mask={masks[r]![c]!}
              number={t.number}
              fill={liveFill ?? answer}
              given={given}
              answerReveal={liveFill == null && answer != null}
              pencil={live?.pencil ?? false}
              revealed={live?.revealed ?? false}
              wrong={live?.wrong ?? false}
              circled={t.circled === true}
              shaded={t.shaded === true}
              isCursor={r === cursorRow && c === cursorCol}
              isInWord={highlighted.has(key)}
              peerColor={peerCells.get(key)}
              recentColor={recentFills.get(key) ?? null}
              markRight={live?.markRight ?? null}
              markBottom={live?.markBottom ?? null}
              collapseRebus={collapseRebus}
              onCellClick={onCellClick}
            />
          )
        }),
      )}
      {rebus ? (
        <div className={styles.rebusWrap} style={overlayStyle(rebus.row, rebus.col, width)}>
          <RebusInput initial={rebus.initial} onCommit={onRebusCommit} onCancel={onRebusCancel} />
        </div>
      ) : (
        // Read-only peek: same box as the rebus input but a non-interactive
        // div so arrows / letters still reach the window grid handler.
        peek && (
          <div className={styles.rebusWrap} style={overlayStyle(peek.row, peek.col, width)}>
            <div className={cls(styles.rebusInput, styles.rebusReadonly)}>{peek.value}</div>
          </div>
        )
      )}
    </div>
  )
}

/** The rebus (multi-char) entry input, positioned over the cursor cell.
 *  Self-contained: autofocus + select, sanitize to ≤8 uppercase letters.
 *  Enter commits + advances one cell; Tab / Shift+Tab commits + jumps to the
 *  next / previous clue (mirrors Tab elsewhere — crossplay's RebusInput); Esc
 *  / blur cancels. Key events are stopped so the window grid handler doesn't
 *  also see them (it's suspended while the overlay is open anyway). */
function RebusInput({
  initial, onCommit, onCancel,
}: {
  initial: string
  onCommit: (value: string, post: RebusPostCommit) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  // Enter/Tab → onCommit unmounts this input via parent state, firing blur
  // during removal. Without this guard onBlur would also fire onCancel.
  const committed = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className={styles.rebusInput}
      value={value}
      maxLength={MAX_REBUS_LEN}
      aria-label="Rebus entry"
      onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_REBUS_LEN))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          committed.current = true
          onCommit(value, 'advance')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          committed.current = true
          onCommit(value, e.shiftKey ? 'jumpPrev' : 'jumpNext')
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => {
        if (!committed.current) onCancel()
      }}
    />
  )
}

type CellProps =
  | { mask: number; hidden: boolean }
  | {
      mask: number
      row: number
      col: number
      number: number | null
      fill: string | null
      given: boolean
      /** This fill is a terminal-revealed answer (greyed), not a user entry. */
      answerReveal: boolean
      pencil: boolean
      revealed: boolean
      wrong: boolean
      circled: boolean
      shaded: boolean
      isCursor: boolean
      isInWord: boolean
      /** A teammate's cursor is here (coop) — draw a frame in their color. */
      peerColor: string | undefined
      /** A teammate JUST filled this cell (coop) — flash the fill in their
       *  color for a few seconds. Null otherwise. */
      recentColor: string | null
      /** Cryptic word-break / hyphen marks on the right / bottom edge. */
      markRight: 'break' | 'hyphen' | null
      markBottom: 'break' | 'hyphen' | null
      /** Collapse a multi-char rebus fill to its first letter (display only). */
      collapseRebus: boolean
      onCellClick: (row: number, col: number) => void
    }

const Cell = memo(function Cell(props: CellProps) {
  const borderCls = [
    props.mask & BORDER_TOP ? styles.borderTop : '',
    props.mask & BORDER_RIGHT ? styles.borderRight : '',
    props.mask & BORDER_BOTTOM ? styles.borderBottom : '',
    props.mask & BORDER_LEFT ? styles.borderLeft : '',
  ]

  if ('hidden' in props) {
    return (
      <div className={cls(styles.cell, props.hidden ? styles.voidCell : styles.block, ...borderCls)} />
    )
  }

  const {
    row, col, number, fill, given, answerReveal, pencil, revealed, wrong,
    circled, shaded, isCursor, isInWord, peerColor, recentColor,
    markRight, markBottom, collapseRebus, onCellClick,
  } = props

  const bg = isCursor ? styles.cursor : isInWord ? styles.inWord : ''

  // The letter(s) actually shown. `collapseRebus` renders a multi-char rebus
  // as just its first letter (display only — `data-fill` keeps the full fill).
  const displayFill = fill && collapseRebus && fill.length > 1 ? fill[0]! : fill

  // Rebus: shrink + re-center a multi-char fill. A recent peer fill (coop)
  // tints the letter in that teammate's color for a few seconds. Keyed on the
  // DISPLAYED length, so a collapsed rebus renders at full single-cell size.
  const fillStyle: CSSProperties | undefined =
    displayFill && displayFill.length > 1
      ? {
          fontSize: `max(${REBUS_MIN_EM}em, min(0.62em, ${(0.9 / displayFill.length).toFixed(3)}em))`,
          transform: 'none',
          ...(recentColor ? { color: recentColor } : {}),
        }
      : recentColor
        ? { color: recentColor }
        : undefined

  return (
    <div
      className={cls(styles.cell, bg, ...borderCls)}
      data-xw-cell=""
      data-row={row}
      data-col={col}
      data-fill={fill ?? ''}
      data-wrong={wrong ? '' : undefined}
      data-revealed={revealed ? '' : undefined}
      data-pencil={pencil && fill ? '' : undefined}
      data-cursor={isCursor ? '' : undefined}
      data-peer={peerColor ? '' : undefined}
      data-mark-right={markRight ?? undefined}
      data-mark-bottom={markBottom ?? undefined}
      onMouseDown={(e) => {
        e.preventDefault()
        onCellClick(row, col)
      }}
    >
      {shaded && <span className={styles.shade} />}
      {circled && <span className={styles.circle} />}
      {number != null && <span className={styles.number}>{number}</span>}
      {fill && (
        <span
          className={cls(
            styles.fill,
            pencil ? styles.pencil : '',
            given ? styles.given : '',
            answerReveal ? styles.answerReveal : '',
          )}
          style={fillStyle}
        >
          {fill}
        </span>
      )}
      {(wrong || revealed) && (
        <span className={cls(styles.mark, wrong ? styles.markWrong : styles.markRevealed)} />
      )}
      {/* Cryptic edge marks: a break bar or hyphen dash on the right / bottom
          boundary (aria-hidden — decorative). */}
      {markRight === 'break' && <span className={styles.markRightBreak} aria-hidden />}
      {markRight === 'hyphen' && <span className={styles.markRightHyphen} aria-hidden />}
      {markBottom === 'break' && <span className={styles.markBottomBreak} aria-hidden />}
      {markBottom === 'hyphen' && <span className={styles.markBottomHyphen} aria-hidden />}
      {peerColor && <span className={styles.peerFrame} style={{ borderColor: peerColor }} />}
    </div>
  )
})
