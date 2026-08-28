// cs-unmet

import { useState } from 'react'
import { StandardForm } from '../fields/StandardForm'
import { DefinitionView } from './DefinitionView'
import { Dialog } from '../floating-panels/Dialog'
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
/** What the form holds. Nothing here reaches an RPC — the definition comes from
 *  an edge function by way of `<DefinitionView>` — so the name is just the
 *  box's. */
type Values = { query: string }

export function WordLookupDialog({ onClose }: Props) {
  /** The word being DEFINED, as against the one being typed. Clicking a related
   *  word in the definition sets both: you see what you are looking at. */
  const [word, setWord] = useState<string | null>(null)

  function onSubmit({ query }: Values) {
    const w = query.trim().toLowerCase()
    if (w) setWord(w)
  }

  return (
    <Dialog
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
      <StandardForm initialValues={{ query: '' } satisfies Values} onSubmit={onSubmit}>
        {({ values, set }) => (
          <>
            <TextField
              name="query"
              // No caption: this box IS the panel, and the titlebar says what it
              // looks up.
              ariaLabel="Word to look up"
              // Autofocus so the player can type immediately after the
              // shortcut opens the dialog.
              autoFocus
              className={styles.input}
              value={values.query}
              onChange={(v) => set('query', v)}
              placeholder="a word…"
            />
            <StandardButton name="Define" type="submit" weight="primary" className={styles.button} />

            {/* INSIDE the form, which it did not use to be. Following a related
                word writes back into the box as well as changing what is
                defined, and the box belongs to the form — so the thing that
                writes to it has to sit where the setter is. */}
            <DefinitionView
              word={word}
              onNavigate={(next) => {
                set('query', next)
                setWord(next)
              }}
            />
          </>
        )}
      </StandardForm>
    </Dialog>
  )
}
