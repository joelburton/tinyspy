// cs-met-turn-log

import type { ComponentProps } from 'react'
import { ActorDot } from '../members/ActorMention'
import styles from './TurnLog.module.css'

/**
 * The turn-log "who" cell: the right-aligned `<td>` (the shared `.who` column)
 * wrapping the shared `<ActorDot>`. Every game's row ends this way, so the column
 * and the tag are single-sourced together. Props forward straight to `<ActorDot>`
 * (`actor` / `fallback` / `className`).
 */
export function TurnLogActor(props: ComponentProps<typeof ActorDot>) {
  return (
    <td className={styles.who}>
      <ActorDot {...props} />
    </td>
  )
}
