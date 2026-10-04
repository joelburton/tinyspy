// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

type Props = {
  tile: GTile
  // Absent when the tile cannot be tapped — a blank, or a board that is not
  // mine to touch: it takes no tap and wears no hover or press.
  onTap?: () => void
  // Its place in the tapped word, from 1; null when it is not on the path.
  step: number | null
  // A tapped tile, or one a typed letter has settled on: the picked edge.
  picked: boolean
  // A typed letter could still mean this tile: the same edge, held back.
  maybePicked: boolean
  // A refused word used this tile: it wears that answer's fill and ink while the
  // answer is up, and shakes once as it arrives (the parent remounts it per
  // refusal, which is what replays the shake).
  answer?: Outcome
}

/**
 * One tile of the board: its letters (`qu` for a two-letter tile), drawn
 * capitalized by CSS ("Qu"), or a faint "?" for a blank. **POINTER-ONLY**: no
 * `tabIndex`, no role — a focused tile would eat the Enter that submits.
 * `onMouseDown` is prevented so a tap does not select the letter. `data-tile`
 * (the tile's id) and `data-step` are the test handles.
 */
export function Tile({ tile, onTap, step, picked, maybePicked, answer }: Props) {
  return (
    <div
      className={cls(
        styles.tile,
        !onTap && styles.inert,
        answer && styles.answered,
        answer && OUTCOME_TO_VERDICT_CLASS[answer],
        answer && shared.verdictShake,
        picked && styles.picked,
        maybePicked && styles.maybePicked,
      )}
      data-tile={tile.id}
      data-step={step ?? undefined}
      onMouseDown={onTap ? (e) => e.preventDefault() : undefined}
      onClick={onTap}
    >
      <span className={tile.letters === null ? styles.blank : undefined}>
        {tile.letters ?? '?'}
      </span>
    </div>
  )
}
