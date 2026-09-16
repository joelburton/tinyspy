// cs-unmet

import type { ReactNode } from 'react'
import { spentTiles, type Claim } from '../lib/spend'
import { TILE_POSITIONS } from '../lib/wheel'
import { Tile } from './Tile'
import styles from './Wheel.module.css'

type Props = {
  /** The 8 outer letters in their current display order — shuffled
   *  locally by the caller. */
  outerLetters: string[]
  /** The 1 mandatory center letter. */
  centerLetter: string
  /** Called when any letter is clicked, with WHICH of that letter's tiles was
   *  hit (its ordinal in render order). The caller appends the letter to the
   *  typed word and records the claim. */
  onLetterClick: (letter: string, ordinal: number) => void
  /** Per-letter counts of the typed word, lower-cased. Each occurrence SPENDS
   *  one same-letter tile — marked + inert — in the wheel's spend order (see
   *  the component doc). */
  typedCounts: Map<string, number>
  /** The tiles the player CLICKED, oldest first. They are spent before any
   *  fallback, so a clicked tile is always the one that goes dark. */
  claims: readonly Claim[]
  /** A control floated over the wheel's top-right (the Shuffle button). Rendered
   *  inside the shrink-wrapped `.floatAnchor` around the svg, so it hugs the
   *  VISUAL wheel. Anchoring to the column instead would strand it at the
   *  column's top, which the vertically-centered wheel no longer touches. */
  floatingControl?: ReactNode
}

/**
 * The 9-tile wheel: round boxes absolutely placed on a square sized in `--u`,
 * the wheel's coordinate unit (the box is 300 units across). Only wordwheel uses
 * this wheel, so it stays local; the geometry is shared with the PDF export.
 *
 * Render order (matches `TILE_POSITIONS`): center first, then the eight outer tiles
 * clockwise from the top; the parent (BoardCol) controls the shuffle of
 * `outerLetters` so the visual order changes on Shuffle. The geometry lives in
 * `lib/wheel.ts`, shared with the PDF export.
 *
 * Clicking a letter doesn't validate — it just appends the character to the typed
 * word (server validates on submit).
 *
 * SPEND ORDER: the wheel is a multiset, so typing a letter spends ONE of its
 * tiles — but nothing in the word says which. A CLICK does, and is honored: the
 * tile you hit is the tile that marks. What is left over falls to the tiles in
 * render order, the CENTER first when it carries the letter (the game rule: a
 * duplicated center is always the tile the mandatory use consumes), then outer
 * duplicates in their current display order. A shuffle can still swap WHICH
 * visual twin is marked, claimed or not — accepted: the twins are identical, and
 * the marked COUNT is always right. See `lib/spend.ts`. */

export function Wheel({
  outerLetters,
  centerLetter,
  onLetterClick,
  typedCounts,
  claims,
  floatingControl,
}: Props) {
  const letters = [centerLetter, ...outerLetters]
  const spent = spentTiles(letters, typedCounts, claims)
  // Each tile's ordinal among same-letter tiles, in render order — what a click
  // reports, so the claim survives a shuffle (a tile INDEX wouldn't).
  const ordinals: number[] = []
  {
    const seen = new Map<string, number>()
    for (const letter of letters) {
      const lower = letter.toLowerCase()
      const n = seen.get(lower) ?? 0
      ordinals.push(n)
      seen.set(lower, n + 1)
    }
  }
  return (
    <div className={styles.board}>
      <div className={styles.floatAnchor}>
        <div className={styles.grid} data-wheel>
          {letters.map((letter, i) => (
            <Tile
              key={`${letter}-${i}`}
              letter={letter}
              isCenter={i === 0}
              pos={TILE_POSITIONS[i] ?? TILE_POSITIONS[0]}
              disabled={spent.has(i)}
              onClick={() => onLetterClick(letter, ordinals[i] ?? 0)}
            />
          ))}
        </div>
        {floatingControl}
      </div>
    </div>
  )
}
