import { cls } from '../../lib/util/cls'
import { currentRankIndex, rankPoints, RANKS } from '../../lib/game/rankLadder'
import styles from './RankBar.module.css'

type Props = {
  score: number
  total: number
}

/**
 * The 7-square Start..Genius progress bar, shared by spellingbee + wordwheel
 * (their per-game `RankBar` copies were identical bar the accent token).
 *
 * Each square represents one rank tier. Squares at or below the player's current
 * rank fill with the accent color; remaining squares stay hollow. (Squares, not
 * circles — colored circles are reserved for player identity; see the CSS.)
 * Hovering or focusing a square reveals a tooltip with the rank name + points
 * threshold. The current rank's name renders as a label above the track so the
 * player has a vocabulary anchor ("you're at Solid; Genius is 35 points").
 *
 * Colors come from the game's theme via `--rank-accent` / `--rank-accent-edge`
 * / `--rank-text` (aliased per game in its `theme.css`). Pure derivation from
 * `score` + `total` via `currentRankIndex`; the FE never disagrees with the SQL
 * `_rank_idx` because both compute from the same constants.
 */
export function RankBar({ score, total }: Props) {
  const idx = currentRankIndex(score, total)
  return (
    <div className={styles.rankBar}>
      <span className={styles.label}>{RANKS[idx]}</span>
      <ol className={styles.track}>
        {RANKS.map((name, i) => {
          const pts = rankPoints(i, total)
          return (
            <li
              key={name}
              className={cls(styles.tier, i <= idx && styles.achieved)}
              tabIndex={0}
              aria-label={`${name}, ${pts} points`}
            >
              <span className={styles.tooltip}>
                {name} · {pts} pts
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
