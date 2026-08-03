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
 * of that heading on desktop, and under the tab bar on mobile.
 *
 * Filters by **family, not variant**: one "Wordle" choice covers both
 * `wordle_coop` and `wordle_compete`, because the friends think in games ("show
 * me our Wordles"), not in manifest entries. That's exactly what
 * `baseGametype` is for — see docs/common.md → the sibling-manifest pattern.
 * The mode axis is already a separate filter on the other column, so nothing
 * is lost by collapsing the pair here.
 *
 * A native `<select>` rather than a second row of segmented buttons: this one
 * has as many choices as the club has played games (up to thirteen families),
 * which is a list, not a switch. Unlike ModeFilter it can't decline focus on
 * mousedown — a `<select>` needs the press to open its popup — so using it
 * does take focus off the games list and hide that list's keyboard cursor.
 * Clicking (or Tab-ing) back into the list restores it.
 */
export function GametypeFilter({ value, options, onChange }: Props) {
  return (
    <select
      className={styles.select}
      aria-label="Filter your games by game"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All games</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
