import { FilterSelect } from '../game/FilterSelect'
import styles from './clubFilters.module.css'

/** One dropdown choice: a gametype FAMILY (`manifest.baseGametype`) labelled
 *  with its brand (`manifest.name`). */
export type GametypeOption = { value: string; label: string }

type Props = {
  /** The selected `baseGametype`, or `'all'`. */
  value: string
  /** The families present in the list being filtered, in display order.
   *  Excludes the `'all'` choice, which this component always renders first. */
  options: GametypeOption[]
  onChange: (value: string) => void
}

/**
 * The gametype dropdown over ClubPage's "Your games" list. Sits at the right
 * of that heading on desktop, and at the right of the filter row under the tab
 * bar on mobile.
 *
 * Filters by **family, not variant**: one "Wordle" choice covers both
 * `wordle_coop` and `wordle_compete`, because the friends think in games ("show
 * me our Wordles"), not in manifest entries. That's exactly what
 * `baseGametype` is for — see docs/common.md → the sibling-manifest pattern.
 * The mode axis is already a separate filter on the other column, so nothing
 * is lost by collapsing the pair here.
 *
 * A dropdown rather than a second row of segmented buttons: this one has as
 * many choices as the club has played games (up to thirteen families), which is
 * a list, not a switch.
 *
 * **`<FilterSelect>`, not a native `<select>`** — the club page is not a "real
 * form" (docs/ui.md → Real forms), so its controls don't take focus and don't
 * wear focus rings. That's also a bug fix, not only a look: a native select has
 * to accept the press that opens its popup, so it stole focus from the games
 * list along with that list's keyboard cursor, and `ClubPage` needed a
 * hand-focus-back on change to cope. That hand-back never ran when you re-picked
 * the option already selected (no `change` event fires), leaving the games list
 * without its arrow-key cursor until you clicked it again. Declining focus in
 * the first place removes the workaround and the hole together — and matches
 * `ModeFilter` beside it, which already declines focus on mousedown.
 */
export function GametypeFilter({ value, options, onChange }: Props) {
  return (
    <FilterSelect
      label="Filter your games by game"
      value={value}
      onChange={onChange}
      className={styles.filterTrigger}
      options={[{ value: 'all', label: 'All games' }, ...options]}
    />
  )
}
