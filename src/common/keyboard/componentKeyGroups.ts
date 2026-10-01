// cs-unmet

import { matches, type KeyPress, type KeySpec } from '../actions/chord'

/**
 * THE KEYS A COMPONENT HANDLES FOR ITSELF — a selection list's arrows, a tab
 * ring's Tab, Escape closing a panel — which are not actions, so the action
 * registry cannot list them.
 *
 * An action is a command the page offers wherever focus is; these belong to
 * the thing that has focus or is open, and answer only there. Each is a KEY
 * GROUP here — one thing a key does, and every key that does it (↑ and ↓ both
 * move through a list) — for the same reason an action has an entry: the
 * handler matches against the group's keys (`pressed`), so the key Help
 * teaches, the key `gmake dev-keys` prints and the key that works are one
 * entry and cannot disagree.
 *
 * `inHelp` says whether Help's key list teaches the group. It does for a key
 * the page itself answers — the club page's lists, Escape — and the component
 * OFFERS that group while it is live (`useOfferComponentKeyGroups`, in
 * `offeredComponentKeyGroupsStore.ts`), which is how Help knows it is here.
 * A group that only works inside something Help cannot be open beside, like
 * an open menu, is not taught and needs no offering. A guard
 * (`src/guards/componentKeyGroups.test.ts`) holds every hand-written key
 * handler in `src/` to matching through a key group here, or to a stated
 * exemption.
 */
export type ComponentKeyGroup = {
  // What the key does, as Help's list says it.
  label: string
  // Every key that does it, the first one shown — the same shape as an
  // action's keys, and matched by the same function.
  keys: KeySpec[]
  // Does Help's key list teach it?
  inHelp: boolean
}

/** A named key with ⇧ up — the plain press. */
function named(key: string, label: string, shift = false): KeySpec {
  return { key, shift, label }
}

/** Tab and ⇧Tab: both directions round a ring. Shared by every key group
 *  that is a ring, whatever its caller calls the stops. */
const TAB_KEYS: KeySpec[] = [named('Tab', '⇥'), named('Tab', '⇧⇥', true)]

/** Escape, and the backtick that stands in for it on a keyboard without one
 *  (`useBacktickEscape`, which translates one into the other). */
export const ESCAPE: KeySpec = named('Escape', 'Esc')
// ⇧ stated, although a character chord usually leaves it out: a layout that
// makes the backtick with ⇧ is typing a character, not asking for Escape.
export const BACKTICK: KeySpec = { key: '`', shift: false, label: '`' }

export const COMPONENT_KEYGROUPS = {
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
  // groups below it, named by its caller for what its stops are.
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
} satisfies Record<string, ComponentKeyGroup>

export type ComponentKeyGroupId = keyof typeof COMPONENT_KEYGROUPS

/** Does this keystroke press one of the group's keys? The one way a
 *  component reads its own keys, so the key group is the key. */
export function pressed(id: ComponentKeyGroupId, e: KeyPress): boolean {
  return COMPONENT_KEYGROUPS[id].keys.some((key) => matches(key, e))
}
