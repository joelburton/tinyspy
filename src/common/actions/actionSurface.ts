// cs-blessed-actions

import type { AppIcon } from '../icons/icons'
import { nameWithKey } from './nameWithKey'
import type { BoundAction } from './useBoundAction'

/** What a control needs in order to BE an action: what to draw, and the props
 *  that make its `<button>` behave like one. */
export type ActionSurface = {
  // The action does not apply right now — draw nothing at all.
  hidden: boolean
  // What it is called this moment.
  label: string
  // The face it wears this moment — a toggle's two faces come through here.
  icon?: AppIcon
  // Spread onto the `<button>`: it fires the action, grays when the action
  // says so or while a run is out, says which action it is, and carries the
  // bubble — the action's reason for this moment, else its name with the key
  // on the end.
  buttonProps: {
    disabled: boolean
    onClick: () => void
    'aria-label': string
    'data-action': string
    'data-tooltip': string
  }
}

/**
 * Drive a BESPOKE control from a bound action.
 *
 * `<ActionButton>` is the ordinary way to place an action; this is for the
 * controls that are deliberately not standard buttons — the board's round
 * shuffle pill, the header's pause and page-switch marks. They keep their own
 * markup and their own look, and still take what they do, what they are called,
 * whether they are live and which key also does it from one place.
 *
 * `name` overrides the action's own words where a surface is more specific
 * ("Shuffle the words", "Shuffle rack"); the key is appended either way.
 */
export function actionSurface(action: BoundAction, name?: string): ActionSurface {
  // A bespoke control is still a control being drawn, so it asks what
  // `<ActionButton>` asks.
  const { state, label, icon, tooltip } = action.describe('button')
  const called = name ?? label ?? action.spec.label
  return {
    hidden: state === 'hidden',
    label: called,
    icon: icon ?? action.spec.icon,
    buttonProps: {
      disabled: state === 'disabled' || action.pending,
      onClick: () => action.run(),
      'aria-label': called,
      'data-action': action.id,
      // The action's reason for this moment, when it gives one; else its name
      // with the key on the end.
      'data-tooltip': tooltip ?? nameWithKey(called, action),
    },
  }
}
