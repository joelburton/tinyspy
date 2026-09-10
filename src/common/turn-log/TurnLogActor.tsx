// cs-unmet

import type { ComponentProps } from 'react'
import { ActorDot } from '../members/ActorMention'
import styles from './TurnLog.module.css'

/**
 * The turn-log "who" cell: the right-aligned `<td>` (the shared `.who` column)
 * wrapping the shared `<ActorDot>`. Every game's GameTurnLog row repeats this
 * exact `<td class="who"><ActorDot/></td>`
 * pairing (psychicnum had already wrapped it locally as `whoCell`), so this
 * single-sources the column + tag together. Props forward straight to
 * `<ActorDot>` (`actor` / `fallback` / `className`).
 */
export function TurnLogActor(props: ComponentProps<typeof ActorDot>) {
  return (
    <td className={styles.who}>
      <ActorDot {...props} />
    </td>
  )
}
