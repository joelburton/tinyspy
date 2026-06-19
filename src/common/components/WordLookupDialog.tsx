import { useRef, useState, type FormEvent } from 'react'
import { DefinitionView } from './DefinitionView'
import { FloatingPanel } from './FloatingPanel'
import styles from './WordLookupDialog.module.css'

type Props = {
  onClose: () => void
}

/**
 * Free-form "look up any word" dialog — the escape hatch for chasing a
 * definition that points elsewhere ("see X") or for any word that
 * isn't on screen to click. Opened by the per-game shortcut key.
 *
 * Shares the whole render + fetch path with the click-to-define
 * popover via `<DefinitionView>`; the only thing it adds is the text
 * box that chooses the first word. A cross-ref click inside the
 * result navigates in place AND syncs the input, so the box always
 * shows what's being defined.
 */
export function WordLookupDialog({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [word, setWord] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const w = query.trim().toLowerCase()
    if (w) setWord(w)
  }

  function navigate(next: string) {
    setQuery(next)
    setWord(next)
  }

  return (
    <FloatingPanel
      title="Look up a word"
      onClose={onClose}
      defaultSize={{ width: 360, height: 280 }}
      resizable={false}
    >
      <div className={styles.content}>
        <form onSubmit={onSubmit} className={styles.form}>
          <input
            ref={inputRef}
            // Autofocus so the player can type immediately after the
            // shortcut opens the dialog.
            autoFocus
            type="text"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="a word…"
            aria-label="Word to look up"
          />
          <button type="submit" className={styles.button}>
            Define
          </button>
        </form>
        <DefinitionView word={word} onNavigate={navigate} />
      </div>
    </FloatingPanel>
  )
}
