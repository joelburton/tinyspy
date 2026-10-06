// cs-unmet

import { Fragment } from 'react'
import type { GFacts } from '../types'
import styles from './StateLine.module.css'

/**
 * The game in one line of labeled numbers joined by bullets — "Found: 5 •
 * Deck remaining: 50 • Hints: 1": my side's facts, `gd.me` — the team's in
 * coop, my own in compete. Hints appear in coop only — compete has none to
 * spend.
 *
 * Drawn on two surfaces, the info column and the phone's status bar, which is
 * why it is one component: the two show different subsets but must never word
 * a count differently. There is deliberately **no count of the tiles face-up**:
 * they are right there to be looked at.
 *
 * A bullet between them, not a rule: this is a sentence of readouts, and a
 * vertical bar makes it look like a table that lost its grid.
 */
export function StateLine({
  facts,
  withTilesInDeck,
  withHints,
}: {
  facts: GFacts
  // The phone's bar sits beside a button and must never wrap, so it drops
  // "Deck remaining" — the longest and least urgent of the three.
  withTilesInDeck: boolean
  // Coop's only: a race has no hints to spend.
  withHints: boolean
}) {
  const items = [
    { label: 'Found', value: facts.nSetsFound },
    ...(withTilesInDeck ? [{
      label: 'Deck remaining',
      value: facts.nTilesInDeck,
    }] : []),
    ...(!withHints ? [] : [{
      label: 'Hints',
      value: facts.nHintsUsed,
    }]),
  ]
  return (
    <div className={styles.counts}>
      {items.map((item, i) => (
        <Fragment key={item.label}>
          {i > 0 && <span className={styles.dot}>•</span>}
          <span className={styles.count}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        </Fragment>
      ))}
    </div>
  )
}
