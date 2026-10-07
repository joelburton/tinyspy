// cs-blessed-rank-ladder

import { cls } from '@/common/utils/cls'
import { rankPoints, RANKS } from './rankLadder'
import styles from './RankBar.module.css'

type Props = {
  // The rank reached, and its name for the label above the track.
  rankIdx: number
  rankName: string
  // The required points: each tier's tooltip names what it takes.
  total: number
  /** The rank this game is played TO, when one was set — `setup.target_rank`
   *  (always in compete, optional in coop). Its square gets the goal outline.
   *  Null/absent = the open-ended hunt, no square marked. */
  targetIdx?: number | null
}

/**
 * The 7-square Start..Genius progress bar, for a game with a rank ladder.
 *
 * Each square represents one rank tier. Squares at or below the player's current
 * rank fill with the accent color; remaining squares stay hollow. (Squares, not
 * circles — colored circles are reserved for player identity; see the CSS.)
 * The current rank's name renders as a label above the track so the player has a
 * vocabulary anchor ("you're at Solid; Genius is 35 points").
 *
 * Each square names its own tier through the shared tooltip host, as a READOUT
 * rather than a control (`data-tooltip-on="readout"`): the bubble appears the
 * moment you hover, a tap reveals it on a phone, and pressing a square leaves
 * it up — because unlike a button, the bubble is the only thing a square has
 * to say. See `common/tooltips/doc.md` → Readouts.
 *
 * The ladder's own colors (`--rank-bar-fill-color` / `--rank-bar-edge-color`)
 * are the same wherever the bar appears — see the CSS module for why; only the
 * type color `--rank-text` is aliased per game in its `theme.css`.
 *
 * The rank is the caller's, as the server computed it (`common._rank_idx`):
 * the bar draws it and works none out. Only each tier's points come from
 * `rankLadder.ts` (`rankPoints`).
 */
export function RankBar({ rankIdx, rankName, total, targetIdx = null }: Props) {
  return (
    <div className={styles.rankBar}>
      <span className={styles.label}>{rankName}</span>
      <ol className={styles.track}>
        {RANKS.map((name, i) => {
          const pts = rankPoints(i, total)
          // The goal square keeps its outline after it fills — the fill and
          // the outline style different properties, so neither replaces the
          // other — and the bar still reads "this is what we were playing to"
          // at the end. Ranks BEYOND the target stay on the track rather than
          // being cropped, since a single big word can carry the score past
          // the goal that ended the game.
          const isTarget = i === targetIdx
          return (
            // POINTER-ONLY — no tabIndex, no role, nothing focusable. A tier is
            // a READOUT, not a control, and a tab stop here would be one per
            // square per bar with nothing to do at the end of it. Why that
            // matters is in `RankBar.test.tsx`, which pins it.
            <li
              key={name}
              className={cls(
                styles.tier,
                i <= rankIdx && styles.achieved,
                isTarget && styles.target
              )}
              data-tooltip={`${name} · ${pts} pts${isTarget ? ' · target' : ''}`}
              data-tooltip-on="readout"
            />
          )
        })}
      </ol>
    </div>
  )
}
