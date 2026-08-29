// cs-unmet

import { StandardForm } from '../fields/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'
import { FailureLine } from '../feedback/FailureLine'
import { useEffect, useState } from 'react'
import { db as commonDb } from '../../db'
import { readRows, runRpc } from '../../lib/supabase/dbResult'
import { showFaultModal } from '../../lib/fault/faultStore'
import { setWordEdit, type WordEditRequest } from '../../lib/definitions/wordEditStore'
import { useConfirmation } from '../../hooks/ui/useConfirmation'
import { Dialog } from '../floating-panels/Dialog'
import { cls } from '../../lib/util/cls'
import actionRow from '../floating-panels/modalActions.module.css'
import styles from './WordEditDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { CheckboxField } from '../fields/CheckboxField'

/**
 * The dictionary-curation form — edit an existing word, or add one (the
 * `add` mode is the same form plus the word field). Editors only: the
 * openers (DefinitionView's link, the account menu's "Add word") are gated
 * on `profiles.can_edit_words`, and the RPCs enforce the same permission
 * server-side.
 *
 * Save applies LIVE and journals to `common.words_edits` — the capture-first
 * curation loop (see the table's comment in the common migration). The
 * `note` box is the curator's aside to the upstream wordlist-manager
 * process ("saw this in wordle, way too obscure"); it goes to the journal,
 * never to the app.
 *
 * The edit path sends a PATCH of only the changed fields — that's what the
 * journal's `new` records, so an untouched field never shows up as "edited".
 * Numbers are plain inputs by design (band 1–6, crude/slur 0–2); the RPC
 * range-checks, so a typo is a clean inline error.
 */

