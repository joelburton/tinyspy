// cs-unmet

import { setScratchpadOpen, useScratchpadOpen } from '../scratchpad/scratchpadOpenStore'
import { IconScratchpad } from '../icons/icons'
import { useBoundAction } from '../actions/useBoundAction'
import { nameWithKey } from '../actions/nameWithKey'
import { PageHeaderButton } from './PageHeaderButton'

/**
 * The scratchpad-panel toggle in the game header (rendered only for games
 * whose manifest opts in). Click toggles the panel via the shared
 * scratchpadOpenStore — both this bubble and `<GameScratchpadCompanion>` subscribe.
 *
 * All of its chrome is `<PageHeaderButton>`, including the border it wears while
 * the panel is open — `aria-pressed` is what that keys on, so the state is said
 * once, in the markup, and drawn from there.
 *
 * **It binds its own key.** The mark keeps its header look and its click, but
 * `⌥S` comes from the action it binds rather than from a game's key handler —
 * so the key works wherever the scratchpad does, and the bubble says so.
 */
export function ScratchpadButton() {
  const open = useScratchpadOpen()
  const actOpenScratchpad = useBoundAction('act-open-scratchpad', {
    describe: () => 'active',
    run: () => setScratchpadOpen(!open),
  })
  return (
    <PageHeaderButton
      icon={IconScratchpad}
      iconSize={22}
      label={open ? 'Close scratchpad' : 'Open scratchpad'}
      tooltip={nameWithKey('Scratchpad', actOpenScratchpad)}
      aria-pressed={open}
      onClick={() => actOpenScratchpad.run()}
    />
  )
}

