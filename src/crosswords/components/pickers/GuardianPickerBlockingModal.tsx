// cs-unmet

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
  return (
    <BlockingModal
      title="Guardian"
      onClose={onClose}
      actions={<CancelButton onClick={onClose} />}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          Load today&rsquo;s Guardian crossword. <strong>Quick</strong> and{' '}
          <strong>Speedy</strong> are plain-definition puzzles; the rest are{' '}
          <strong>cryptics</strong> (each clue is wordplay + a definition).
        </p>
        <div className={styles.shortListBox}>
          <SelectionList
            items={GUARDIAN_SERIES}
            rowKey={(g) => g.slug}
            label="Guardian series"
            autoFocus
            density="packed"
            onActivate={(g) => onPick(g.slug)}
            empty={null}
            renderRow={(g) => (
              <>
                <span className={styles.itemTitle}>{g.label}</span>
                <span className={styles.rowNote}>{g.hint}</span>
              </>
            )}
          />
        </div>
      </div>
    </BlockingModal>
  )
}
