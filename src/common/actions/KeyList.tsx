// cs-unmet

import { useBoundActions } from './useBoundAction'
import styles from './KeyList.module.css'

/**
 * The keys that work right here, listed at the bottom of Help.
 *
 * It is generated rather than written, which is the point: a hand-kept list
 * drifts the first time a key changes, and this one cannot, because it is the
 * same registrations the dispatcher fires. It shows every bound action that has
 * a key and is not hidden — its first key and what it is called at that moment.
 */
export function KeyList() {
  const rows = useBoundActions()
    .map((action) => ({ action, key: action.spec.keys?.[0], ...action.describe() }))
    .filter((row) => row.key !== undefined && row.state !== 'hidden')

  if (rows.length === 0) return null
  return (
    <div className={styles.keyList}>
      <h3 className={styles.heading}>Keys</h3>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.action.id} className={styles.row}>
            <dt className={styles.key}>{row.key!.label}</dt>
            <dd className={styles.what}>{row.label ?? row.action.spec.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
