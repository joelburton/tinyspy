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
 * Hovering a square reveals a tooltip with the rank name + points threshold —
 * and on a touch device a TAP does it, through the sticky `:hover` phones apply
 * until you touch something else (measured; it is not a focus state). The
 * current rank's name renders as a label above the track so the player has a
 * vocabulary anchor ("you're at Solid; Genius is 35 points").
 *
 * The ladder's own colors (`--rank-fill` / `--rank-edge`) are shared by both
 * games — see the CSS module; only the type color `--rank-text` is aliased per
 * game in its `theme.css`. Pure derivation from
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
            // POINTER-ONLY — no tabIndex, no role, nothing focusable. A tier is
            // a READOUT, not a control: no handler, `cursor: default`, and seven
            // of them per bar (fourteen in the DOM, since the info column and
            // the mobile status bar each render one). The same rule the
            // definable words follow, and for the same reasons — see
            // common/theme.css → `.definable`.
            //
            // It carried `tabIndex={0}` until 2026-08-16, which trapped: a click
            // parked focus on the square, the NEXT keystroke promoted it to
            // `:focus-visible` (the browser re-evaluates that on any keyboard
            // interaction, even a key it never acts on), and the ring + tooltip
            // then stuck — because Tab can't move focus off it either, the
            // capture games swallowing Tab by design. Simply resuming play lit
            // it up. Nothing was lost by removing it: the tooltip was never
            // keyboard-reachable, since the only way to focus a square was to
            // click it, which is to hover it.
            <li
              key={name}
              className={cls(styles.tier, i <= idx && styles.achieved, isTarget && styles.target)}
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
