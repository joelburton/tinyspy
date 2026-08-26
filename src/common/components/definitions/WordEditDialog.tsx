// cs-unmet

import { formFailureText } from '../../lib/game/serverError'
import { StandardForm } from '../fields/StandardForm'
import { useEffect, useState, type FormEvent } from 'react'
import { db as commonDb } from '../../db'
import { setWordEdit, type WordEditRequest } from '../../lib/definitions/wordEditStore'
import { useConfirmation } from '../../hooks/ui/useConfirmation'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import styles from './WordEditDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
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

export function WordEditDialog({ request }: { request: WordEditRequest }) {
  const editing = request.mode === 'edit'
  const [word, setWord] = useState(editing ? request.word : '')
  const [fields, setFields] = useState<Fields>(EMPTY)
  // The loaded row's values, for computing the changed-fields patch.
  const [initial, setInitial] = useState<Fields | null>(editing ? null : EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { confirm: confirmAction, confirmationModal } = useConfirmation()

  // Edit mode: prefill from a fresh read of the row (the popover's cached
  // definition may be stale, and the form needs every column anyway).
  useEffect(() => {
    if (!editing) return
    let mounted = true
    void (async () => {
      const { data, error: err } = await commonDb
        .from('words')
        .select('definition, hint, difficulty, crude, slur, slang, american, british, canadian, australian')
        .eq('word', request.word)
        .maybeSingle()
      if (!mounted) return
      if (err) {
        // A load failure is a fault (nothing an editor typed can cause it) —
        // formFailureText pops the modal and the form line stays empty.
        setError(formFailureText(err, 'dictionary'))
        return
      }
      if (!data) {
        // A successful query that found no row is an ANSWER, not a failure —
        // another editor deleted the word between the popover and this Edit
        // click. Domain copy, no classifier, no [db] log. (Feeding the null
        // error to the classifier used to misfile this as transport:
        // "dictionary: Server; try refresh" over a word that just isn't there.)
        // Same words as ERROR_COPY's server-raised `no-such-word` entry — one
        // fact, one sentence, whichever side states it.
        setError(`No such word: ${request.word}`)
        return
      }
      const loaded: Fields = {
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
      setFields(loaded)
      setInitial(loaded)
    })()
    return () => {
      mounted = false
    }
  }, [editing, request])

  const [note, setNote] = useState('')

  function set<K extends keyof Fields>(key: K, v: Fields[K]) {
    setFields((f) => ({ ...f, [key]: v }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || initial === null) return
    setError(null)

    // The changed-fields patch (edit) / the full field set (add).
    const payload: Record<string, unknown> = {}
    for (const key of Object.keys(fields) as (keyof Fields)[]) {
      if (!editing || fields[key] !== initial[key]) {
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
    const res = editing
      ? await commonDb.rpc('update_word', {
          target_word: request.mode === 'edit' ? request.word : '',
          patch: jsonPayload,
          note: note.trim() || undefined,
        })
      : await commonDb.rpc('add_word', {
          new_word: word.trim().toLowerCase(),
          fields: jsonPayload,
          note: note.trim() || undefined,
        })
    setBusy(false)
    if (res.error) {
      // Validation (word-exists, bad-word, …) stays on the form's line; a
      // fault pops the modal.
      setError(formFailureText(res.error, 'dictionary'))
      return
    }
    setWordEdit(null)
  }

  async function onDelete() {
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
    const res = await commonDb.rpc('delete_word', {
      target_word: request.word,
      note: note.trim() || undefined,
    })
    setBusy(false)
    if (res.error) {
      setError(formFailureText(res.error, 'dictionary'))
      return
    }
    setWordEdit(null)
  }

  return (
    <FloatingPanel
      family="dialog"
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
      <StandardForm onSubmit={onSubmit}>
        {!editing && (
          <TextField
            label="Word"
            value={word}
            onChange={(v) => setWord(v.replace(/[^A-Za-z]/g, ''))}
            autoFocus
          />
        )}
        <TextField
          label="Definition"
          value={fields.definition}
          onChange={(v) => set('definition', v)}
          disabled={initial === null}
          multiline
          rows={2}
        />
        <TextField
          label="Hint"
          value={fields.hint}
          onChange={(v) => set('hint', v)}
          disabled={initial === null}
        />
        {/* Three small numbers on one row, not three rows. Each is a
            <NumberField> in a <label>-less wrapper because the caption belongs
            to the field; the row only decides they share a line. The values are
            kept as STRINGS in `fields` (the patch is diffed against the loaded
            row as text), so each converts at the boundary — an emptied box is
            NaN, which stores as '' rather than the string "NaN". */}
        <div className={styles.numbers}>
          {NUMBER_FIELDS.map(({ key, label, min, max }) => (
            <NumberField
              key={key}
              name={key}
              label={label}
              min={min}
              max={max}
              chars={1}
              value={Number(fields[key])}
              onChange={(n) => set(key, Number.isNaN(n) ? '' : String(n))}
              disabled={initial === null}
            />
          ))}
        </div>
        <div className={styles.checks}>
          <CheckboxField
            name="slang"
            checked={fields.slang}
            onChange={(on) => set('slang', on)}
            disabled={initial === null}
          >
            slang
          </CheckboxField>
          {DIALECTS.map((d) => (
            <CheckboxField
              key={d}
              name={d}
              checked={fields[d]}
              onChange={(on) => set(d, on)}
              disabled={initial === null}
            >
              {d}
            </CheckboxField>
          ))}
        </div>
        <TextField
          label="Note"
          value={note}
          onChange={setNote}
          placeholder="a quick aside for the wordlist process…"
          multiline
          rows={2}
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {editing && (
            <StandardButton
              name="Delete"
              tone="destructive"
              className={styles.deleteButton}
              onClick={() => void onDelete()}
              disabled={busy || initial === null}
            />
          )}
          <StandardButton
            name="Save"
            type="submit"
            weight="primary"
            className={styles.saveButton}
            disabled={busy || initial === null}
          />
        </div>
      </StandardForm>
      {confirmationModal}
    </FloatingPanel>
  )
}
