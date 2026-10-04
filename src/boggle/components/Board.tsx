// cs-unmet

import { useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import type { Outcome } from '@/common/outcomes/outcomes'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBindAction } from '@/common/actions/useBindAction'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import type { GTile } from '../types'

/** The tiles' indices in the order they are drawn, row by row, once the board
 *  has been turned a quarter clockwise this many times. One turn draws the
 *  bottom-left tile at the top-left; each letter stays upright. */
function drawOrder(side: number, quarterTurns: number): number[] {
  let order = Array.from({ length: side * side }, (_, i) => i)
  for (let t = 0; t < quarterTurns; t++) {
    order = order.map((_, k) => order[(side - 1 - (k % side)) * side + ((k / side) | 0)]!)
  }
  return order
}

/** What a tile draws: its letters with the first capitalized ("Qu"), or a
 *  faint "?" for a blank. */
function shownLetters(tile: GTile): string {
  return tile.letters === null ? '?' : tile.letters[0]!.toUpperCase() + tile.letters.slice(1)
}

/**
 * The board: the square of tiles, and a floating Rotate control over its
 * top-right. It owns the **rotation** — a view-only quarter turn on this
 * player's screen, never persisted or shared: the tiles change places, each
 * letter stays upright. Every mark arrives as tile ids, so a turn moves the
 * marks with their tiles.
 */
export function Board({
  tiles,
  boardSideSize,
  marks,
  isInteractive,
  onTileTap,
}: {
  // The puzzle's tiles, row by row (`gd.puzzle.tiles`).
  tiles: readonly GTile[]
  boardSideSize: number
  marks: {
    // The tapped path, in the order tapped.
    pathIds: readonly string[]
    // A typed word's tiles: the ones a letter has settled on, and the ones a
    // letter still could mean.
    settledIds: ReadonlySet<string>
    maybeIds: ReadonlySet<string>
    // A refused word's tiles while its answer is up, and the outcome they wear.
    // The nonce keys them, so refusing the same word again replays the shake.
    refused: { ids: ReadonlySet<string>; outcome: Outcome; nonce: number } | null
  }
  // The board responds to me; when false no tile takes a tap.
  isInteractive: boolean
  onTileTap: (tile: GTile) => void
}) {
  const [quarterTurns, setQuarterTurns] = useState(0)
  const drawn = useMemo(
    () => drawOrder(boardSideSize, quarterTurns).map((i) => tiles[i]!),
    [tiles, boardSideSize, quarterTurns],
  )

  // A fresh visual scan of the SAME board, never a move: it writes nothing and
  // reaches nobody else, so it stays active once the game has ended.
  const actRotate = useBindAction('act-rotate', {
    describe: () => 'active',
    run: () => setQuarterTurns((t) => (t + 1) % 4),
  })

  return (
    <div className={cls(shared.boardSeal, styles.grid)}>
      {drawn.map((tile) => {
        const isBlank = tile.letters === null
        const step = marks.pathIds.indexOf(tile.id)
        const isRefused = marks.refused?.ids.has(tile.id) ?? false
        // A tapped path is the player's own choice; a typed word's tiles light
        // only while nothing is tapped.
        const isTyping = marks.pathIds.length === 0
        return (
          <div
            // A CSS animation runs once per mount, so a refused tile is keyed by
            // the raise: refusing the same word again remounts it.
            key={isRefused ? `${tile.id}#${marks.refused!.nonce}` : tile.id}
            className={cls(
              styles.tile,
              isRefused && styles.answered,
              isRefused && OUTCOME_TO_VERDICT_CLASS[marks.refused!.outcome],
              isRefused && shared.verdictShake,
              isBlank && styles.tileBlank,
              (step >= 0 || (isTyping && marks.settledIds.has(tile.id))) && styles.picked,
              isTyping && marks.maybeIds.has(tile.id) && styles.maybePicked,
            )}
            // The test handle; `data-step` is the tile's place in the tapped word.
            data-boggle-tile
            data-step={step >= 0 ? step + 1 : undefined}
            // POINTER-ONLY: a tile is never focusable, so a focused tile cannot
            // eat the Enter that submits. preventDefault stops a click selecting
            // the letter.
            onMouseDown={isBlank ? undefined : (e) => e.preventDefault()}
            onClick={isBlank || !isInteractive ? undefined : () => onTileTap(tile)}
          >
            <span className={isBlank ? styles.blank : undefined}>{shownLetters(tile)}</span>
          </div>
        )
      })}
      {/* INSIDE the grid, its position anchor, so it hugs the board rather than
          the column. */}
      <ShuffleButton action={actRotate} tooltip="Rotate board" className={shared.floatingShuffle} />
    </div>
  )
}
