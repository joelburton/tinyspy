import { MODE_FILTER_OPTIONS, type ModeFilterValue } from './modeFilterOptions'
import { cls } from '../../lib/util/cls'
import styles from './clubFilters.module.css'

type Props = {
  value: ModeFilterValue
  onChange: (value: ModeFilterValue) => void
  /** Whether this is a solo club (handle starts with '='). Renders nothing —
   *  see the docstring. */
  soloClub: boolean
}

/**
 * The "All | Co-op | Compete" segmented filter over ClubPage's
 * start-a-new-game list. Sits at the right of the "Start a new game" heading
 * on desktop, and under the tab bar on mobile.
 *
 * Three toggle BUTTONS (`aria-pressed`) rather than radios or an ARIA tabs
 * pattern — the same shape, and the same reasoning, as ClubPage's mobile tab
 * bar: exactly one is pressed at a time, and pressed-ness is the whole state.
 *
 * **A solo club gets no filter at all.** Mode is noise with one player — the
 * same call `<ModePill>` makes when it suppresses the "Co-op" badge there — so
 * offering to filter by it would be offering to sort a distinction the page
 * isn't drawing. A lone always-selected "All" was the first shape of that, and
 * it just left a button that did nothing; the heading row is happier with the
 * space. (ClubPage still pins the effective mode to `all` for a solo club, so
 * nothing can be left filtered by a control that isn't on screen.)
 */
export function ModeFilter({ value, onChange, soloClub }: Props) {
  if (soloClub) return null
  return (
    <div className={styles.modeFilter} role="group" aria-label="Filter games by mode">
      {MODE_FILTER_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cls('button', styles.modeOption)}
          aria-pressed={value === o.value}
          // Don't let the press MOVE FOCUS off the start list. That list is a
          // keyboard tab stop holding the Up/Down cursor (ClubPage's
          // `focusedList`), and it sits directly under this control — taking
          // focus here would blank the cursor ring every time you narrowed the
          // list you were about to arrow through. Same trick, same reason, as
          // StartGameButtons' own buttons; `click` still fires.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
