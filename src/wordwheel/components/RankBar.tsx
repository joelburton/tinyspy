import { cls } from '../../common/lib/util/cls'
import { currentRankIndex, rankPoints, RANKS } from '../lib/ranks'
import styles from './RankBar.module.css'

type Props = {
  score: number
  total: number
}

/**
 * The 7-square Start..Genius progress bar.
 *
 * Each square represents one rank tier. Squares at or below the
 * player's current rank fill with the accent color; remaining
 * squares stay hollow. (Squares, not circles — colored circles
 * are reserved for player identity; see RankBar.module.css.)
 * Hovering or focusing a square reveals a tooltip with the rank
 * name + points threshold.
 *
 * The current rank's name renders as a label above the track
 * — same idiom wordwheel-ws uses, so the player has a vocabulary
 * anchor ("you're at Solid; Genius is 35 points") without
 * needing to read the tooltip.
 *
 * Pure derivation from `score` + `total` via `currentRankIndex`
 * (TS port of shared/ranks.js); the FE never disagrees with
 * the SQL helper because both compute from the same constants.
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
