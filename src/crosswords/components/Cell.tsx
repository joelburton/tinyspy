// cs-unmet

import { memo, type CSSProperties } from 'react'
import { cls } from '@/common/utils/cls'
import { BORDER_BOTTOM, BORDER_LEFT, BORDER_RIGHT, BORDER_TOP } from '../lib/cursor'
import type { GMarkType } from '../types'
import styles from './Cell.module.css'

/** The smallest a squeezed rebus's letters get, in cell widths. */
const REBUS_MIN_EM = 0.22

type Props =
  | {
      kind: 'block'
      // Which sides draw the grid's line (`computeBorderMask`).
      mask: number
      // An irregular grid's void: no black square, no outline.
      hidden: boolean
    }
  | {
      kind: 'cell'
      mask: number
      row: number
      col: number
      number: number | null
      // The letter or rebus on screen: the players', a given's, or the solution's.
      fill: string | null
      given: boolean
      isSolutionLetter: boolean
      pencil: boolean
      revealed: boolean
      wrong: boolean
      circled: boolean
      shaded: boolean
      markRight: GMarkType | null
      markBottom: GMarkType | null
      collapseRebus: boolean
      isCursor: boolean
      isInWord: boolean
      // A teammate's cursor is here (coop): their color, else null.
      peerColor: string | null
      // A teammate just filled this cell (coop): their color, else null.
      flashColor: string | null
      onClick: (row: number, col: number) => void
    }

/**
 * One square of the grid: a block, or an open cell and everything on it — its
 * number, the author's circle and shading, the letter in pen or pencil or the
 * given's underline, the wrong / revealed corner, the cryptic edge marks, and
 * a teammate's cursor frame and fill flash.
 *
 * **A solution letter** is the author's answer drawn over the players' fill
 * while "Reveal solution" is on: gray where it is not what they wrote — a
 * blank they left, or a letter they got wrong — so the answer key doubles as
 * a diff. The wrong corner goes with it, since that verdict was about a letter
 * no longer on screen; Hide brings both back.
 *
 * Takes plain values, not the `GCell`: every blob rebuilds every cell object,
 * and `memo` over plain values redraws only the cells that changed.
 */
export const Cell = memo(function Cell(props: Props) {
  const borderClasses = [
    props.mask & BORDER_TOP ? styles.borderTop : '',
    props.mask & BORDER_RIGHT ? styles.borderRight : '',
    props.mask & BORDER_BOTTOM ? styles.borderBottom : '',
    props.mask & BORDER_LEFT ? styles.borderLeft : '',
  ]

  if (props.kind === 'block') {
    return (
      <div className={cls(styles.cell, props.hidden ? styles.voidCell : styles.block, ...borderClasses)} />
    )
  }

  const {
    row, col, number, fill, given, isSolutionLetter, pencil, revealed, wrong,
    circled, shaded, isCursor, isInWord, peerColor, flashColor,
    markRight, markBottom, collapseRebus, onClick,
  } = props

  const tint = isCursor ? styles.cursor : isInWord ? styles.inWord : ''

  // The letters drawn: a collapsed rebus shows its first letter alone, while
  // `data-fill` keeps the whole fill.
  const shownFill = fill && collapseRebus && fill.length > 1 ? fill[0]! : fill

  // A rebus shrinks to fit; a teammate's fresh fill is drawn in their color.
  const fillStyle: CSSProperties | undefined =
    shownFill && shownFill.length > 1
      ? {
          fontSize: `max(${REBUS_MIN_EM}em, min(0.62em, ${(0.9 / shownFill.length).toFixed(3)}em))`,
          transform: 'none',
          ...(flashColor ? { color: flashColor } : {}),
        }
      : flashColor
        ? { color: flashColor }
        : undefined

  return (
    <div
      className={cls(styles.cell, tint, ...borderClasses)}
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
        onClick(row, col)
      }}
    >
      {shaded && <span className={styles.shade} />}
      {circled && <span className={styles.circle} />}
      {number != null && <span className={styles.number}>{number}</span>}
      {shownFill && (
        <span
          className={cls(
            styles.fill,
            pencil ? styles.pencil : '',
            given ? styles.given : '',
            isSolutionLetter ? styles.solutionLetter : '',
          )}
          style={fillStyle}
        >
          {shownFill}
        </span>
      )}
      {(wrong || revealed) && (
        <span className={cls(styles.mark, wrong ? styles.markWrong : styles.markRevealed)} />
      )}
      {markRight === 'break' && <span className={styles.markRightBreak} aria-hidden />}
      {markRight === 'hyphen' && <span className={styles.markRightHyphen} aria-hidden />}
      {markBottom === 'break' && <span className={styles.markBottomBreak} aria-hidden />}
      {markBottom === 'hyphen' && <span className={styles.markBottomHyphen} aria-hidden />}
      {peerColor && <span className={styles.peerFrame} style={{ borderColor: peerColor }} />}
    </div>
  )
})
