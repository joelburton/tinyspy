import { setScratchpadOpen, useScratchpadOpen } from '../../lib/scratchpad/scratchpadOpenStore'
import { IconScratchpad } from '../icons'
import styles from './ScratchpadBubble.module.css'

/**
 * The scratchpad-panel toggle in the game header (rendered only for games
 * whose manifest opts in). Click toggles the panel via the shared
 * scratchpadOpenStore — both this bubble and `<GameScratchpad>` subscribe.
 */
export function ScratchpadBubble() {
  const open = useScratchpadOpen()
  return (
    <button
      type="button"
      className={styles.bubble}
      aria-pressed={open}
      onClick={() => setScratchpadOpen(!open)}
      aria-label={open ? 'Close scratchpad' : 'Open scratchpad'}
      title="Scratchpad"
    >
      <IconScratchpad size={22} />
    </button>
  )
}

