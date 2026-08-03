import { MODE_LABEL } from '../../lib/games'
import styles from './clubFilters.module.css'

/** What the start-a-new-game list is filtered to. `'all'` is the default —
 *  no filtering — and the two others are manifest `mode` values verbatim,
 *  so filtering is a straight equality test on the manifest. */
export type ModeFilterValue = 'all' | 'coop' | 'compete'

const OPTIONS: { value: ModeFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  // The UI spells coop "Co-op" — from the single labels map, not inline
  // (see MODE_LABEL's docstring).
  { value: 'coop', label: MODE_LABEL.coop },
  { value: 'compete', label: MODE_LABEL.compete },
]

type Props = {
  value: ModeFilterValue
  onChange: (value: ModeFilterValue) => void
  /** Whether this is a solo club (handle starts with '='). Collapses the
   *  control to the always-selected "All" — see the docstring. */
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
 * **In a solo club, only "All" renders, permanently selected.** Mode is noise
 * with one player — the same call `<ModePill>` makes when it suppresses the
 * "Co-op" badge there — so offering to filter by it would be offering to
 * sort a distinction the page isn't drawing. The lone "All" stays rather than
 * the whole control vanishing, so the heading row keeps its shape and reads
 * as "showing everything" rather than as a missing feature. It's still a
 * button (not disabled, not a label): pressing it is a no-op that re-selects
 * what's already selected, which is exactly what pressing "All" does anywhere.
 */
export function ModeFilter({ value, onChange, soloClub }: Props) {
  const options = OPTIONS.filter((o) => !soloClub || o.value === 'all')
  return (
    <div className={styles.modeFilter} role="group" aria-label="Filter games by mode">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.modeOption}
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
