// cs-blessed-actions

import { useBoundActions } from './useBindAction'
import { COMPONENT_KEYGROUPS } from '../keyboard/componentKeyGroups'
import { useOfferedComponentKeyGroups } from '../keyboard/offeredComponentKeyGroupsStore'
import styles from './KeyList.module.css'

/**
 * The keys that work right here, listed at the bottom of Help. Place it once
 * in a help companion; it draws itself from the live bindings — every bound
 * action with a key that is not hidden, its first key and its words for this
 * moment — then the key groups offered on the page that Help teaches
 * (`keyboard/componentKeyGroups.ts`), and renders nothing when there are none.
 */
export function KeyList() {
  const rows = useBoundActions()
    .map((action) => ({ action, key: action.spec.keys?.[0], ...action.describe('help') }))
    .filter((row) => row.key !== undefined && row.state !== 'hidden')
  // One row per command, however many places offer it (`act-stop-game` is bound
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
  // arrows, a ring's Tab, Escape — which are key groups of
  // `COMPONENT_KEYGROUPS` rather than actions. Every key of the group is shown:
  // they are one group because they are one idea (↑ and ↓ both move).
  const offeredGroups =
    useOfferedComponentKeyGroups().filter((id) => COMPONENT_KEYGROUPS[id].inHelp)

  if (unique.length === 0 && offeredGroups.length === 0) return null
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
        {offeredGroups.map((id) => (
          <div key={id} className={styles.row}>
            <dt className={styles.key}>
              {COMPONENT_KEYGROUPS[id].keys.map((k) => k.label).join(' ')}
            </dt>
            <dd className={styles.what}>{COMPONENT_KEYGROUPS[id].label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
