import { MODE_LABEL } from '../../lib/games'

/**
 * The mode filter's vocabulary — its legal values and the buttons that offer
 * them. A plain module rather than part of `ModeFilter.tsx` because a component
 * file that also exports constants breaks Fast Refresh
 * (`react-refresh/only-export-components`), the same reason `turnCopy.tsx` and
 * `monthGrid.ts` sit apart from their consumers.
 *
 * It lives next to the control anyway: ClubPage needs the value list to
 * validate what `useStickyChoice` reads back out of localStorage, and deriving
 * that list from the rendered options is what keeps the two from drifting.
 */

/** What the start-a-new-game list is filtered to. `'all'` is the default —
 *  no filtering — and the two others are manifest `mode` values verbatim,
 *  so filtering is a straight equality test on the manifest. */
export type ModeFilterValue = 'all' | 'coop' | 'compete'

export const MODE_FILTER_OPTIONS: { value: ModeFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  // The UI spells coop "Co-op" — from the single labels map, not inline
  // (see MODE_LABEL's docstring).
  { value: 'coop', label: MODE_LABEL.coop },
  { value: 'compete', label: MODE_LABEL.compete },
]

/** Every legal value, derived from the options the control actually renders, so
 *  the validator can't drift from the buttons. */
export const MODE_FILTER_VALUES: readonly ModeFilterValue[] = MODE_FILTER_OPTIONS.map(
  (o) => o.value,
)
