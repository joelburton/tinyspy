// cs-unmet

import { DotActor } from '@/common/members/ActorMention'
import type { GEvent } from '../types'
import { Tile } from './Tile'
import styles from './LastSet.module.css'

/**
 * The last set taken, drawn as three small tiles.
 *
 * **Anyone's claim, in both modes**, tagged with the finder's identity dot. The
 * panel answers "what just disappeared?" — and on a shared table the tiles
 * usually left because someone ELSE took them, so scoping it to the viewer
 * would fall silent exactly when the board changed under them. In compete that
 * is not a leak either: everyone watched those three tiles go.
 *
 * The slot is **reserved from the first render** — the panel keeps its height
 * with nothing in it — so the first claim of the game doesn't shove the whole
 * info column downwards.
 */
export function LastSet({ claim }: { claim: GEvent | null }) {

  return (
    <div className={styles.panel}>
      <div className={styles.label}>
        {/* Always "Last set", never "Your last set" — in coop the panel shows
            whoever found it, so the possessive would say the opposite of what
            the panel means, and in compete (where it IS only yours) "Last set"
            is still true. Who found it is named beside it instead, in EVERY
            mode including solo: one shape for the line means it never has to be
            re-read as the roster changes. */}
        <span>Last set{claim ? ':' : ''}</span>
        {claim && <DotActor actor={claim.by} fallback="Someone" show="both" />}
      </div>
      <div className={styles.tiles}>
        {claim
          ? claim.tiles.map((tile) => (
              <div key={tile.id} className={styles.mini}>
                <Tile tile={tile} readOnly />
              </div>
            ))
          : /* Three empty frames rather than nothing: they hold the slot open at
               exactly the height the real tiles will need, and they read as
               "this is where a set will appear" instead of as a gap. */
            [0, 1, 2].map((i) => <div key={i} className={styles.placeholder} />)}
      </div>
    </div>
  )
}
