// cs-unmet

import type { MenuRow } from './menuModel'

/**
 * One row the arrow keys can land on. Almost always a real row; the exception
 * is the mobile drill-down's "‹ Back" row, which is navigable and activatable
 * but isn't a row the caller supplied. Back is a row rather than a special case
 * so there is exactly ONE list of rows with focus in it, mobile or desktop —
 * doc.md → Intro to area.
 */
export type NavRow =
  | { kind: 'back' }
  | { kind: 'item'; row: MenuRow }

/**
 * The rows the keyboard is walking. With no submenu open, every row. With one
 * open, only its rows, in both presentations: on mobile they come after a Back
 * row, since the parent list is gone; on desktop the parent list stays visible
 * behind the flyout but is not navigable, as in every desktop menu.
 */
export function makeNavRows(
  flatRows: MenuRow[],
  openSubmenuParent: MenuRow | null,
  isMobile: boolean,
): NavRow[] {
  if (!openSubmenuParent) return flatRows.map((row) => ({ kind: 'item', row }))
  const back: NavRow[] = isMobile ? [{ kind: 'back' }] : []
  const children = (openSubmenuParent.children ?? []).map(
    (row): NavRow => ({ kind: 'item', row }),
  )
  return [...back, ...children]
}

/** The next enabled row from `current` in `direction`, wrapping at the ends;
 *  `current` itself when every row is disabled. The Back row is always
 *  enabled — it's the only way out of a drill-down. */
export function findNextEnabled(current: number, direction: 1 | -1, rows: NavRow[]): number {
  const n = rows.length
  if (n === 0) return 0
  for (let i = 1; i <= n; i++) {
    // Wraps a negative step too: JS's % keeps the dividend's sign.
    const next = (((current + direction * i) % n) + n) % n
    const row = rows[next]
    if (row.kind === 'back' || !row.row.disabled) return next
  }
  return current
}
