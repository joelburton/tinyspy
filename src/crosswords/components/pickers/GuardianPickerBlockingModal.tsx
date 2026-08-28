// cs-unmet

import { useEffect, useRef } from 'react'
import { BlockingModal } from '../../../common/components/floating-panels/BlockingModal'
import { CancelButton } from '../../../common/components/buttons/CancelButton'
import { SelectionList } from '../../../common/components/lists/SelectionList'
import { GUARDIAN_SERIES } from '../../lib/setup'
import styles from './pickers.module.css'

type Props = {
  /** Chosen — the series slug. */
  onPick: (slug: string) => void
  onClose: () => void
}

/**
 * **Pick a Guardian series** (plans/areas/forms.md → F50
 * `puzzle-source-picks-in-a-dialog`).
 *
 * A LIST rather than the `<select>` + hint line this replaces. The hint is the
 * whole basis for choosing — Quick and Speedy are plain-definition puzzles and
 * the rest are cryptics, which is a bigger difference than any two rows of a
 * dropdown can show one at a time. Here every series carries its own character
 * on the row beside it.
 *
 * Only today's puzzle exists for a series, so there is nothing further to pick:
 * the series IS the choice, and Enter on it starts a game.
 */
export function GuardianPickerBlockingModal({ onPick, onClose }: Props) {
  // TAKE FOCUS, explicitly rather than through `SelectionList`'s `autoFocus`.
  //
  // That flag yields to anything already focused, which is right for a list on a
  // page and wrong here: you arrived by CLICKING a source button, so that button
  // holds focus — and it lives in the setup dialog, not in this modal. Escape is
  // answered by "the panel focus is in, else the topmost"
  // (`usePanelEscape`), so leaving focus behind means one Escape closes the
  // SETUP dialog, and this picker disappears with it because a field inside that
  // dialog is what renders it. Both gone, from one key.
  //
  // The list rather than Cancel, so the arrows work the moment it opens.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <BlockingModal
      title="Guardian"
      onClose={onClose}
      actions={<CancelButton onClick={onClose} />}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          Load most recent Guardian crossword.
        </p>
        <div className={styles.shortListBox}>
          <SelectionList
            items={GUARDIAN_SERIES}
            rowKey={(g) => g.slug}
            label="Guardian series"
            ref={listRef}
            density="packed"
            onActivate={(g) => onPick(g.slug)}
            empty={null}
            renderRow={(g) => (
              // STACKED, not side by side. `SelectionList`'s row is a flex ROW
              // and `.itemTitle` ellipsizes, so a long second column eats the
              // first — which put the series NAME under the ellipsis while its
              // description got the width. The name is what you are choosing by.
              <span className={styles.stacked}>
                <span className={styles.itemTitle}>{g.label}</span>
                <span className={styles.rowNote}>{g.hint}</span>
              </span>
            )}
          />
        </div>
      </div>
    </BlockingModal>
  )
}
