import { FloatingPanel } from '../../common/components/panels/FloatingPanel'
import styles from './NoteDialog.module.css'

type Props = {
  /** The puzzle title, shown in the panel header. */
  title: string
  /** The setter's free-form note (already known non-empty by the caller). */
  note: string
  onClose: () => void
}

/**
 * A draggable panel showing a puzzle's setter note — the free-form
 * `meta.note` some `.puz`/`.ipuz` puzzles carry (theme hints, constructor
 * remarks). Ported from crossplay's NoteDialog, minus its broadcast "show to
 * everyone" sync: here it's a per-player panel opened from the game menu's
 * "Show note" item (disabled when the puzzle has no note). Rides on the shared
 * `FloatingPanel` like Help / the scratchpad, and persists its rect per game.
 */
export function NoteDialog({ title, note, onClose }: Props) {
  return (
    <FloatingPanel
      title={title || 'Puzzle note'}
      onClose={onClose}
      defaultSize={{ width: 520, height: 360 }}
      minWidth={300}
      minHeight={200}
      persistKey="crosswords:noteRect"
    >
      {/* pre-wrap preserves the note's own line breaks + spacing. */}
      <p className={styles.note}>{note}</p>
    </FloatingPanel>
  )
}
