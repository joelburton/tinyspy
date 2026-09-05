// cs-unmet

import { setScratchpadOpen, useScratchpadOpen } from '../scratchpad/scratchpadOpenStore'
import { IconScratchpad } from '../icons/icons'
import { PageHeaderButton } from './PageHeaderButton'

/**
 * The scratchpad-panel toggle in the game header (rendered only for games
 * whose manifest opts in). Click toggles the panel via the shared
 * scratchpadOpenStore — both this bubble and `<GameScratchpadCompanion>` subscribe.
 *
 * All of its chrome is `<PageHeaderButton>`, including the border it wears while
 * the panel is open — `aria-pressed` is what that keys on, so the state is said
 * once, in the markup, and drawn from there.
 */
export function ScratchpadButton() {
  const open = useScratchpadOpen()
  return (
    <PageHeaderButton
      icon={IconScratchpad}
      iconSize={22}
      label={open ? 'Close scratchpad' : 'Open scratchpad'}
      tooltip="Scratchpad"
      aria-pressed={open}
      onClick={() => setScratchpadOpen(!open)}
    />
  )
}

