// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/**
 * One faceup card: its letter, in the color of its kind — common, red or blue,
 * as the deck prints them — and a rare card's bonus in the corner. Nobody acts
 * on a card (a word is typed), so it is the shared inert face, with no hover
 * and no press.
 */
export function Tile({ tile }: { tile: GTile }) {
  return (
    <div className={cls(shared.tileFace, styles.tile, styles[`kind_${tile.bonus}`])}>
      <span className={styles.letter}>{tile.letter}</span>
      {tile.bonus > 0 && <span className={styles.bonus}>+{tile.bonus}</span>}
    </div>
  )
}
