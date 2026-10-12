// cs-unmet

import type { GTeam } from '../types'
import { BandSquare } from './BandSquare'
import styles from './SoloCard.module.css'

/**
 * The solo card, over the table in coop beside the round: the three bands, green 1 over
 * amber 2 over red 3 as a row, a dark border on the one the timer sits on
 * (doc.md → The solo card (coop)). The penalties taken are the game's
 * scoresheet's to show, not the next word's. It only shows; the server moves
 * the timer at each reveal.
 */
export function SoloCard({ team }: { team: GTeam }) {
  return (
    <div data-testid="solo-card" className={styles.card}>
      {([1, 2, 3] as const).map((band) => (
        <BandSquare key={band} band={band} isCurrent={team.band === band}/>
      ))}
    </div>
  )
}
