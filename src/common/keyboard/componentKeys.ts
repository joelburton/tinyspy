// cs-unmet

import { useEffect, useSyncExternalStore } from 'react'
import { matches, type KeyPress, type KeySpec } from '../actions/chord'

/**
 * THE KEYS A COMPONENT HANDLES FOR ITSELF — a selection list's arrows, a tab
 * ring's Tab, Escape closing a panel — which are not actions, so the action
 * registry cannot list them.
 *
 * An action is a command the page offers wherever focus is; these belong to
 * the thing that has focus or is open, and answer only there. They still get
 * one row each here, for the same reason an action does: the handler matches
 * against the row's keys (`pressed`), so the key Help teaches, the key
 * `gmake dev-keys` prints and the key that works are one entry and cannot
 * disagree.
 *
 * `inHelp` says whether Help's key list teaches the row. It does for a key the
 * page itself answers — the club page's lists, Escape — and the component
 * OFFERS that row while it is live (`useComponentKeys`), which is how Help
 * knows it is here. A row that only works inside something Help cannot be open
 * beside, like an open menu, is not taught and needs no offering. A guard
 * (`src/guards/componentKeys.test.ts`) holds every hand-written key handler in
 * `src/` to matching through a row here, or to a stated exemption.
 */
export type ComponentKeySpec = {
  // What the key does, as Help's list says it.
  label: string
  // Every key that does it, the first one shown — the same shape as an
  // action's keys, and matched by the same function.
  keys: KeySpec[]
  // Does Help's key list teach it?
  inHelp: boolean
}

/** A named key with ⇧ up — the plain press. */
const named = (key: string, label: string, shift = false): KeySpec => ({ key, shift, label })

/** Tab and ⇧Tab: both directions round a ring. Shared by every row that is a
 *  ring, whatever its caller calls the stops. */
const TAB_KEYS: KeySpec[] = [named('Tab', '⇥'), named('Tab', '⇧⇥', true)]

/** Escape, and the backtick that stands in for it on a keyboard without one
 *  (`useBacktickEscape`, which translates one into the other). */
export const ESCAPE: KeySpec = named('Escape', 'Esc')
// ⇧ stated, although a character chord usually leaves it out: a layout that
// makes the backtick with ⇧ is typing a character, not asking for Escape.
export const BACKTICK: KeySpec = { key: '`', shift: false, label: '`' }

