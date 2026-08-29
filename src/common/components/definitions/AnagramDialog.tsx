// cs-unmet

import { cls } from '../../lib/util/cls'
import { StandardForm } from '../fields/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'
import { useState } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { showFaultModal } from '../../lib/fault/faultStore'
import { useDefinePopover } from '../../hooks/definitions/useDefinePopover'
import { Dialog } from '../floating-panels/Dialog'
import styles from './AnagramDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { TextField } from '../fields/TextField'
import { FailureLine } from '../feedback/FailureLine'
import { SimpleScrollableList } from '../lists/SimpleScrollableList'

type Result = { word: string; difficulty: number }

/** What `common.anagrams` puts in `data`. The words sit under a key rather
 *  than being the payload outright, so the branch can assert `result` — a
 *  bare array leaves nothing to test but its shape. An EMPTY `words` is a
 *  real answer, not a missing one; the dialog says "nothing found". */
type AnagramAnswer = { result: 'searched'; words: Result[] }

/**
 * HOW LONG A PATTERN MAY BE — a mirror of `common.anagrams`, which rejects
 * anything outside `^[A-Za-z?]{2,15}$` with `bad-anagram-input`.
 *
 * Stated as one object because the two ends are enforced differently and would
 * otherwise sit apart as bare numbers: the ceiling caps the field so an
 * unsendable pattern cannot be typed, and the floor answers on submit with a
 * sentence, because "two letters or more" is a thing worth being told rather
 * than silently prevented. Both read from here, so they cannot drift from each
 * other — and if the SQL's range moves, this is the one place the FE says it.
 */
const PATTERN_LENGTH = { min: 2, max: 15 } as const

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
 * via the shared popover, like every other word the app shows. The list shows
 * seven rows and scrolls past that (`<SimpleScrollableList>`), so a query
 * matching 1361 words and one matching 14 open the same size.
 */
/** What the form holds, keyed by the name it is SENT AS — `letters` is
 *  `common.anagrams`' own parameter, so PN001's `column = 'letters'` lands on
 *  the box rather than on a line below the Find button. */
type Values = { letters: string }

export function AnagramDialog({ onClose }: { onClose: () => void }) {
  // null = nothing searched yet (no result area at all).
  const [results, setResults] = useState<Result[] | null>(null)
  // One object, where this dialog used to keep two: what was wrong with the
  // ENTRY rang the box, and a failure from the RPC went on the line below. Both
  // are still true — they are `errors.letters` and the form-level key — but
  // which one a message gets is now the message's own business rather than a
  // decision at each call site.
  const [errors, setErrors] = useState<FormErrors>({})
  const [searching, setSearching] = useState(false)
  const { define: openDefine, popover } = useDefinePopover()

  async function onSubmit({ letters }: Values) {
    const trimmed = letters.trim()
    if (trimmed.length < PATTERN_LENGTH.min) {
      // The refusal needs a REASON on screen. A bare `return` here would leave
      // the Find button enabled, pressed, and nothing whatever happening.
      setErrors({
        letters: 'Two letters or more — a single letter only rearranges into itself.',
      })
      return
    }
    setErrors({})
    setSearching(true)
    // The previous answer STAYS on screen while the next one is fetched. Clearing
    // it would collapse the list and shrink the dialog for the length of the
    // round trip, then grow it again — a lot of flash for nothing.
    const res = await runRpc<AnagramAnswer>(commonDb.rpc('anagrams', { letters: trimmed }))
    setSearching(false)
    if (res.type === 'not-ok') {
      setResults(null)
      // No severity test: the message goes where the SERVER said it belongs.
      // PN001 — "2–15 letters, or ?" — says `letters`, so it rings the box it
      // is about; a fault says `_` and lands on the line below. A fault has
      // already interrupted with a modal, and once that is dismissed the line
      // is the only thing left saying the search is still broken.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
    } else if (res.data.result === 'searched') {
      // One answer covers matches AND none: an empty list is a real result
      // here, and the dialog is what says "nothing found".
      setResults(res.data.words)
    } else {
      // The previous answer stays on screen, as it does during a search — an
      // answer nobody handled is no reason to claim the old one is now wrong.
      showFaultModal({ text: 'BUG: anagrams fell through to unhandled' })
    }
  }

  return (
    <Dialog
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
      <StandardForm initialValues={{ letters: '' } satisfies Values} onSubmit={onSubmit}>
        {({ values, set }) => (
          <>
            <TextField
              name="letters"
              // No caption: this box IS the dialog, and the titlebar above it
              // already says "Anagrams".
              // Autofocus so the player can type immediately after the
              // shortcut opens the dialog.
              autoFocus
              value={values.letters}
              // Case carries meaning (pins), so keep it as typed; everything
              // that isn't a letter or '?' is dropped on entry.
              maxLength={PATTERN_LENGTH.max}
              onChange={(v) => {
                // Only the character filter here; the LENGTH is `maxLength`'s,
                // stated on the field rather than enforced in the handler.
                set('letters', v.replace(/[^A-Za-z?]/g, ''))
                // Typing is the answer to the complaint about the box; clear it
                // as they act. The form-level line stays — a dead server is not
                // answered by typing.
                setErrors((prev) => ({ ...prev, letters: '' }))
              }}
              placeholder="letters…"
              // The syntax legend belongs to the BOX, so it sits under the box —
              // not in a paragraph below the Find button, three elements from the
              // thing it describes and read after you have already typed.
              entryHelp="abc float · ABC pinned in place · ? any letter"
              error={errors.letters}
            />
            <StandardButton
              name="Find"
              type="submit"
              weight="primary"
              fullWidth
              disabled={searching}
            />
          </>
        )}
      </StandardForm>
      <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
      {results && (
        <SimpleScrollableList
          rows={7}
          empty="No words."
          count={
            results.length === 0
              ? undefined
              : `${results.length} word${results.length === 1 ? '' : 's'}`
          }
        >
          {results.map((r) => (
            <li key={r.word} className={styles.resultRow}>
              {/* The difficulty band LEADS the row — a fixed-width gutter, so
                  the words start on one line down the list and the number
                  reads as a column rather than as part of the word. */}
              <span className={styles.resultBand}>{r.difficulty}</span>
              <span
                className={cls('definable', styles.resultWord)}
                onClick={(e) => openDefine(r.word, e.currentTarget)}
                title="Click to define"
                data-word={r.word}
              >
                {r.word.toUpperCase()}
              </span>
            </li>
          ))}
        </SimpleScrollableList>
      )}
      {popover}
    </Dialog>
  )
}
