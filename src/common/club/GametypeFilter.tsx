// cs-blessed-club-page

import { FilterSelect } from '../lists/FilterSelect'
import type { GamesListFilter } from './useGamesListFilter'
import styles from './clubFilters.module.css'

type Props = {
  filter: GamesListFilter
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
 * many choices as the club has played families, which is a list, not a switch.
 *
 * **`<FilterSelect>`, not a native `<select>`** — the club page is not a "real
 * form" (docs/ui.md → Real forms), so its controls don't take focus and don't
 * wear focus rings. That is load-bearing here rather than only a look: a native
 * select must accept the press that opens its popup, which would take focus off
 * the games list directly below and blank that list's arrow-key cursor.
 * Declining the focus is what keeps the cursor, and it matches `ModeFilter`
 * beside it.
 */
export function GametypeFilter({ filter }: Props) {
  return (
    <FilterSelect
      label="Filter your games by game"
      value={filter.gametype}
      onChange={filter.setGametype}
      className={styles.closedSelect}
      options={[{ value: 'all', label: 'All games' }, ...filter.options]}
    />
  )
}