/** The editable row slice, as loaded / as edited. */
type Fields = {
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

const EMPTY: Fields = {
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

const DIALECTS = ['american', 'british', 'canadian', 'australian'] as const

/** The three small numbers that share a row. A table, not three near-identical
 *  blocks — they differ only in name, caption and range, and writing that three
 *  times is how the caption and the range drift apart. */
const NUMBER_FIELDS = [
  { key: 'difficulty', label: 'Band (1–6)', min: 1, max: 6 },
  { key: 'crude', label: 'Crude (0–2)', min: 0, max: 2 },
  { key: 'slur', label: 'Slur (0–2)', min: 0, max: 2 },
] as const

/** The wire value for a field: numbers as numbers, empty strings as null
 *  (clearing a definition/hint), booleans as-is. */
function wireValue(key: keyof Fields, v: Fields[keyof Fields]): unknown {
  if (typeof v === 'boolean') return v
  if (key === 'difficulty' || key === 'crude' || key === 'slur') return Number(v)
  return v === '' ? null : v
}

/**
 * What the form holds: the ten editable columns, plus the word being added and
 * the journal note.
 *
 * The column keys are NOT RPC parameters — they travel inside `fields` (add) or
 * `patch` (update), which is why a validation about one of them names the blob
 * rather than the box. See `formFieldFor`.
 */
type Values = Fields & { new_word: string; note: string }

/**
 * Where a server message belongs on THIS form.
 *
 * `add_word` and `update_word` take the ten columns as one jsonb argument, so a
 * validation about what is inside it can only name that argument — PN028 ("Pick
 * a difficulty") raises `column = 'fields'`, and the guard requires a column to
 * name a real parameter. There is no box called `fields`, so left alone the
 * message would be written into an errors key nothing renders and vanish.
 *
 * It goes on the form's own line instead. That is a genuine limit rather than a
 * workaround: a jsonb parameter is one parameter, and the raise cannot say which
 * of the ten it meant.
 */
function formFieldFor(field: string | null | undefined): string {
  // An envelope's `field` is always PRESENT and null when the raise named no
  // column, so null is the ordinary case here rather than the odd one.
  if (field === undefined || field === null) return FORM_ERROR_KEYNAME
  return field === 'fields' || field === 'patch' || field === 'target_word'
    ? FORM_ERROR_KEYNAME
    : field
}

/**
 * What `common.add_word` and `common.update_word` put in `data`. Two RPCs, one
 * type, because the ternary below calls whichever the mode asks for and the
 * dialog treats both the same. `result` reuses `words_edits.kind`, the journal's
 * own vocabulary for the row each of them writes.
 */
type SaveAnswer = { result: 'added' | 'updated' }

/** What `common.delete_word` puts in `data` — `words_edits.kind` again. */
type DeleteWordAnswer = { result: 'deleted' }

export function WordEditDialog({ request }: { request: WordEditRequest }) {
  const editing = request.mode === 'edit'
  // The row AS LOADED — the baseline the patch is diffed against, and the form's
  // starting values. `null` means the read is still in flight, which is edit
  // mode only: adding starts from EMPTY and needs no round trip.
  const [loaded, setLoaded] = useState<Fields | null>(editing ? null : EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)
  const { confirm: confirmAction, confirmationModal } = useConfirmation()

  // Edit mode: prefill from a fresh read of the row (the popover's cached
  // definition may be stale, and the form needs every column anyway).
  useEffect(() => {
    if (!editing) return
    let mounted = true
    void (async () => {
      const res = await readRows(
        commonDb
          .from('words')
          .select('definition, hint, difficulty, crude, slur, slang, american, british, canadian, australian')
          .eq('word', request.word),
      )
      if (!mounted) return
      if (res.type === 'not-ok') {
        // A load failure is a fault — nothing an editor typed can cause it —
        // and `dbFetch` has already raised the modal. The line says which load.
        setErrors({ [FORM_ERROR_KEYNAME]: 'Could not load this word.' })
        return
      }
      const data = res.data[0]
      if (!data) {
        // A successful query that found no row is an ANSWER, not a failure —
        // another editor deleted the word between the popover and this Edit
        // click. Zero rows is `ok`, so only this call site can say what it
        // means here. Same words as the server's own PN025/PN026 — one fact,
        // one sentence, whichever side states it.
        setErrors({ [FORM_ERROR_KEYNAME]: `No such word: ${request.word}` })
        return
      }
      const row: Fields = {
        definition: data.definition ?? '',
        hint: data.hint ?? '',
        difficulty: String(data.difficulty),
        crude: String(data.crude),
        slur: String(data.slur),
        slang: data.slang,
        american: data.american,
        british: data.british,
        canadian: data.canadian,
        australian: data.australian,
      }
      setLoaded(row)
    })()
    return () => {
      mounted = false
    }
  }, [editing, request])

  async function onSubmit({ new_word, note, ...fields }: Values) {
    if (busy || loaded === null) return
    setErrors({})

    // The changed-fields patch (edit) / the full field set (add). Diffed against
    // the row as loaded, which is also what the form started from.
    const payload: Record<string, unknown> = {}
    for (const key of Object.keys(loaded) as (keyof Fields)[]) {
      if (!editing || fields[key] !== loaded[key]) {
        payload[key] = wireValue(key, fields[key])
      }
    }
    if (editing && Object.keys(payload).length === 0 && !note.trim()) {
      setWordEdit(null) // nothing changed, nothing to say — just close
      return
    }

    setBusy(true)
    // The generated Json type wants a Json-shaped object; the payload is one
    // by construction (strings / numbers / booleans / null).
    const jsonPayload = payload as import('../../../types/db').Json
    const res = await runRpc<SaveAnswer>(
      editing
        ? commonDb.rpc('update_word', {
            target_word: request.mode === 'edit' ? request.word : '',
            patch: jsonPayload,
            note: note.trim() || undefined,
          })
        : commonDb.rpc('add_word', {
            new_word: new_word.trim().toLowerCase(),
            fields: jsonPayload,
            note: note.trim() || undefined,
          }),
    )
    setBusy(false)
    if (res.type === 'not-ok') {
      // Under the box the server named, when it named one it can reach. A fault
      // has already raised the modal, and the line is what remains after it.
      setErrors({ [formFieldFor(res.field)]: res.message })
    } else if (res.data.result === 'added' || res.data.result === 'updated') {
      // TWO answers, one action: the ternary above chose which RPC to call, and
      // whichever it was, the word is saved and the dialog closes. Both are
      // named rather than folded into one word, because they come from
      // different functions and each may grow a second `ok` of its own.
      setWordEdit(null)
    } else {
      // Named for the RPC this call actually made — the ternary means the
      // scream cannot say one name for both, and the useful half of the
      // sentence is which function answered oddly.
      showFaultModal({
        text: `BUG: ${editing ? 'update_word' : 'add_word'} fell through to unhandled`,
      })
    }
  }

  /** Takes the note because the box belongs to the form — Delete sits inside
   *  it and hands the current value in. */
  async function onDelete(note: string) {
    if (request.mode !== 'edit') return
    if (
      !(await confirmAction({
        title: `Delete "${request.word.toUpperCase()}"?`,
        message: 'Removes it from the dictionary for every game built from now on. The journal keeps a copy.',
        confirmLabel: 'Delete word',
      }))
    ) {
      return
    }
    setBusy(true)
    const res = await runRpc<DeleteWordAnswer>(
      commonDb.rpc('delete_word', {
        target_word: request.word,
        note: note.trim() || undefined,
      }),
    )
    setBusy(false)
    if (res.type === 'not-ok') {
      setErrors({ [formFieldFor(res.field)]: res.message })
    } else if (res.data.result === 'deleted') {
      setWordEdit(null)
    } else {
      // The dialog stays open on an answer nobody handled — closing it would
      // claim the word is gone, and `busy` is already clear above.
      showFaultModal({ text: 'BUG: delete_word fell through to unhandled' })
    }
  }

  return (
    <Dialog
      persistKey="puzpuzpuz:wordEdit:rect"
      title={editing ? `Edit "${request.word.toUpperCase()}"` : 'Add word'}
      onClose={() => setWordEdit(null)}
      // Height is the content's — the number below is only the first-paint seed.
      // Safe alongside `persistKey` because this panel cannot be resized, so a
      // stored height was never anyone's choice for the fit to fight (F23 → C).
      fitContent
      defaultSize={{ width: 380, height: 500 }}
      resizable={false}
    >
      {/* NOT RENDERED until the row is in hand. `initialValues` is read once at
          mount, so a form that appeared first and filled in later would either
          ignore the row or reset under someone already typing. Waiting also
          retires the eight `disabled={initial === null}` props this dialog used
          to carry for exactly that reason. */}
      {loaded === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <StandardForm
          initialValues={
            {
              ...loaded,
              new_word: editing ? request.word : '',
              note: '',
            } satisfies Values
          }
          onSubmit={onSubmit}
        >
          {({ values, set }) => (
            <>
              {!editing && (
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
              {/* Three small numbers on one row, not three rows. Each is a
                  <NumberField> in a <label>-less wrapper because the caption
                  belongs to the field; the row only decides they share a line.
                  The values are kept as STRINGS (the patch is diffed against the
                  loaded row as text), so each converts at the boundary — an
                  emptied box is NaN, which stores as '' rather than "NaN". */}
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
              <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
              {/* Delete is the LEADING action — alone on the left, away from the
                  pair you reach for on the way out. */}
              <div className={cls(actionRow.modalActions, styles.pinBottom)}>
                {editing && (
                  <StandardButton
                    name="Delete"
                    tone="destructive"
                    className={cls(styles.deleteButton, actionRow.leading)}
                    onClick={() => void onDelete(values.note)}
                    disabled={busy}
                  />
                )}
                <CancelButton
                  onClick={() => setWordEdit(null)}
                  disabled={busy}
                />
                <StandardButton
                  name="Save"
                  type="submit"
                  weight="primary"
                  className={styles.saveButton}
                  disabled={busy}
                />
              </div>
            </>
          )}
        </StandardForm>
      )}
      {confirmationModal}
    </Dialog>
  )
}
