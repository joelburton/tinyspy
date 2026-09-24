// cs-blessed-actions

import { useBoundActions } from './useBoundAction'
import { COMPONENT_KEYS, useOfferedComponentKeys } from '../keyboard/componentKeys'
import styles from './KeyList.module.css'

/**
 * The keys that work right here, listed at the bottom of Help. Place it once
 * in a help companion; it draws itself from the live bindings — every bound
 * action with a key that is not hidden, its first key and its words for this
 * moment — then the component keys offered on the page that Help teaches
 * (`keyboard/componentKeys.ts`), and renders nothing when there are none.
 */
export function KeyList() {
  const rows = useBoundActions()
    .map((action) => ({ action, key: action.spec.keys?.[0], ...action.describe('help') }))
    .filter((row) => row.key !== undefined && row.state !== 'hidden')
  // One row per command, however many places offer it (`act-end-game` is bound
  // by the game and again by the page for the pause overlay): the first binding
  // in stack order keeps its row — it is the one the dispatcher would fire —
  // and any later binding of the same id is dropped.
  const seen = new Set<string>()
  const unique = rows.filter((row) => {
    if (seen.has(row.action.id)) return false
    seen.add(row.action.id)
    return true
  })

  // Then the keys a component on the page answers for itself — a list's
  // arrows, a ring's Tab, Escape — which are rows of `COMPONENT_KEYS` rather
  // than actions. Every key of the row is shown: they are one row because they
  // are one idea (↑ and ↓ both move).
  const componentRows = useOfferedComponentKeys().filter((id) => COMPONENT_KEYS[id].inHelp)

  if (unique.length === 0 && componentRows.length === 0) return null
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
        {componentRows.map((id) => (
          <div key={id} className={styles.row}>
            <dt className={styles.key}>{COMPONENT_KEYS[id].keys.map((k) => k.label).join(' ')}</dt>
            <dd className={styles.what}>{COMPONENT_KEYS[id].label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
