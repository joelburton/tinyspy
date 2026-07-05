import { setScratchpadOpen, useScratchpadOpen } from '../../lib/scratchpad/scratchpadOpenStore'
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
      <NotepadIcon />
    </button>
  )
}

/** Hand-rolled notepad-with-pencil glyph (respects currentColor, renders
 *  consistently across OSes — same rationale as ChatBubble's SVG). */
function NotepadIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v3" />
      <path d="M9 12h4" />
      <path d="M9 16h2" />
      <path d="M18.5 14.5 21 17l-3 3-2.5-.5.5-2.5z" />
    </svg>
  )
}
