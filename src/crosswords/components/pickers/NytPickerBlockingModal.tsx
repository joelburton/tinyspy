// cs-unmet

import { useState } from 'react'
import { BlockingModal } from '../../../common/components/floating-panels/BlockingModal'
import { CancelButton } from '../../../common/components/buttons/CancelButton'
import { SelectionList } from '../../../common/components/lists/SelectionList'
import { NYT_EARLIEST, WEEKDAYS } from '../../lib/nytDays'
import styles from './pickers.module.css'

/** Today as YYYY-MM-DD (the date box's max). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

type Props = {
  /** Chosen — a weekday, or an explicit date that overrides it. Exactly one is
   *  set, because the two answer the same question. */
  onPick: (choice: { weekday: number; date?: string } | { weekday?: undefined; date: string }) => void
  onClose: () => void
}

/**
 * **Pick a New York Times daily** (plans/areas/forms.md → F50
 * `puzzle-source-picks-in-a-dialog`).
 *
 * Two ways in, and they are not equals. The WEEKDAY is the normal path — an NYT
 * crossword's day is its difficulty, so it is a standing club choice, and the
 * server turns it into the most recent puzzle of that day nobody playing has
 * done. The DATE box is an override for "we want that exact one", and it
 * filters nothing: a date the club has already played starts a second game on
 * it rather than being refused.
 *
 * **Which date a weekday resolves to is not asked here.** It depends on the
 * player set, which lives in the setup form and can change after this closes —
 * so `PuzzleSourceField` owns that lookup and re-asks when the players change.
 * A date resolved once inside a modal you have shut would go quietly stale.
 */
export function NytPickerBlockingModal({ onPick, onClose }: Props) {
  const [date, setDate] = useState('')

  return (
    <BlockingModal
      title="New York Times"
      onClose={onClose}
      actions={<CancelButton onClick={onClose} />}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          Pick a weekday — that&rsquo;s the difficulty — and you&rsquo;ll get the most recent
          one nobody playing has done.
        </p>
        <div className={styles.shortListBox}>
          <SelectionList
            items={WEEKDAYS}
            rowKey={(w) => String(w.dow)}
            label="Weekday"
            autoFocus
            density="packed"
            // Choosing a weekday sends NO date: the two answer the same
            // question, and carrying one along would leave this control
            // silently inert.
            onActivate={(w) => onPick({ weekday: w.dow })}
            empty={null}
            renderRow={(w) => (
              <>
                <span className={styles.itemTitle}>{w.name}</span>
                <span className={styles.rowNote}>{w.note}</span>
              </>
            )}
          />
        </div>

        {/* The override. Enter in the box means the same as Enter on a row —
            choose and close — so the two ways in behave alike, rather than one
            of them needing a button the other does not have. */}
        <label className={styles.overrideLabel} htmlFor="nyt-date">
          Or play one exact date:
        </label>
        <input
          id="nyt-date"
          className={styles.search}
          type="date"
          aria-label="Puzzle date"
          min={NYT_EARLIEST}
          max={todayStr()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && date) {
              e.preventDefault()
              onPick({ date })
            }
          }}
        />
      </div>
    </BlockingModal>
  )
}
