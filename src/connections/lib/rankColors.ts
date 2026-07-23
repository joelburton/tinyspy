import type { CategoryRank } from './board'

/**
 * Per-rank background color tokens. NYT's yellow / green / blue
 * / purple band colors map to rank 0..3 (increasing difficulty).
 * The actual color values live in
 * [src/connections/theme.css](../theme.css) under `--connections-rank-N`;
 * this map just translates the rank to the CSS-variable lookup.
 *
 * Consumed by `<Board>` (the matched-category strips
 * above the tile grid) and `<HintList>` (per-row swatch). Lives
 * in its own file so it can be imported alongside components
 * without tripping Vite Fast Refresh's "components-only file"
 * rule.
 */
export const RANK_TOKEN: Record<CategoryRank, string> = {
  0: 'var(--connections-rank-0)',
  1: 'var(--connections-rank-1)',
  2: 'var(--connections-rank-2)',
  3: 'var(--connections-rank-3)',
}
