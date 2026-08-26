// cs-unmet

import { actionName } from '../../lib/game/callRpc'
import { failureText } from '../../lib/game/serverError'
import { useState, type FormEvent } from 'react'
import { db as commonDb } from '../../db'
import { useDefinePopover } from '../../hooks/definitions/useDefinePopover'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import styles from './AnagramDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { TextField } from '../fields/TextField'

type Result = { word: string; difficulty: number }

/**
 * The ⌥` anagram finder — WordLookupDialog's sibling: same FloatingPanel
 * chrome, same type-and-Enter shape, but the answer is a LIST, not a
 * definition. Backed by `common.anagrams` (see sql/common.sql for the whole
 * matching story); this component only normalizes input and renders rows.
 *
 * The pattern syntax (the hint line teaches it, tersely): lowercase letters
 * float anywhere, `?` is a floating wildcard, an UPPERCASE letter is pinned
 * to its exact position — "Acer" finds acer + acre, never race. Case is
 * therefore MEANINGFUL, so the input is never lowercased.
 *
 * Results are the server's order (difficulty band, then alphabetical) with
 * the band number muted beside each word — and each word is click-to-define
 * via the shared popover, like every other word the app shows. The list
 * scrolls inside the fixed panel (flex column + min-height:0 on the scroll
 * box — the InfoSheet lesson; without it the PANEL would grow instead).
 */
export function AnagramDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  // null = nothing searched yet (no result area at all).
  const [results, setResults] = useState<Result[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What is wrong with the ENTRY, as against a failure from the RPC: it belongs
  // to the box, so it rings the box and says why underneath it.
  const [entryError, setEntryError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const { define: openDefine, popover } = useDefinePopover()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const letters = query.trim()
    if (letters.length < 2) {
      // It used to `return` here — the Find button enabled, pressed, and
      // nothing whatever happening. The refusal is right; the silence was not.
      setEntryError('Two letters or more — a single letter only rearranges into itself.')
      return
    }
    setEntryError(null)
    setSearching(true)
    setError(null)
    const res = await commonDb.rpc('anagrams', { letters })
    setSearching(false)
    if (res.error) {
      setResults(null)
      setError(failureText(res.error, actionName('anagrams')))
      return
    }
    setResults((res.data ?? []) as Result[])
  }

  return (
    <FloatingPanel
      family="dialog"
      persistKey="puzpuzpuz:anagram:rect"
      title="Anagrams"
      onClose={onClose}
      // Height is the content's — the number below is only the first-paint seed.
      // Safe alongside `persistKey` because this panel cannot be resized, so a
      // stored height was never anyone's choice for the fit to fight (F23 → C).
      fitContent
      defaultSize={{ width: 360, height: 440 }}
      resizable={false}
    >
      <div className={styles.content}>
        <form onSubmit={onSubmit} className={styles.form}>
          <TextField
            // No caption: this box IS the panel, and the titlebar above it
            // already says "Anagram finder".
            ariaLabel="Letters to anagram"
            // Autofocus so the player can type immediately after the
            // shortcut opens the dialog.
            autoFocus
            className={styles.input}
            value={query}
            // Case carries meaning (pins), so keep it as typed; everything
            // that isn't a letter or '?' is dropped on entry.
            onChange={(v) => {
              setQuery(v.replace(/[^A-Za-z?]/g, '').slice(0, 15))
              // Typing is the answer to the complaint; clear it as they act.
              setEntryError(null)
            }}
            placeholder="letters…"
            // The syntax legend, moved INTO the field. It used to be a
            // paragraph below the Find button — three elements from the box it
            // describes, and read after you had already typed.
            entryHelp="abc float · ABC pinned in place · ? any letter"
            error={entryError}
          />
          <StandardButton
            name="Find"
            type="submit"
            weight="primary"
            className={styles.button}
            disabled={searching}
          />
        </form>
        {error && <p className={styles.error}>{error}</p>}
        {results && !error && (
          <>
            <p className={styles.count}>
              {results.length === 0
                ? 'No words.'
                : `${results.length} word${results.length === 1 ? '' : 's'}`}
            </p>
            <ul className={styles.list}>
              {results.map((r) => (
                <li key={r.word} className={styles.row}>
                  <span
                    className={styles.word}
                    onClick={(e) => openDefine(r.word, e.currentTarget)}
                    title="Click to define"
                    data-word={r.word}
                  >
                    {r.word.toUpperCase()}
                  </span>
                  {/* The difficulty band, muted — context, not content. */}
                  <span className={styles.band}>{r.difficulty}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {popover}
    </FloatingPanel>
  )
}
