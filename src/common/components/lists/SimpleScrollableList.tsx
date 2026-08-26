// cs-unmet

import type { ReactNode } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './SimpleScrollableList.module.css'

type Props = {
  /** The rows — `<li>`s. The list sizes them; how they LOOK is the caller's. */
  children: ReactNode
  /** How many rows to show before scrolling. */
  rows: number
  /** What to say when there are no rows: "No words." It renders inside the
   *  frame, so an empty list still reads as a list. */
  empty?: ReactNode
  /** An optional tally under the frame — "137 words". Right-aligned to the
   *  frame's edge; omit it and no line is drawn. */
  count?: ReactNode
  /** Where the list sits in its own parent. Placement is the caller's. */
  className?: string
}

/**
 * A FRAMED LIST THAT SHOWS A FEW ROWS AND SCROLLS PAST THAT.
 *
 * Not `<SelectionList>`, which is a different job: that one is pick-one, is the
 * page's main structure, rules its rows off from each other and moves its own
 * frame to show the keyboard cursor. This is the small answer — a card holding
 * results you read, and possibly click.
 *
 * **It shrinks and it caps.** Four results make a four-row-tall box; two hundred
 * make a `rows`-tall box you scroll. `max-height` does both by itself, which is
 * why there is no flex anywhere in the module: a list that negotiates for
 * leftover space needs its parent bounded, its own `flex` set and its
 * `min-height` zeroed, and every one of those is a chance to be subtly wrong.
 *
 * **The height is stated in rows**, and the list owns what a row is
 * (`--simpleScrollableList-row-height`), so the cap and the rows cannot drift apart and
 * you never see a half row at the bottom.
 */
export function SimpleScrollableList({ children, rows, empty, count, className }: Props) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  return (
    <>
      <ul
        className={cls(styles.scrollBox, className)}
        style={{ ['--simpleScrollableList-rows' as string]: rows }}
      >
        {isEmpty && empty !== undefined ? <li className={styles.emptyRow}>{empty}</li> : children}
      </ul>
      {count !== undefined && <p className={styles.countLine}>{count}</p>}
    </>
  )
}
