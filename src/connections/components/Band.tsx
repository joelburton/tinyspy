// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import { RANK_TOKEN } from '../lib/rankColors'
import styles from './Band.module.css'
import type { GCategory } from '../types'

/**
 * A category drawn across the board, one long tile: its name over its four
 * words, in its rank's color. A matched band and a revealed one look the
 * same.
 */
export function Band({
  cat,
  isFlashing,
}: {
  cat: GCategory
  // It just resolved under a teammate's hands: the attention flash.
  isFlashing: boolean
}) {
  const words = cat.tiles.map(t => t.word)
  return (
    <div
      // A band IS a tile — one long one — so it wears the shared `.tileFace`
      // and says what color it is by re-setting that face's tokens, exactly as
      // a state class does. `.band` is then only what makes it long: the
      // column span and the two stacked lines.
      className={cls(
        shared.tileFace,
        styles.band,
        isFlashing && shared.attentionFlash,
      )}
      style={{
        ['--tile-slot-fill-color' as string]: RANK_TOKEN[cat.rank],
        // The edge is the rank color stepped darker. A band is inert — never
        // picked, nothing refused on it — so nothing else ever claims its
        // border.
        ['--tile-slot-edge-color' as string]: `color-mix(in srgb, ${RANK_TOKEN[cat.rank]} 84%, #000)`,
        // --len drives the same auto-fit the tiles use (here for the band name).
        ['--len' as string]: cat.name.length,
      }}
    >
      <strong>{cat.name}</strong>
      <div className={styles.bandMembers}>{words.join(' · ')}</div>
    </div>
  )
}
