// cs-unmet

import { useEffect, useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { ShownWordEditDialog } from './wordEditStore'
import {
  EMPTY_WORD_FIELDS, readFields, WORD_FIELD_COLUMNS, type WordFields,
} from './wordFieldValues'

/**
 * The word-edit dialog's starting values: the row as stored, read fresh (the
 * popover's cached definition may be stale, and the form needs every column),
 * or `EMPTY_WORD_FIELDS` when adding, with no read at all.
 *
 * `row` is null while the read is in flight. `failure` is the sentence for the
 * form's line when there is no row to edit: the read failed (a fault, whose
 * modal `readRows` has already raised), or it found nothing — another editor
 * deleted the word between the popover and this Edit click. The second words
 * match the server's own PN025/PN026.
 */
export function useWordRow(request: ShownWordEditDialog): {
  row: WordFields | null
  failure: string | null
} {
  const [row, setRow] = useState<WordFields | null>(
    request.mode === 'edit' ? null : EMPTY_WORD_FIELDS,
  )
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(function loadRow() {
    if (request.mode !== 'edit') return
    let mounted = true
    void (async () => {
      const res = await readRows(
        commonDb.from('words').select(WORD_FIELD_COLUMNS).eq('word', request.word),
      )
      if (!mounted) return
      if (res.type === 'not-ok') {
        setFailure('Could not load this word.')
      } else if (!res.data[0]) {
        setFailure(`No such word: ${request.word}`)
      } else {
        setRow(readFields(res.data[0]))
      }
    })()
    return () => {
      mounted = false
    }
  }, [request])

  return { row, failure }
}
