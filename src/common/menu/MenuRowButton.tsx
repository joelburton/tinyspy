// cs-unmet

import { cls } from '../utils/cls'
import { Dot } from '../members/Dot'
import { IconSubmenu } from '../icons/icons'
import type { NavRow } from './menuNav'
import styles from './MenuRowButton.module.css'

type Props = {
  row: NavRow
  // This row is the parent of the open submenu.
  isOpenParent: boolean
  // What the drill-down's Back row says after its "‹": the open submenu's name.
  backLabel: string
  // Called with the button as it mounts and null as it unmounts; absent for a
  // row the keyboard isn't walking.
  registerButton?: (button: HTMLButtonElement | null) => void
  onActivate: (button: HTMLElement) => void
}

/**
 * One row of the menu: a leading slot (an identity disc or an action's glyph),
 * the label, and at the right a shortcut or, on a submenu parent, a chevron.
 * The drill-down's Back row draws only its label. Why the leading slot is
 * reserved on every row is menu/doc.md → The icon gutter.
 */
export function MenuRowButton({ row, isOpenParent, backLabel, registerButton, onActivate }: Props) {
  const isBack = row.kind === 'back'
  const item = row.kind === 'item' ? row.row : null
  const isSubmenuParent = item?.children != null
  const isDisabled = item?.disabled ?? false

  return (
    <button
      type="button"
      ref={registerButton}
      className={cls(styles.item, isBack && styles.itemBack, isOpenParent && styles.itemOpen)}
      role="menuitem"
      // Which action this row is, the same handle `<ActionButton>` writes
      // (actions/doc.md). A submenu parent names a grouping, so it gets none.
      data-action={item && !isSubmenuParent ? item.id : undefined}
      aria-disabled={isDisabled || undefined}
      disabled={isDisabled}
      aria-haspopup={isSubmenuParent ? 'menu' : undefined}
      aria-expanded={isSubmenuParent ? isOpenParent : undefined}
      onClick={(e) => onActivate(e.currentTarget)}
    >
      {!isBack && (
        <span className={styles.itemIconSlot} aria-hidden>
          {item?.dot ? <Dot color={item.dot} /> : item?.icon ? <item.icon size="1em" /> : null}
        </span>
      )}
      <span>{isBack ? `‹ ${backLabel}` : item?.label}</span>
      {item?.shortcut && <span className={styles.itemShortcut}>{item.shortcut}</span>}
      {isSubmenuParent && (
        <span className={styles.itemChevron} aria-hidden>
          <IconSubmenu size="1em" />
        </span>
      )}
    </button>
  )
}
