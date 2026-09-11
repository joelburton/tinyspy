// cs-audited-actions

import { useBoundActions } from './useBoundAction'
import styles from './KeyList.module.css'

/**
 * The keys that work right here, listed at the bottom of Help.
 *
 * It is generated rather than written, which is the point: a hand-kept list
 * drifts the first time a key changes, and this one cannot, because it is the
 * same registrations the dispatcher fires. It shows every bound action that has
 * a key and is not hidden — its first key and what it is called at that moment.
 *
 * ONE ROW PER COMMAND, however many places offer it. An action can be bound
 * twice: `act-end-game` is, by the game and again by the page for the pause
 * overlay, which the play area is unmounted behind. They are written so they
 * are never live together, but that is two files agreeing rather than a
 * guarantee — and a list that answers "which keys work here" should say a key
 * once regardless. The FIRST binding in stack order wins the words, which is
 * the one the dispatcher would fire.
 */
export function KeyList() {
  const rows = useBoundActions()
    .map((action) => ({ action, key: action.spec.keys?.[0], ...action.describe() }))
    .filter((row) => row.key !== undefined && row.state !== 'hidden')
  // One row per command: the first binding in stack order keeps its row and
  // any later binding of the same id is dropped.
  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    if (seen.has(row.action.id)) return false
    seen.add(row.action.id)
    return true
  })

  if (unique.length === 0) return null
  return (
    <div className={styles.keyList}>
      <h3 className={styles.heading}>Keys</h3>
      <dl className={styles.rows}>
        {unique.map((row) => (
          <div key={row.action.id} className={styles.row}>
            <dt className={styles.key}>{row.key!.label}</dt>
            <dd className={styles.what}>{row.label ?? row.action.spec.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
