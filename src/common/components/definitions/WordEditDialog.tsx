import { formFailureText } from '../../lib/game/serverError'
import { useEffect, useState, type FormEvent } from 'react'
import { db as commonDb } from '../../db'
import { setWordEdit, type WordEditRequest } from '../../lib/definitions/wordEditStore'
import { useConfirmDialog } from '../../hooks/ui/useConfirmDialog'
import { FloatingPanel } from '../panels/FloatingPanel'
import styles from './WordEditDialog.module.css'
import { cls } from '../../lib/util/cls'

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
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

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
      title={editing ? `Edit "${request.word.toUpperCase()}"` : 'Add word'}
      onClose={() => setWordEdit(null)}
      defaultSize={{ width: 380, height: 500 }}
      resizable={false}
    >
      <form onSubmit={onSubmit} className={styles.form}>
        {!editing && (
          <label className={styles.field}>
            Word
            <input
              autoFocus
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value.replace(/[^A-Za-z]/g, ''))}
              aria-label="New word"
            />
          </label>
        )}
        <label className={styles.field}>
          Definition
          <textarea
            rows={2}
            value={fields.definition}
            onChange={(e) => set('definition', e.target.value)}
            disabled={initial === null}
          />
        </label>
        <label className={styles.field}>
          Hint
          <input
            type="text"
            value={fields.hint}
            onChange={(e) => set('hint', e.target.value)}
            disabled={initial === null}
          />
        </label>
        <div className={styles.numbers}>
          <label className={styles.field}>
            Band (1–6)
            <input
              type="number" min={1} max={6}
              value={fields.difficulty}
              onChange={(e) => set('difficulty', e.target.value)}
              disabled={initial === null}
              aria-label="Band"
            />
          </label>
          <label className={styles.field}>
            Crude (0–2)
            <input
              type="number" min={0} max={2}
              value={fields.crude}
              onChange={(e) => set('crude', e.target.value)}
              disabled={initial === null}
              aria-label="Crude"
            />
          </label>
          <label className={styles.field}>
            Slur (0–2)
            <input
              type="number" min={0} max={2}
              value={fields.slur}
              onChange={(e) => set('slur', e.target.value)}
              disabled={initial === null}
              aria-label="Slur"
            />
          </label>
        </div>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={fields.slang}
              onChange={(e) => set('slang', e.target.checked)}
              disabled={initial === null}
            />
            slang
          </label>
          {DIALECTS.map((d) => (
            <label key={d} className={styles.check}>
              <input
                type="checkbox"
                checked={fields[d]}
                onChange={(e) => set(d, e.target.checked)}
                disabled={initial === null}
              />
              {d}
            </label>
          ))}
        </div>
        <label className={styles.field}>
          Note
          <textarea
            rows={2}
            placeholder="a quick aside for the wordlist process…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Curation note"
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {editing && (
            <button
              type="button"
              className={cls('button', 'secondary', styles.deleteButton)}
              onClick={() => void onDelete()}
              disabled={busy || initial === null}
            >
              Delete
            </button>
          )}
          <button type="submit" className={cls('button', 'primary', styles.saveButton)} disabled={busy || initial === null}>
            Save
          </button>
        </div>
      </form>
      {confirmDialog}
    </FloatingPanel>
  )
}
