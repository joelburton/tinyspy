// cs-blessed-page-header

import { setScratchpadOpen, useScratchpadOpen } from '../scratchpad/scratchpadOpenStore'
import { IconScratchpad } from '../icons/icons'
import { useBoundAction } from '../actions/useBoundAction'
import { actionSurface } from '../actions/actionSurface'
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
 * **It binds `act-open-scratchpad`** and keeps its header look, the way the
 * pause mark binds `act-pause`. The action carries the two faces — "Open
 * scratchpad" / "Close scratchpad" — so the mark, its bubble and the menu row a
 * game places for the same action all say the same thing, and `⌥S` works
 * wherever the scratchpad does.
 */
export function ScratchpadButton() {
  const open = useScratchpadOpen()
  const actOpenScratchpad = useBoundAction('act-open-scratchpad', {
    describe: () => ({ state: 'active', label: open ? 'Close scratchpad' : 'Open scratchpad' }),
    run: () => setScratchpadOpen(!open),
  })
  const { label, buttonProps } = actionSurface(actOpenScratchpad)
  return (
    <PageHeaderButton
      icon={IconScratchpad}
      iconSize={22}
      label={label}
      aria-pressed={open}
      {...buttonProps}
    />
  )
}
