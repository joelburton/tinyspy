import { actionName } from '../../lib/game/callRpc'
import { failureText } from '../../lib/game/serverError'
import { useState, type FormEvent } from 'react'
import { db as commonDb } from '../../db'
import { useDefinePopover } from '../../hooks/definitions/useDefinePopover'
import { FloatingPanel } from '../panels/FloatingPanel'
import styles from './AnagramDialog.module.css'

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
  const [searching, setSearching] = useState(false)
  const { define: openDefine, popover } = useDefinePopover()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const letters = query.trim()
    if (letters.length < 2) return
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
      title="Anagrams"
      onClose={onClose}
      defaultSize={{ width: 360, height: 440 }}
      resizable={false}
    >
      <div className={styles.content}>
        <form onSubmit={onSubmit} className={styles.form}>
          <input
            // Autofocus so the player can type immediately after the
            // shortcut opens the dialog.
            autoFocus
            type="text"
            className={styles.input}
            value={query}
            // Case carries meaning (pins), so keep it as typed; everything
            // that isn't a letter or '?' is dropped on entry.
            onChange={(e) => setQuery(e.target.value.replace(/[^A-Za-z?]/g, '').slice(0, 15))}
            placeholder="letters…"
            aria-label="Letters to anagram"
          />
          <button type="submit" className={styles.button} disabled={searching}>
            Find
          </button>
        </form>
        {/* The syntax, tersely. */}
        <p className={styles.hint}>abc float · ABC pinned in place · ? any letter</p>
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
