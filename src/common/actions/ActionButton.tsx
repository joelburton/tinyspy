// cs-unmet

import { StandardButton, type StandardButtonProps } from '../buttons/StandardButton'
import { nameWithKey } from './nameWithKey'
import type { BoundAction } from './useBoundAction'

type Props = Omit<StandardButtonProps, 'label' | 'icon' | 'tone' | 'tooltip' | 'onClick'> & {
  // The action this button IS. Its words, glyph, tone, key, bubble and
  // availability all come from here — the button decides none of them. A
  // reason for a gray button is the action's too, through `describe().tooltip`.
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
  const { state, label, icon, tooltip: reason } = action.describe()
  if (state === 'hidden') return null

  const { spec } = action
  const words = label ?? spec.label
  const chord = spec.keys?.[0]?.label
  // The bubble: the action's reason for this moment, else the name with its
  // key. Without a key there is nothing to add, so the button keeps
  // StandardButton's own rule (the name, when the words aren't already on
  // screen).
  const bubble = reason ?? (chord === undefined ? undefined : nameWithKey(words, action))

  return (
    <StandardButton
      label={words}
      // A toggle's face, when it has one: on an icon-only button the glyph is
      // the label, so it moves with the words or the two disagree.
      icon={icon ?? spec.icon}
      tone={spec.tone}
      tooltip={bubble}
      // …but the button is still CALLED "End game", not "End game · ⌥⌫". A
      // standard button takes its accessible name from the tooltip when it has
      // one, which is right where the tooltip renames it ("Club" / "Back to
      // club") and wrong here, where the tooltip only adds a hint.
      aria-label={typeof words === 'string' ? words : undefined}
      // WHICH action this is, in the DOM — the escape hatch for styling one
      // button in particular (`[data-action='act-peel'] { … }`), and a stable
      // handle for a test that would otherwise search by wording.
      //
      // An attribute rather than a global class, matching every other marker
      // the app leaves for a stylesheet to ask about (`data-icon-only`,
      // `data-board`, `data-floating-panel`): a class here could only be a
      // literal string in the global namespace, which is the one thing the
      // module-CSS rule exists to avoid.
      data-action={action.id}
      disabled={state === 'disabled' || action.pending}
      onClick={() => action.run()}
      {...rest}
    />
  )
}
