import { cls } from '../lib/cls'
import { colorVarFor } from '../lib/memberColor'
import type { Member } from '../lib/games'
import styles from './ActorTag.module.css'

type Props = {
  /** The person who acted. `undefined`/`null` → the `fallback` name + a neutral
   *  disc (a departed member, or a row whose player hasn't loaded yet). Only the
   *  identity fields are needed, so any `Member`-ish value works. */
  actor?: Pick<Member, 'username' | 'color'> | null
  /** Name shown when `actor` is missing. */
  fallback?: string
  /** Merged onto the root — for positioning the tag in its row. */
  className?: string
}

/**
 * The shared **actor tag**: a person's name followed by their **identity disc**
 * (a ● in the member color) — the app-wide "who did this" marker (docs/ui.md →
 * "Player identity = a colored disc"). The disc carries the identity; the name
 * stays plain text, so the two never fight for the color.
 *
 * Presentational — the caller resolves the member (e.g. `players.find(…)`) and
 * positions the tag (the turn logs drop it in a right-aligned `<td>` or a flex
 * meta-row). Today it's the identity cluster in psychicnum's + connections's
 * `GameTurnLog`; it's meant to be the one place this cluster lives as more logs
 * adopt it.
 */
export function ActorTag({ actor, fallback = 'someone', className }: Props) {
  return (
    <span className={cls(styles.actorTag, className)}>
      <span className={styles.name}>{actor?.username ?? fallback}</span>
      <span
        className={styles.dot}
        style={{ color: colorVarFor(actor?.color) }}
        aria-hidden="true"
      >
        ●
      </span>
    </span>
  )
}
