// cs-unmet

import { useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { FormErrors } from '../forms/formState'
import { askConfirmation } from '../floating-panels/confirmationService'
import { useSingleFlight } from '../single-flight/useSingleFlight'
import type { Json } from '@/types/db'
import { setShownWordEditDialog, type ShownWordEditDialog } from './wordEditStore'
import { getFormField, makePatch, type WordFields, type WordFormValues } from './wordFieldValues'

/**
 * What `common.add_word` and `common.update_word` put in `data` — one type for
 * both, since the dialog treats them the same. `result` reuses
 * `words_edits.kind`, the journal's own word for the row each one writes.
 */
type SaveAnswer = { result: 'added' | 'updated' }

/** What `common.delete_word` puts in `data` — `words_edits.kind` again. */
type DeleteWordAnswer = { result: 'deleted' }

type WordEditCallsOptions = {
  request: ShownWordEditDialog
  // The row the form started from; null until it is read.
  row: WordFields | null
}

/**
 * The word-edit dialog's two calls, Save and Delete, and what their answers
 * leave on the form.
 *
 * - **Save** adds the word or updates it. An update sends only the changed
 *   fields (`makePatch`); one that changes nothing and has no note just closes.
 * - **Delete** asks first, then deletes.
 *
 * Either closes the dialog on success. A refusal goes under the box the server
 * named, or on the form's line (`getFormField`). One call is out at a time,
 * Save and Delete together (`useSingleFlight`), and `isPending` says so.
 */
export function useWordEditCalls({ request, row }: WordEditCallsOptions): {
  save: (values: WordFormValues) => void
  deleteWord: (note: string) => void
  isPending: boolean
  errors: FormErrors
} {
  const [errors, setErrors] = useState<FormErrors>({})
  const [runOneCall, isPending] = useSingleFlight(
    (call: () => Promise<void>) => call(),
  )

  async function saveWord({ new_word, note, ...fields }: WordFormValues) {
    // The form is drawn only once the row is in.
    const patch = makePatch(row!, fields, request.mode === 'edit')
    if (request.mode === 'edit' && Object.keys(patch).length === 0 && !note.trim()) {
      setShownWordEditDialog(null)
      return
    }
    setErrors({})

    // A Json-shaped object by construction: strings, numbers, booleans, null.
    const jsonPatch = patch as Json
    const rpcName = request.mode === 'edit' ? 'update_word' : 'add_word'
    const res = await runRpc<SaveAnswer>(
      request.mode === 'edit'
        ? commonDb.rpc('update_word', {
            target_word: request.word,
            patch: jsonPatch,
            note: note.trim() || undefined,
          })
        : commonDb.rpc('add_word', {
            new_word: new_word.trim().toLowerCase(),
            fields: jsonPatch,
            note: note.trim() || undefined,
          }),
    )
    if (res.type === 'not-ok') {
      setErrors({ [getFormField(res.field)]: res.message })
    } else if (res.type === 'ok' && (res.data.result === 'added' || res.data.result === 'updated')) {
      setShownWordEditDialog(null)
    } else {
      reportUnhandled(rpcName, res)
    }
  }

  async function deleteTheWord(note: string) {
    if (request.mode !== 'edit') return
    const answer = await askConfirmation({
      title: `Delete "${request.word.toUpperCase()}"?`,
      message: 'Removes it from the dictionary for every game built from now on. The journal keeps a copy.',
      confirmLabel: 'Delete word',
    })
    if (answer !== 'confirm') return
    const res = await runRpc<DeleteWordAnswer>(
      commonDb.rpc('delete_word', {
        target_word: request.word,
        note: note.trim() || undefined,
      }),
    )
    if (res.type === 'not-ok') {
      setErrors({ [getFormField(res.field)]: res.message })
    } else if (res.type === 'ok' && res.data.result === 'deleted') {
      setShownWordEditDialog(null)
    } else {
      // The dialog stays open: closing it would claim the word is gone.
      reportUnhandled('delete_word', res)
    }
  }

  const save = (values: WordFormValues) => runOneCall(() => saveWord(values))
  const deleteWord = (note: string) => runOneCall(() => deleteTheWord(note))

  return { save, deleteWord, isPending, errors }
}
