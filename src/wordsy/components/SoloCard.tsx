// cs-unmet

import type { GTeam } from '../types'
import { BandSquare } from './BandSquare'
import styles from './SoloCard.module.css'

/**
 * The solo card, beside the entry in coop: the three bands, green 1 over
 * amber 2 over red 3 as a row, a dark border on the one the timer sits on,
 * and a −2 mark for each penalty taken (plans/wordsy.md → Solo). It only
 * shows; the server moves the timer at each reveal.
 */
export function SoloCard({ team }: { team: GTeam }) {
  return (
    <div data-testid="solo-card" className={styles.card}>
      {([1, 2, 3] as const).map((band) => (
        <BandSquare key={band} band={band} isCurrent={team.band === band}/>
      ))}
      {team.nPenalties > 0 && (
        <span className={styles.penalties}>
          {Array.from({ length: team.nPenalties }, (_, i) => (
            <span key={i} className={styles.penalty}>−2</span>
          ))}
        </span>
      )}
    </div>
  )
}
