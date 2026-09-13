// cs-audited-definitions

import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { DefinableWord } from '../definitions/DefinableWord'
import { Dialog } from '../floating-panels/Dialog'
import styles from './AnagramDialog.module.css'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { TextField } from '../fields/TextField'
import { FailureLine } from '../forms/FailureLine'
import { SimpleScrollableList } from '../lists/SimpleScrollableList'
import { reportUnhandled } from '../supabase/dbEnvelope'

type Result = { word: string; difficulty: number }

/** What `common.anagrams` puts in `data`. The words sit under a key rather
 *  than being the payload outright, so the branch can assert `result` — a
 *  bare array leaves nothing to test but its shape. An EMPTY `words` is a
 *  real answer, not a missing one; the dialog says "nothing found". */
type AnagramAnswer = { result: 'searched'; words: Result[] }

/**
 * HOW LONG A PATTERN MAY BE — a mirror of `common.anagrams`, which rejects
 * anything outside `^[A-Za-z?]{2,15}$` with `bad-anagram-input`. The ceiling
 * caps the field so an unsendable pattern cannot be typed; the floor answers
 * on submit with a sentence. If the SQL's range moves, this is the one place
 * the FE says it.
 */
const PATTERN_LENGTH = { min: 2, max: 15 } as const

/** What the form holds, keyed by the name it is SENT AS — `letters` is
 *  `common.anagrams`' own parameter, so PN001's `column = 'letters'` lands on
 *  the box rather than on a line below the Find button. */
type Values = { letters: string }

/**
 * The ⌥~ anagram finder — WordLookupDialog's sibling, but the answer is a LIST
 * of dictionary words, not a definition. `common.anagrams` does the matching;
 * this component only normalizes input and renders rows, each word
 * click-to-define. Opened by the app-level action; `AppActionsHost` owns
 * whether it is open.
 *
 * Case is MEANINGFUL — an uppercase letter is pinned to its position, `?` is a
 * wildcard — so the input is never lowercased. The syntax: doc.md → Design.
 */
export function AnagramDialog({ onClose }: { onClose: () => void }) {
  // null = nothing searched yet (no result area at all).
  const [results, setResults] = useState<Result[] | null>(null)
  // One object for both kinds of message: what was wrong with the ENTRY rings
  // the box (`errors.letters`), a failure from the RPC goes on the line below
  // (the form-level key), and which one a message gets is the message's own
  // business rather than a decision at each call site.
  const [errors, setErrors] = useState<FormErrors>({})
  const [searching, setSearching] = useState(false)

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
      return
    } else if (res.type === 'ok' && res.data.result === 'searched') {
      // One answer covers matches AND none: an empty list is a real result
      // here, and the dialog is what says "nothing found".
      setResults(res.data.words)
      return
    } else {
      // The previous answer stays on screen, as it does during a search — an
      // answer nobody handled is no reason to claim the previous one is wrong.
      reportUnhandled('anagrams', res)
      return
    }
  }

  return (
    <Dialog
      persistKey="puzpuzpuz:anagram:rect"
      title="Anagrams"
      onClose={onClose}
      // Height is the content's — the number below is only the first-paint seed
      // (safe beside `persistKey` on a floating panel that cannot be resized;
      // see `FloatingPanel`'s `fitContent`).
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
            <FormSubmitButton
              show="label"
              label="Find"
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
              <DefinableWord word={r.word} className={styles.resultWord} />
            </li>
          ))}
        </SimpleScrollableList>
      )}
    </Dialog>
  )
}
