// cs-unmet

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { pressed } from '@/common/keyboard/componentKeyGroups'
import { cls } from '@/common/utils/cls'
import { MAX_REBUS_LEN } from '../lib/grid'
import type { GRebusAfterSubmit } from '../types'
import styles from './RebusBox.module.css'

/** The box's width, in cell widths: wider than one cell (crossplay's
 *  REBUS_WIDTH_EM), so a long rebus isn't clipped at the cell's edge. */
const REBUS_WIDTH_EM = 3

/** The box centered on the cell, clamped to the grid's columns, one cell tall. */
function makeBoxStyle(row: number, col: number, gridWidth: number): CSSProperties {
  const idealLeft = col + 0.5 - REBUS_WIDTH_EM / 2
  const maxLeft = gridWidth - REBUS_WIDTH_EM
  const left = Math.max(0, Math.min(maxLeft, idealLeft))
  return { top: `${row}em`, left: `${left}em`, width: `${REBUS_WIDTH_EM}em`, height: '1em' }
}

type Props = {
  row: number
  col: number
  // The grid's width in cells, to clamp the box to.
  gridWidth: number
} & (
  | {
      kind: 'entry'
      // The fill the box opens on.
      initial: string
      onSubmit: (value: string, after: GRebusAfterSubmit) => void
      onCancel: () => void
    }
  | {
      kind: 'peek'
      // The squeezed rebus, shown whole.
      value: string
    }
)

/**
 * The box over a cell, three cells wide: the rebus entry (⇧↵), or the
 * read-only peek at a squeezed rebus (⇧Space). The peek is a plain div, so no
 * field takes focus and the grid's keys stay live.
 */
export function RebusBox(props: Props) {
  return (
    <div className={styles.rebusWrap} style={makeBoxStyle(props.row, props.col, props.gridWidth)}>
      {props.kind === 'entry' ? (
        <RebusInput initial={props.initial} onSubmit={props.onSubmit} onCancel={props.onCancel} />
      ) : (
        <div className={cls(styles.rebusInput, styles.rebusReadonly)}>{props.value}</div>
      )}
    </div>
  )
}

/**
 * The rebus entry: it takes focus with its text selected and keeps to at most
 * eight capital letters. Enter submits and advances one cell; Tab / Shift+Tab
 * submit and jump to the next / previous clue; Escape or a blur cancels. Its
 * keys stop here — the grid's keys are suspended while it is open anyway.
 */
function RebusInput({
  initial, onSubmit, onCancel,
}: {
  initial: string
  onSubmit: (value: string, after: GRebusAfterSubmit) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  // A submit unmounts the input, which fires a blur on the way out; without
  // this the blur would cancel what was just submitted.
  const submitted = useRef(false)
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
        if (pressed('keys-rebus-submit', e)) {
          e.preventDefault()
          submitted.current = true
          onSubmit(value, 'advance')
        } else if (pressed('keys-rebus-jump', e)) {
          e.preventDefault()
          submitted.current = true
          onSubmit(value, e.shiftKey ? 'jumpPrev' : 'jumpNext')
        } else if (pressed('keys-rebus-cancel', e)) {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => {
        if (!submitted.current) onCancel()
      }}
    />
  )
}
