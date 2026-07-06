import { useEffect, useRef, useState } from 'react'
import styles from './NumberJumpDialog.module.css'

type Props = {
  /** Jump the cursor to the cell numbered `n`. Returns true on success; false
   *  when no cell carries that number (we keep the popup open + show an error). */
  onSubmit: (n: number) => boolean
  onClose: () => void
}

/**
 * Small modal opened by `#` (ported from crossplay's NumberJumpDialog). Type a
 * clue number, Enter to jump the cursor to that numbered cell. Esc /
 * click-outside / blank-Enter cancels. An invalid number shows an inline error
 * and keeps focus in the input. While it's open, PlayArea suspends the board
 * keyboard so digits land here, not on the grid.
 */
export function NumberJumpDialog({ onSubmit, onClose }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function commit() {
    const trimmed = value.trim()
    if (!trimmed) {
      onClose()
      return
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n <= 0 || !onSubmit(n)) {
      setError(true)
      return
    }
    // onSubmit returned true; the parent unmounts us.
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose()
      }}
    >
      <div className={styles.card} ref={cardRef} role="dialog" aria-label="Jump to clue number">
        <div className={styles.label}>Jump to clue number</div>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(false)
          }}
          onKeyDown={(e) => {
            // Stop the window grid handler from also seeing these keys (it's
            // suspended while we're open, but this is belt-and-braces).
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          aria-label="Clue number"
          aria-invalid={error || undefined}
        />
        <div className={styles.error} aria-live="polite">
          {error ? 'No cell with that number.' : ''}
        </div>
      </div>
    </div>
  )
}
