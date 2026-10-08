// cs-unmet

import { useState } from 'react'
import { FormSubmitButton } from '@/common/buttons/FormSubmitButton'
import { NumberField } from '@/common/fields/NumberField'
import { SelectField } from '@/common/fields/SelectField'
import { TextField } from '@/common/fields/TextField'
import { FailureLine } from '@/common/forms/FailureLine'
import { FORM_ERROR_KEYNAME, type FormErrors } from '@/common/forms/formState'
import { StandardForm } from '@/common/forms/StandardForm'
import { DICT_BAND_LABELS, dictBandValue } from '@/common/setup-form/dictBand'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import styles from './RatingForm.module.css'

/** What the form holds, keyed by the name each is SENT AS. The seconds box
 *  holds `NaN` while it is empty, which `NumberField` reports honestly. */
type Values = {
  rated_difficulty: string
  suggested_band: string
  seconds_reported: number
  comment: string
}

/** What `wordleone.rate_puzzle` puts in `data`. */
type RatedAnswer = { result: 'rated' }

type Props = {
  gameId: string
  // The answer while the board shows it — solved or revealed — else null: a
  // lost game keeps it hidden until Reveal, and so does this form.
  shownAnswer: string | null
  // The answer's band in the word list today (null if it has left the list),
  // so the player can say where they think it belongs.
  targetBand: number | null
}

/**
 * The puzzle-feedback survey (plans/wordleone.md → The ratings), in the
 * keyboard's place once the game has ended — temporary, like the table it
 * feeds. Every field is optional; the server copies the puzzle and the
 * player's play beside them. A save leaves a thank-you in its place.
 *
 * It asks two things apart: how hard the puzzle felt, and what band the answer
 * belongs in — so an obscure answer can be told from a hard puzzle.
 *
 * The keyboard's own width, and at least its height, so the board column does
 * not move when one replaces the other.
 */
export function RatingForm({ gameId, shownAnswer, targetBand }: Props) {
  const answerName = shownAnswer === null
    ? 'The answer'
    : shownAnswer.toUpperCase()

  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  async function saveRating({
    rated_difficulty,
    suggested_band,
    seconds_reported,
    comment,
  }: Values) {
    setIsSaving(true)
    setErrors({})
    const res = await runRpc<RatedAnswer>(
      // A field left blank is left out: the server takes it as null.
      db.rpc('rate_puzzle', {
        p_game_id: gameId,
        p_rated_difficulty:
          rated_difficulty === ''
            ? undefined
            : Number(rated_difficulty),
        p_suggested_band:
          suggested_band === ''
            ? undefined
            : Number(suggested_band),
        p_seconds_reported:
          Number.isNaN(seconds_reported)
            ? undefined
            : seconds_reported,
        p_comment: comment,
      }),
    )
    setIsSaving(false)
    if (res.type === 'not-ok') {
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    } else if (res.type === 'ok' && res.data.result === 'rated') {
      setIsSaved(true)
      return
    } else {
      reportUnhandled('rate_puzzle', res)
      return
    }
  }

  // Once saved, the thanks stands alone in the same slot.
  if (isSaved) {
    return (
      <div className={styles.ratingForm}>
        <p className={styles.heading}>Saved — thanks!</p>
      </div>
    )
  }

  return (
    <StandardForm
      className={styles.ratingForm}
      initialValues={
        {
          rated_difficulty: '',
          suggested_band: '',
          seconds_reported: NaN,
          comment: '',
        } satisfies Values
      }
      onSubmit={saveRating}
    >
      {({ values, set }) => (
        <>
          <p className={styles.heading}>
            How was this puzzle?{' '}
            <span className={styles.answerBand}>
              {targetBand === null
                ? `${answerName} isn't in the word list now.`
                : `${answerName} is band ${dictBandValue(targetBand)}.`}
            </span>
          </p>
          <div className={styles.row}>
            <SelectField
              name="rated_difficulty"
              label="How hard?"
              value={values.rated_difficulty}
              onChange={(v) => set('rated_difficulty', v)}
              error={errors.rated_difficulty}
              disabled={isSaving}
            >
              <option value="">—</option>
              <option value="1">1 · very easy</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
              <option value="7">7 · very hard</option>
            </SelectField>
            <SelectField
              name="suggested_band"
              label="Its band should be"
              value={values.suggested_band}
              onChange={(v) => set('suggested_band', v)}
              error={errors.suggested_band}
              disabled={isSaving}
            >
              <option value="">—</option>
              {DICT_BAND_LABELS.map((_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {dictBandValue(i + 1)}
                </option>
              ))}
            </SelectField>
            <NumberField
              name="seconds_reported"
              label="Seconds"
              value={values.seconds_reported}
              onChange={(v) => set('seconds_reported', v)}
              min={0}
              chars={5}
              error={errors.seconds_reported}
              disabled={isSaving}
            />
          </div>
          <div className={styles.row}>
            <div className={styles.comment}>
              <TextField
                name="comment"
                label="Comment"
                value={values.comment}
                onChange={(v) => set('comment', v)}
                maxLength={1000}
                error={errors.comment}
                disabled={isSaving}
              />
            </div>
            <FormSubmitButton
              show="label"
              label={isSaving ? 'Saving…' : 'Save'}
              disabled={isSaving}
            />
          </div>
          <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
        </>
      )}
    </StandardForm>
  )
}
