import { cls } from '../../common/lib/cls'
import type { Board, CategoryRank } from '../lib/board'
import type { MatchedCategory } from '../hooks/useGame'
import styles from './PlayArea.module.css'

/**
 * Per-rank background color tokens. NYT's yellow / green / blue
 * / purple band colors map to rank 0..3 (increasing difficulty).
 * The actual color values live in
 * `src/wordknit/theme.css` under `--wordknit-rank-N`; this map
 * just translates the rank to the CSS-variable lookup.
 *
 * Lives here rather than in PlayArea because the band-rendering
 * concept is what cares about this mapping — moving it down with
 * the bands keeps PlayArea free of the wordknit-internal color
 * vocabulary.
 */
const RANK_TOKEN: Record<CategoryRank, string> = {
  0: 'var(--wordknit-rank-0)',
  1: 'var(--wordknit-rank-1)',
  2: 'var(--wordknit-rank-2)',
  3: 'var(--wordknit-rank-3)',
}

type Props = {
  /** Categories that have been resolved by a correct guess. Each
   *  renders as a solid colored band with name + tiles. PlayArea
   *  derives this from `useGame`'s `matchedCategories`. */
  matched: MatchedCategory[]
  /** Categories that were NOT matched at game-end (on loss). Pass
   *  the empty array (or omit) while the game is in progress;
   *  pass the unmatched categories on loss to render the reveal
   *  bands. Game-won state passes empty (everything matched). */
  unmatched?: Board['categories']
}

/**
 * The colored category bands above the tile grid.
 *
 *   - **Matched bands**: one per category resolved by a correct
 *     guess. Solid background, name + tiles displayed. Sorted by
 *     rank so colors appear in the conventional yellow → purple
 *     order regardless of resolution order.
 *   - **Unmatched bands (game-over only)**: the categories the
 *     team didn't resolve before losing. Rendered with the
 *     `bandRevealed` modifier so the styling can differentiate a
 *     "you found this" band from a "here's what you missed" band.
 *
 * Pure render. No state. The `matched` projection happens in
 * `useGame`; the `unmatched` filter happens in PlayArea (it's a
 * one-liner against the static board.categories).
 *
 * Why this is its own component: PlayArea stops needing to know
 * about RANK_TOKEN at all, and the matched/unmatched band
 * structure becomes a named concept rather than two inlined
 * .map() blocks.
 */
export function CategoryBands({ matched, unmatched = [] }: Props) {
  return (
    <>
      {matched
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((mc) => (
          <div
            key={mc.rank}
            className={styles.band}
            style={{ background: RANK_TOKEN[mc.rank] }}
          >
            <strong>{mc.name}</strong>
            <div className={styles.bandMembers}>{mc.tiles.join(' · ')}</div>
          </div>
        ))}

      {unmatched.map((c) => (
        <div
          key={c.rank}
          className={cls(styles.band, styles.bandRevealed)}
          style={{ background: RANK_TOKEN[c.rank] }}
        >
          <strong>{c.name}</strong>
          <div className={styles.bandMembers}>{c.tiles.join(' · ')}</div>
        </div>
      ))}
    </>
  )
}
