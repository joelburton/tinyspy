// cs-unmet

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Field } from '../../common/components/fields/Field'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import type { CrosswordsValues } from '../lib/setup'
import { LibraryPickerBlockingModal } from './pickers/LibraryPickerBlockingModal'
import { NytPickerBlockingModal } from './pickers/NytPickerBlockingModal'
import { DEFAULT_WEEKDAY } from '../lib/nytDays'
import { summarize } from '../lib/puzzleSummary'
import { GuardianPickerBlockingModal } from './pickers/GuardianPickerBlockingModal'
import { UploadPickerBlockingModal } from './pickers/UploadPickerBlockingModal'
import styles from './PuzzleSourceField.module.css'

/** Which picker is open, or none. */
type OpenPicker = 'library' | 'nyt' | 'guardian' | 'upload' | null

type Props = {
  /** The setup values this field reads its summary out of. */
  values: CrosswordsValues
  /** Write a setup key. The four pickers write the same keys the four tabs
   *  wrote, so `create_game` sees no difference. */
  set: <K extends keyof CrosswordsValues>(key: K, value: CrosswordsValues[K]) => void
  /** Whose history the NYT weekday walk skips over — the checked players. */
  seenBy: string[]
  clubHandle: string
  error?: string
}

/**
 * **WHICH PUZZLE** — four buttons, each opening its own picker
 * (plans/areas/forms.md → F50 `puzzle-source-picks-in-a-dialog`).
 *
 * This is one field with one name, and that is the point of it. The four
 * sources used to be tabs inside the setup form, which made it possible for a
 * refusal about a source to arrive while a different source was on screen —
 * something no amount of care in the error system can fix from outside, because
 * it is what a tab model permits. A picker is a blocking modal: what is being
 * judged and what you are looking at are the same thing, and nothing behind it
 * is live while you decide.
 *
 * It is also what gives crosswords a field name at all. Every other game's
 * setup messages land under the control they are about; crosswords' landed on
 * the form's bottom line, because none of its controls carried a `name` for the
 * errors object to key on (plans/areas/forms.md → F48
 * `form-state-and-field-errors`).
 *
 * **The summary line is load-bearing.** Once a picker closes, the caption is
 * the only place its answer exists — so for NYT it must say the resolved DATE,
 * not merely "NYT". That is the one way this design can lose information the
 * tabs kept on screen.
 */
