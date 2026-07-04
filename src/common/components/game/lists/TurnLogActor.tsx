import type { ComponentProps } from 'react'
import { ActorTag } from './ActorTag'
import styles from './TurnLog.module.css'

/**
 * The turn-log "who" cell: the right-aligned `<td>` (the shared `.who` column)
 * wrapping the shared `<ActorTag>`. Every GameTurnLog / scrabble PlayLog /
 * stackdown FoundWords row repeats this exact `<td class="who"><ActorTag/></td>`
 * pairing (psychicnum had already wrapped it locally as `whoCell`), so this
 * single-sources the column + tag together. Props forward straight to
 * `<ActorTag>` (`actor` / `fallback` / `className`).
 */
export function TurnLogActor(props: ComponentProps<typeof ActorTag>) {
  return (
    <td className={styles.who}>
      <ActorTag {...props} />
    </td>
  )
}
