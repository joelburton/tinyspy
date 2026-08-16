import { Fragment } from 'react'
import styles from './PlayArea.module.css'

/**
 * The game's readouts, as one labelled number each, joined by bullets.
 *
 * Rendered on **two surfaces** — the info column's state line on desktop, and
 * the mobile status bar above the board — which is why it is a component rather
 * than markup in either. The two show different SUBSETS (the bar drops "Deck
 * remaining" to make room for the hint button on a phone's width), but they must
 * never differ in how a count is worded, styled or separated, and a copy in each
 * file is how that drifts.
 *
 * A bullet between them, not a rule: this is a sentence of readouts, and a
 * vertical bar makes it look like a table that lost its grid.
 *
 * WHICH counts each surface shows, and the hint button's label, live in
 * `lib/readouts.ts` — this file may export only components, or Fast Refresh
 * stops working for it (`react-refresh/only-export-components`).
 */
export function Counts({ items }: { items: { label: string; value: number }[] }) {
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