export function PuzzleSourceField({ values: s, set, seenBy, clubHandle, error }: Props) {
  const [open, setOpen] = useState<OpenPicker>(null)
  // The chosen library puzzle's NAME, for the caption. Local, not a setup key:
  // `create_game` strips `puzzle_id` from the club's saved default (it is an
  // instance, not a preference), so a reopened dialog never arrives holding a
  // puzzle whose title we would have to go and look up. It is chosen and shown
  // within one lifetime of this field, which is exactly what local state is.
  const [libraryTitle, setLibraryTitle] = useState<string | null>(null)

  // WHICH DATE a weekday resolves to. Asked HERE rather than in the picker,
  // because the answer depends on `seen_by` — the player set — which lives in
  // the setup form and can change after the picker closes. Unchecking someone
  // brings a puzzle back, and a date resolved once inside a modal you have
  // already shut would be quietly wrong.
  //
  // Stamped with the request it answers, so "we're still asking" is DERIVED
  // from a stale stamp rather than set synchronously in an effect. The
  // distinction is real: before the answer lands, this must not read as "none
  // left" — the same three-state handling SetupNextPuzzleSection uses.
  const weekday = s.weekday ?? DEFAULT_WEEKDAY
  const seenKey = seenBy.join(',')
  const nextKey = `${weekday}:${seenKey}`
  const [nextDate, setNextDate] = useState<{ key: string; date: string | null } | null>(null)
  const wantsWeekday = s.source === 'nyt' && !s.date

  useEffect(() => {
    if (!wantsWeekday) return
    let active = true
    void (async () => {
      const { data } = await db.rpc('next_nyt_date_for_club', {
        seen_by: seenKey ? seenKey.split(',') : [],
        dow: weekday,
      })
      if (active) setNextDate({ key: nextKey, date: (data as string | null) ?? null })
    })()
    return () => {
      active = false
    }
  }, [wantsWeekday, nextKey, seenKey, weekday])

  const resolved = nextDate?.key === nextKey ? nextDate.date : undefined

  return (
    <>
      <Field label={summarize(s, resolved, libraryTitle)} name="puzzle_source" error={error} group>
        <div className={cls('segmented', styles.sources)} role="group" aria-label="Puzzle source">
          <button type="button" aria-pressed={s.source === 'library'} onClick={() => setOpen('library')}>
            Library
          </button>
          <button type="button" aria-pressed={s.source === 'nyt'} onClick={() => setOpen('nyt')}>
            NYT
          </button>
          <button type="button" aria-pressed={s.source === 'guardian'} onClick={() => setOpen('guardian')}>
            Guardian
          </button>
          <button type="button" aria-pressed={s.source === 'upload'} onClick={() => setOpen('upload')}>
            Upload
          </button>
        </div>
      </Field>

      {/*
        PORTALED TO THE BODY, and it is not optional.

        A blocking modal asks for `--z-modal-blocking` (5000), well above the
        setup dialog's `--z-modal-normal` (2200) — but a z-index only ranks a
        node against its siblings inside the nearest stacking context, and the
        setup panel makes one: it is draggable, so react-rnd inlines a
        `transform` on it, and a transform creates a stacking context. Rendered
        as a child, a picker is pinned inside the setup dialog's own 2200 and
        paints UNDERNEATH it — while its scrim, which is fixed-position and
        full-viewport, dims the screen perfectly well. The symptom is the whole
        app going dark with nothing on top of it.

        `SetupGameModal` avoids this for the game's Help by rendering it as a
        SIBLING of the panel rather than a child. A field cannot do that — it is
        several levels inside the form — so it leaves the tree instead.
      */}
      {createPortal(
        <>
      {open === 'library' && (
        <LibraryPickerBlockingModal
          clubHandle={clubHandle}
          onClose={() => setOpen(null)}
          onPick={(p) => {
            chooseSource('library')
            set('puzzle_id', p.id)
            setLibraryTitle(`${p.title}${p.author ? ` · ${p.author}` : ''}`)
            setOpen(null)
          }}
        />
      )}
      {open === 'nyt' && (
        <NytPickerBlockingModal
          onClose={() => setOpen(null)}
          onPick={(choice) => {
            chooseSource('nyt')
            // Exactly one of the two, always: a weekday clears any override and
            // an override clears the weekday, because they answer one question.
            set('weekday', choice.weekday)
            set('date', choice.date)
            setOpen(null)
          }}
        />
      )}
      {open === 'guardian' && (
        <GuardianPickerBlockingModal
          onClose={() => setOpen(null)}
          onPick={(slug) => {
            chooseSource('guardian')
            set('series', slug)
            setOpen(null)
          }}
        />
      )}
      {open === 'upload' && (
        <UploadPickerBlockingModal
          onClose={() => setOpen(null)}
          onPick={({ board, filename }) => {
            chooseSource('upload')
            set('board', board)
            set('filename', filename)
            setOpen(null)
          }}
        />
      )}
        </>,
        document.body,
      )}
    </>
  )

  /**
   * Switch source, clearing what the OTHER three left behind.
   *
   * The tabs did this in four hand-written `onClick`s, and only for `board` +
   * `filename` — the two whose staleness was dangerous, since an upload's
   * solution grid riding along in `setup` would leak the answers. Doing it in
   * one place lets it be complete instead of just careful: nothing from a
   * source you are no longer using survives into the game you start.
   */
  function chooseSource(source: CrosswordsValues['source']) {
    set('source', source)
    if (source !== 'library') {
      set('puzzle_id', undefined)
      setLibraryTitle(null)
    }
    if (source !== 'nyt') {
      set('date', undefined)
    }
    if (source !== 'guardian') set('series', undefined)
    if (source !== 'upload') {
      set('board', undefined)
      set('filename', undefined)
    }
  }
}
