// cs-unmet

import { StandardButton, type StandardButtonProps } from '../buttons/StandardButton'
import type { BoundAction } from './useBoundAction'

type Props = Omit<StandardButtonProps, 'label' | 'icon' | 'tone' | 'onClick' | 'tooltip'> & {
  // The action this button IS. Its words, glyph, tone, key and availability all
  // come from here — the button decides none of them.
  action: BoundAction
}

/**
 * A button that fires an action.
 *
 * Reach for this for any command a game offers: New game, Shuffle, Concede,
 * Submit. Pass the bound action and say how the button should draw
 * (`show`) and how loud it is here (`weight`) — those two are the placement's,
 * and everything else the action already knows.
 *
 *     <ActionButton action={actNewGame} show="both" weight="primary" />
 *
 * Nothing renders when the action is hidden, so a list of these needs no `if`
 * around any of them: the buttons on screen are the actions that apply now.
 * The button disables itself while the action is disabled or still running, and
 * its hover bubble says the key, which is the only place a player finds out
 * that New game is `+`.
 */
export function ActionButton({ action, ...rest }: Props) {
  const { state, label } = action.describe()
  if (state === 'hidden') return null

  const { spec } = action
  const words = label ?? spec.label
  const chord = spec.keys?.[0]?.label

  return (
    <StandardButton
      label={words}
      icon={spec.icon}
      tone={spec.tone}
      // The bubble teaches the key. Without a key there is nothing to add, so
      // the button keeps StandardButton's own rule (the name, when the words
      // aren't already on screen).
      tooltip={chord === undefined ? undefined : `${words} · ${chord}`}
      disabled={state === 'disabled' || action.pending}
      onClick={() => action.run()}
      {...rest}
    />
  )
}
