// cs-unmet

import { useEffect, useSyncExternalStore } from 'react'
import { COMPONENT_KEYGROUPS, type ComponentKeyGroupId } from './componentKeyGroups'

/**
 * Which component key groups (`COMPONENT_KEYGROUPS`) are live on this page
 * right now, for Help's key list. A component offers the groups it answers
 * while it is mounted (`useOfferComponentKeyGroups`); Help reads them
 * (`useOfferedComponentKeyGroups`). Offering is only for Help — the keys
 * themselves work through `pressed`.
 */

// How many components offer each component key group right now: two lists on
// one page offer the same groups and Help lists them once. Module-level for
// the same reason the action bindings are — the reader is Help's list, which
// sits in no subtree of the component offering.
const offers = new Map<ComponentKeyGroupId, number>()
// The component key groups offered right now, in table order — rebuilt as a
// new array on every change, so a reader sees a new list exactly when one is
// offered or withdrawn.
let offeredComponentKeyGroups: ComponentKeyGroupId[] = []
// A listener is a callback: each `useOfferedComponentKeyGroups()` caller adds
// one, and offering or withdrawing a group calls every one.
const listeners = new Set<() => void>()

/** Count one more offer of this key group (`+1`, a component offering it) or
 *  one fewer (`-1`, that component withdrawing it). A group stays offered while
 *  any offer stands. Rebuilds the offered list and tells every listener. */
function change(id: ComponentKeyGroupId, by: 1 | -1): void {
  const count = (offers.get(id) ?? 0) + by
  if (count > 0) offers.set(id, count)
  else offers.delete(id)
  const tableOrder = Object.keys(COMPONENT_KEYGROUPS) as ComponentKeyGroupId[]
  offeredComponentKeyGroups = tableOrder.filter((groupId) => offers.has(groupId))
  for (const listener of listeners) listener()
}

function getOfferedComponentKeyGroups(): ComponentKeyGroupId[] {
  return offeredComponentKeyGroups
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Offer these key groups while mounted, and while `live` — so Help's key list
 * and a reader of the code both see the keys this component answers. Offering
 * is not what makes a key work; the component's own handler does that,
 * matching with `pressed`.
 *
 *     useOfferComponentKeyGroups(
 *       ['keys-list-move', 'keys-list-open'],
 *       items.length > 0,
 *     )
 */
export function useOfferComponentKeyGroups(ids: readonly ComponentKeyGroupId[], live = true): void {
  const key = ids.join(' ')
  useEffect(
    function offerTheGroups() {
      if (!live || key === '') return
      const offered = key.split(' ') as ComponentKeyGroupId[]
      offered.forEach((id) => change(id, 1))
      return () => offered.forEach((id) => change(id, -1))
    },
    [key, live],
  )
}

/** The key groups offered right now, in table order. Re-renders the caller
 *  when one is offered or withdrawn. */
export function useOfferedComponentKeyGroups(): ComponentKeyGroupId[] {
  return useSyncExternalStore(subscribe, getOfferedComponentKeyGroups)
}
