// cs-unmet

import { setScratchpadOpen, useScratchpadOpen } from '../../lib/scratchpad/scratchpadOpenStore'
import { IconScratchpad } from '../icons'

/**
 * The scratchpad-panel toggle in the game header (rendered only for games
 * whose manifest opts in). Click toggles the panel via the shared
 * scratchpadOpenStore — both this bubble and `<GameScratchpad>` subscribe.
 *
 * All of its chrome is the shared `.bare-icon-button`, including the border it
 * wears while the panel is open — `aria-pressed` is what the pattern keys on,
 * so the state is said once, in the markup, and drawn from there.
 */
export function ScratchpadBubble() {
  const open = useScratchpadOpen()
  return (
    <button
      type="button"
      className="bare-icon-button"
      aria-pressed={open}
      onClick={() => setScratchpadOpen(!open)}
      aria-label={open ? 'Close scratchpad' : 'Open scratchpad'}
      title="Scratchpad"
    >
      <IconScratchpad size={22} />
    </button>
  )
}

