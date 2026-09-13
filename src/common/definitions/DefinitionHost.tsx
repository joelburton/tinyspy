// cs-audited-definitions

import { DefinitionPopover } from './DefinitionPopover'
import { closeDefinition, useDefining } from './definitionStore'

/**
 * The one definition card, showing whatever word the store says is being
 * defined. Mounted ONCE in App.tsx, beside `<ToastHost>` and `<TooltipHost>`,
 * so no surface has to render a popover of its own.
 */
export function DefinitionHost() {
  const defining = useDefining()
  if (!defining) return null
  return (
    <DefinitionPopover
      // Keyed by the word: the card takes its starting word as initial state
      // (a cross-reference inside re-points the lookup in place), so re-using
      // the instance for a new word would leave the previous word on screen.
      key={defining.word}
      initialWord={defining.word}
      anchorRect={defining.rect}
      onClose={closeDefinition}
    />
  )
}
