// cs-unmet

import type { FormErrors } from '../forms/formState'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { CheckboxField } from '../fields/CheckboxField'
import { DIALECTS, NUMBER_FIELDS, type WordFormValues } from './wordFieldValues'
import styles from './WordEditFields.module.css'

type Props = {
  values: WordFormValues
  set: <K extends keyof WordFormValues>(name: K, value: WordFormValues[K]) => void
  errors: FormErrors
  isEditing: boolean
}

/**
 * The word-edit form's inputs: the word (adding only), definition, hint, the
 * three numbers, slang and the four dialects, and the journal note. The form,
 * its failure line and its buttons are `WordEditDialog`'s.
 *
 * The numbers are held as strings, so each converts at the box: an emptied box
 * is NaN, which is held as '' rather than "NaN".
 */
export function WordEditFields({ values, set, errors, isEditing }: Props) {
  return (
    <>
      {!isEditing && (
        <TextField
          name="new_word"
          label="Word"
          value={values.new_word}
          onChange={(v) => set('new_word', v.replace(/[^A-Za-z]/g, ''))}
          error={errors.new_word}
          autoFocus
        />
      )}
      <TextField
        name="definition"
        error={errors.definition}
        label="Definition"
        value={values.definition}
        onChange={(v) => set('definition', v)}
        multiline
        rows={2}
      />
      <TextField
        name="hint"
        error={errors.hint}
        label="Hint"
        value={values.hint}
        onChange={(v) => set('hint', v)}
      />
      <div className={styles.numbers}>
        {NUMBER_FIELDS.map(({ key, label, min, max }) => (
          <NumberField
            key={key}
            name={key}
            label={label}
            min={min}
            max={max}
            chars={1}
            value={Number(values[key])}
            onChange={(n) => set(key, Number.isNaN(n) ? '' : String(n))}
          />
        ))}
      </div>
      <div className={styles.checks}>
        <CheckboxField
          name="slang"
          error={errors.slang}
          value={values.slang}
          onChange={(on) => set('slang', on)}
        >
          slang
        </CheckboxField>
        {DIALECTS.map((d) => (
          <CheckboxField
            key={d}
            name={d}
            value={values[d]}
            onChange={(on) => set(d, on)}
          >
            {d}
          </CheckboxField>
        ))}
      </div>
      <TextField
        name="note"
        error={errors.note}
        label="Note"
        value={values.note}
        onChange={(v) => set('note', v)}
        placeholder="a quick aside for the wordlist process…"
        multiline
        rows={2}
      />
    </>
  )
}
