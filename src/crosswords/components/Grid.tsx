import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
// Desktop-only (the layout exception); no narrow branch.
const VERTICAL_OVERHEAD_PX = 64
const MAX_CELL_PX = 60
const REBUS_MIN_EM = 0.22

/** Board takes 40% of viewport width at 15 cols, ramping to 55% at 21. */
function targetWidthPercent(width: number): number {
  return Math.max(40, Math.min(55, 40 + (width - 15) * (15 / 6)))
}

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
  onRebusCommit: (value: string) => void
  onRebusCancel: () => void
  /** At terminal, the answer grid — used to fill blank cells with the
   *  revealed answer (greyed). Null mid-game (the solution is shielded). */
  solution: (string[] | null)[][] | null
}

export function Grid({
  meta, cells, cursorRow, cursorCol, highlighted, onCellClick, rebus, onRebusCommit, onRebusCancel, solution,
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
          // Terminal reveal: fill a blank cell with the revealed answer (greyed).
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
              onCellClick={onCellClick}
            />
          )
        }),
      )}
      {rebus && (
        <div
          className={styles.rebusWrap}
          style={{ top: `${rebus.row}em`, left: `${rebus.col}em` }}
        >
          <RebusInput initial={rebus.initial} onCommit={onRebusCommit} onCancel={onRebusCancel} />
        </div>
      )}
    </div>
  )
}

/** The rebus (multi-char) entry input, positioned over the cursor cell.
 *  Self-contained: autofocus + select, sanitize to ≤8 uppercase letters,
 *  Enter commits, Esc / blur cancels. Key events are stopped so the window
 *  grid handler doesn't also see them (it bails on inputs anyway). */
function RebusInput({
  initial, onCommit, onCancel,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
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
      onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_REBUS_LEN))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          committed.current = true
          onCommit(value)
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
    circled, shaded, isCursor, isInWord, onCellClick,
  } = props

  const bg = isCursor ? styles.cursor : isInWord ? styles.inWord : ''

  // Rebus: shrink + re-center a multi-char fill.
  const fillStyle =
    fill && fill.length > 1
      ? { fontSize: `max(${REBUS_MIN_EM}em, min(0.62em, ${(0.9 / fill.length).toFixed(3)}em))`, transform: 'none' as const }
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
    </div>
  )
})
