// cs-unmet

import { FORM_ERROR_KEYNAME } from '../forms/formState'
import type { Database } from '@/types/db'

/** The editable columns of a `common.words` row, as the form holds them: the
 *  three numbers as strings, so a patch can compare them as typed. */
export type WordFields = {
  definition: string
  hint: string
  difficulty: string
  crude: string
  slur: string
  slang: boolean
  american: boolean
  british: boolean
  canadian: boolean
  australian: boolean
}

/** What the form holds: the editable columns, plus the word being added and
 *  the journal note. */
export type WordFormValues = WordFields & { new_word: string; note: string }

/** A new word's starting values. */
export const EMPTY_WORD_FIELDS: WordFields = {
  definition: '',
  hint: '',
  difficulty: '',
  crude: '0',
  slur: '0',
  slang: false,
  american: true,
  british: false,
  canadian: false,
  australian: false,
}

export const DIALECTS = ['american', 'british', 'canadian', 'australian'] as const

/** The three small numbers that share a row. A table, not three near-identical
 *  blocks — they differ only in name, caption and range, and writing that three
 *  times is how the caption and the range drift apart. */
export const NUMBER_FIELDS = [
  { key: 'difficulty', label: 'Band (1–6)', min: 1, max: 6 },
  { key: 'crude', label: 'Crude (0–2)', min: 0, max: 2 },
  { key: 'slur', label: 'Slur (0–2)', min: 0, max: 2 },
] as const

/** The columns `readFields` takes, as `common.words` stores them. */
type WordColumns = Pick<
  Database['common']['Tables']['words']['Row'],
  keyof WordFields
>

/** The select string for exactly those columns. */
export const WORD_FIELD_COLUMNS =
  'definition, hint, difficulty, crude, slur, slang, american, british, canadian, australian'

/** A stored row as the form's starting values. */
export function readFields(row: WordColumns): WordFields {
  return {
    definition: row.definition ?? '',
    hint: row.hint ?? '',
    difficulty: String(row.difficulty),
    crude: String(row.crude),
    slur: String(row.slur),
    slang: row.slang,
    american: row.american,
    british: row.british,
    canadian: row.canadian,
    australian: row.australian,
  }
}

/** A field's value as the RPC takes it: numbers as numbers, an empty string as
 *  null (clearing a definition or hint), booleans as they are. */
export function toWireValue(key: keyof WordFields, value: WordFields[keyof WordFields]): unknown {
  if (typeof value === 'boolean') return value
  if (key === 'difficulty' || key === 'crude' || key === 'slur') return Number(value)
  return value === '' ? null : value
}

/**
 * What a save sends. Editing, it is only the fields that differ from the row as
 * loaded, so an untouched field never shows up in the journal as edited;
 * adding, it is every field.
 */
export function makePatch(
  row: WordFields,
  fields: WordFields,
  isEditing: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(row) as (keyof WordFields)[]) {
    if (!isEditing || fields[key] !== row[key]) {
      patch[key] = toWireValue(key, fields[key])
    }
  }
  return patch
}

/**
 * Where a server message belongs on this form.
 *
 * `add_word` and `update_word` take the ten columns as one jsonb argument, so a
 * validation about what is inside it can only name that argument — PN028 ("Pick
 * a difficulty") raises `column = 'fields'`. There is no box called `fields`,
 * so the message goes on the form's own line rather than into an errors key
 * nothing renders. An envelope's `field` is null when the raise named no
 * column, which is the ordinary case.
 */
export function getFormField(field: string | null | undefined): string {
  if (field === undefined || field === null) return FORM_ERROR_KEYNAME
  return field === 'fields' || field === 'patch' || field === 'target_word'
    ? FORM_ERROR_KEYNAME
    : field
}
