// cs-unmet

import type { CSSProperties } from 'react'
import { cls } from '@/common/utils/cls'
import type { Outcome } from '@/common/outcomes/outcomes'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/** What this screen knows about a tile, beyond the tile itself. */
type TileMarks = {
  // One of the tiles a typed letter matched more than one of: ringed red.
  isAmbiguous: boolean
  // The word a viewed past turn played: ringed green.
  isLit: boolean
  // "Something happened here" — a teammate's word before its answer shows, or
  // my refused tiles landing back.
  hasAttention: boolean
  // A teammate's answer on their tiles, once the attention flash has faded:
  // the outcome's own fill, and a refusal shakes. Null when there is none.
  answer: Outcome | null
}

/**
 * One tile of the stack, drawn at its place. Board decides its geometry, its
 * shade, where its letter sits, which marks it wears and whether a click lands;
 * this draws them.
 */
export function Tile({
  tile,
  placement,
  marks,
  isPickable,
  onClick,
}: {
  tile: GTile
  // Where the tile sits and how it is shaded: its box as shares of the
  // canvas, its layer, its depth fill, and the corner its letter is tucked
  // into so a covering tile doesn't hide it.
  placement: {
    left: string
    top: string
    size: string
    z: number
    fill: string
    justifyContent: CSSProperties['justifyContent']
    alignItems: CSSProperties['alignItems']
  }
  marks: TileMarks
  // A click lands: the tile is exposed, the board takes moves, and the server
  // hasn't already taken it.
  isPickable: boolean
  onClick: (tile: GTile) => void
}) {
  const answered = marks.answer !== null
  return (
    <button
      type="button"
      data-tile={tile.id}
      className={cls(
        styles.tile,
        marks.isAmbiguous && styles.flash,
        marks.isLit && styles.historyTile,
        // The answer landing here: the attention flash first, then the
        // outcome's color, and a refusal shakes once the color shows.
        marks.hasAttention && shared.attentionFlash,
        // Motion is the refusal channel, not a second verdict: only a word that
        // lost the turn shakes its tiles.
        marks.answer === 'lost' && shared.verdictShake,
      )}
      disabled={!isPickable}
      onClick={() => onClick(tile)}
      style={{
        left: placement.left,
        top: placement.top,
        width: placement.size,
        height: placement.size,
        zIndex: placement.z,
        // A tile wearing an answer takes that outcome's fill and its white ink,
        // exactly as a word's slots do below the board — the same event, the
        // same two colors, wherever you are sitting.
        background: answered ? `var(--outcomes-${marks.answer}-fill-color)` : placement.fill,
        ...(answered ? { color: 'var(--ink-onDark-color)' } : {}),
        cursor: isPickable ? 'pointer' : 'default',
        justifyContent: placement.justifyContent,
        alignItems: placement.alignItems,
      }}
    >
      {/* The letter is LIFTED above the attention flash: that mark is an
          absolutely-positioned overlay, and one of those paints over in-flow
          text — so without this the flash hides the letter it is pointing at
          (common/game-page/playArea.module.css). */}
      <span className={styles.letter}>{tile.letter}</span>
    </button>
  )
}
