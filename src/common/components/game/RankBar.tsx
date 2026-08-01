import { cls } from '../../lib/util/cls'
import { currentRankIndex, rankPoints, RANKS } from '../../lib/game/rankLadder'
import styles from './RankBar.module.css'

type Props = {
  score: number
  total: number
  /** The rank this game is played TO, when one was set — `setup.target_rank`
   *  (always in compete, optional in coop). Its square gets the goal outline.
   *  Null/absent = the open-ended hunt, no square marked. */
  targetIdx?: number | null
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
export function RankBar({ score, total, targetIdx = null }: Props) {
  const idx = currentRankIndex(score, total)
  return (
    <div className={styles.rankBar}>
      <span className={styles.label}>{RANKS[idx]}</span>
      <ol className={styles.track}>
        {RANKS.map((name, i) => {
          const pts = rankPoints(i, total)
          // The goal square keeps its outline after you reach it (`.target`
          // wins over `.achieved`), so the bar still reads "this is what we
          // were playing to" at terminal — and the ranks BEYOND the target
          // stay on the track rather than being cropped, since a single big
          // word can carry the score past the goal that ended the game.
          const isTarget = i === targetIdx
          return (
            <li
              key={name}
              className={cls(styles.tier, i <= idx && styles.achieved, isTarget && styles.target)}
              tabIndex={0}
              aria-label={`${name}, ${pts} points${isTarget ? ' — target' : ''}`}
            >
              <span className={styles.tooltip}>
                {name} · {pts} pts{isTarget ? ' · target' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
