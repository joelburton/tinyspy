// cs-unmet

import type { KeyboardEvent, ReactNode, Ref } from 'react'
import { IconMenuChevron } from '../icons/icons'
import styles from './MenuTrigger.module.css'

type Props = {
  // The identity element the menu hangs off — an app or game logo.
  logo: ReactNode
  isOpen: boolean
  // The popover's id, for `aria-controls`.
  popoverId: string
  // The trigger's accessible name.
  label: string
  onClick: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  ref: Ref<HTMLButtonElement>
}

/**
 * The button that opens the menu: the caller's logo with a down-chevron hugging
 * its right. The chevron is the "this opens a menu" affordance and is not
 * optional, which is why `<Menu>` takes a logo rather than a whole trigger.
 */
export function MenuTrigger({ logo, isOpen, popoverId, label, onClick, onKeyDown, ref }: Props) {
  return (
    <button
      type="button"
      ref={ref}
      className={styles.trigger}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={popoverId}
      aria-label={label}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span className={styles.triggerRow}>
        {logo}
        {/* 3, not the set's default 2: at this size a default-weight chevron
            thins out against the logo instead of reading as its own mark. */}
        <IconMenuChevron className={styles.chevron} strokeWidth={3} aria-hidden />
      </span>
    </button>
  )
}
