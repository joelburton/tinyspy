// cs-met-connections

import type { CategoryRank } from './board'

/**
 * Per-rank fill tokens: NYT's yellow / green / blue / purple for rank 0..3
 * (increasing difficulty). The values live in `theme.css` as
 * `--connections-rank-N`; this map only spells the lookup, for a band's face
 * on the board and a hint row's swatch. Its own file so a component can
 * import it without tripping Vite Fast Refresh's components-only rule.
 */
export const RANK_TOKEN: Record<CategoryRank, string> = {
  0: 'var(--connections-rank-0)',
  1: 'var(--connections-rank-1)',
  2: 'var(--connections-rank-2)',
  3: 'var(--connections-rank-3)',
}
