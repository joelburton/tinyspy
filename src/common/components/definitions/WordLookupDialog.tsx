// cs-unmet

import { useState, type FormEvent } from 'react'
import { StandardForm } from '../fields/StandardForm'
import { DefinitionView } from './DefinitionView'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import styles from './WordLookupDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { TextField } from '../fields/TextField'

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
      family="dialog"
      persistKey="puzpuzpuz:wordLookup:rect"
      title="Look up a word"
      onClose={onClose}
      // Height is the content's — the number below is only the first-paint seed.
      // Safe alongside `persistKey` because this panel cannot be resized, so a
      // stored height was never anyone's choice for the fit to fight (F23 → C).
      fitContent
      defaultSize={{ width: 360, height: 280 }}
      resizable={false}
    >
      <StandardForm onSubmit={onSubmit}>
        <TextField
          // No caption: this box IS the panel, and the titlebar says what it
          // looks up.
          ariaLabel="Word to look up"
          // Autofocus so the player can type immediately after the
          // shortcut opens the dialog.
          autoFocus
          className={styles.input}
          value={query}
          onChange={setQuery}
          placeholder="a word…"
        />
        <StandardButton name="Define" type="submit" weight="primary" className={styles.button} />
      </StandardForm>
      <DefinitionView word={word} onNavigate={navigate} />
    </FloatingPanel>
  )
}
