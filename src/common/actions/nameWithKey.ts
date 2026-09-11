// cs-blessed-actions

import type { BoundAction } from './useBoundAction'

/**
 * A control's hover bubble: what it is called, with the action's key on the end.
 *
 *     nameWithKey('Shuffle the words', actShuffle)  //  'Shuffle the words · ⌥Z'
 *
 * The one place the app decides how a key is shown beside a name, so an action's
 * own button and a bespoke control (the round shuffle pill, a keycap) say it the
 * same way. An action with no key gets the name back unchanged.
 *
 * The key shown is the FIRST of the action's chords, which is the registry's
 * rule everywhere: a second chord is a second way to press it, not a second
 * thing to teach.
 */
export function nameWithKey(name: string, action: BoundAction): string {
  const chord = action.spec.keys?.[0]?.label
  return chord === undefined ? name : `${name} · ${chord}`
}