export const COMPONENT_KEYS = {
  // ─── A selection list — the club page's two, the home page's one ────────
  'keys-list-move': { label: 'Move through the list', keys: [named('ArrowUp', '↑'), named('ArrowDown', '↓')], inHelp: true },
  'keys-list-ends': { label: 'First / last row', keys: [named('Home', 'Home'), named('End', 'End')], inHelp: true },
  'keys-list-page': { label: 'Move a page', keys: [named('PageUp', 'PgUp'), named('PageDown', 'PgDn')], inHelp: true },
  'keys-list-open': { label: 'Open the row', keys: [named('Enter', '↵')], inHelp: true },
  // Caught so it cannot scroll the list, and does nothing: moving a cursor must
  // not consent to an action. Not taught — a key that does nothing is not a key.
  'keys-list-space': { label: 'Nothing (it does not choose)', keys: [named(' ', 'Space')], inHelp: false },

  // ─── Tab, round a ring (`useTabRing`) ───────────────────────────────────
  // What every ring matches. A ring worth teaching also offers one of the
  // rows below it, named by its caller for what its stops are.
  'keys-tab-ring': { label: 'Next stop', keys: TAB_KEYS, inHelp: false },
  'keys-next-list': { label: 'Next list', keys: TAB_KEYS, inHelp: true },
  'keys-next-field': { label: 'Next field', keys: TAB_KEYS, inHelp: true },
  // A floating panel's text field answers Tab by blurring itself, which hands
  // the keyboard back to the page (`handOffKeyboardOnTab`).
  'keys-leave-field': { label: 'Back to the page', keys: [named('Tab', '⇥')], inHelp: false },

  // ─── Escape ─────────────────────────────────────────────────────────────
  'keys-close-panel': { label: 'Close the top panel', keys: [ESCAPE, BACKTICK], inHelp: true },

  // ─── Inside an open menu (`Menu`) ───────────────────────────────────────
  'keys-menu-open': { label: 'Open the menu', keys: [named('ArrowDown', '↓')], inHelp: false },
  'keys-menu-walk-down': { label: 'Next item', keys: [named('ArrowDown', '↓')], inHelp: false },
  'keys-menu-walk-up': { label: 'Previous item', keys: [named('ArrowUp', '↑')], inHelp: false },
  'keys-menu-in': { label: 'Open the submenu', keys: [named('ArrowRight', '→')], inHelp: false },
  'keys-menu-out': { label: 'Back out of the submenu', keys: [named('ArrowLeft', '←')], inHelp: false },
  'keys-menu-unwind': { label: 'Back one level, then close', keys: [ESCAPE], inHelp: false },
  // Both directions: the popover stops every key it gets, so a ⇧Tab left
  // unmatched here would walk native focus out of the menu.
  'keys-menu-leave': { label: 'Close the menu', keys: TAB_KEYS, inHelp: false },

  // ─── Forms ──────────────────────────────────────────────────────────────
  // `StandardForm`: Enter commits from anywhere in the form, not only from a
  // text box as the browser's own rule has it.
  'keys-form-commit': { label: 'Commit the form', keys: [named('Enter', '↵')], inHelp: false },
  // codenamesduet's clue form, a real form: Enter is its own submit.
  'keys-submit-clue': { label: 'Submit the clue', keys: [named('Enter', '↵')], inHelp: true },

  // ─── Crosswords' own overlays — focused inputs that answer for themselves ─
  'keys-rebus-commit': { label: 'Commit the rebus and move on', keys: [named('Enter', '↵')], inHelp: false },
  'keys-rebus-jump': { label: 'Commit the rebus and jump a clue', keys: TAB_KEYS, inHelp: false },
  'keys-rebus-cancel': { label: 'Cancel the rebus', keys: [ESCAPE], inHelp: false },
  'keys-number-jump-go': { label: 'Go to that clue number', keys: [named('Enter', '↵')], inHelp: false },
  'keys-number-jump-close': { label: 'Close the number jump', keys: [ESCAPE], inHelp: false },
  'keys-pick-date': { label: 'Pick that date', keys: [named('Enter', '↵')], inHelp: false },
} satisfies Record<string, ComponentKeySpec>

export type ComponentKeyId = keyof typeof COMPONENT_KEYS

/** Does this keystroke press one of the row's keys? The one way a component
 *  reads its own keys, so the row is the key. */
export function pressed(id: ComponentKeyId, e: KeyPress): boolean {
  return COMPONENT_KEYS[id].keys.some((key) => matches(key, e))
}

// The rows offered right now, one count per offer: two lists on one page offer
// the same rows and Help lists them once. Module-level for the same reason the
// action bindings are — the reader is Help's list, which sits in no subtree of
// the component offering.
const offers = new Map<ComponentKeyId, number>()
const listeners = new Set<() => void>()
let version = 0

function change(id: ComponentKeyId, by: 1 | -1): void {
  const count = (offers.get(id) ?? 0) + by
  if (count > 0) offers.set(id, count)
  else offers.delete(id)
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Offer these rows while mounted, and while `live` — so Help's key list and a
 * reader of the code both see the keys this component answers. Offering is not
 * what makes a key work; the component's own handler does that, matching with
 * `pressed`.
 *
 *     useComponentKeys(['keys-list-move', 'keys-list-open'], items.length > 0)
 */
export function useComponentKeys(ids: readonly ComponentKeyId[], live = true): void {
  const key = ids.join(' ')
  useEffect(
    function offerTheRows() {
      if (!live || key === '') return
      const offered = key.split(' ') as ComponentKeyId[]
      offered.forEach((id) => change(id, 1))
      return () => offered.forEach((id) => change(id, -1))
    },
    [key, live],
  )
}

/** The rows offered right now, in table order. Re-renders the caller when one
 *  is offered or withdrawn. */
export function useOfferedComponentKeys(): ComponentKeyId[] {
  useSyncExternalStore(subscribe, () => version)
  return (Object.keys(COMPONENT_KEYS) as ComponentKeyId[]).filter((id) => offers.has(id))
}
