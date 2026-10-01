// cs-blessed-definitions

import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME } from '../forms/formState'
import { FailureLine } from '../forms/FailureLine'
import { setShownWordEditDialog, type ShownWordEditDialog } from './wordEditStore'
import { Dialog } from '../floating-panels/Dialog'
import { cls } from '../utils/cls'
import buttonRow from '../floating-panels/modalButtons.module.css'
import styles from './WordEditDialog.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { CancelButton } from '../buttons/CancelButton'
import { useWordRow } from './useWordRow'
import { useWordEditCalls } from './useWordEditCalls'
import { WordEditFields } from './WordEditFields'
import type { WordFormValues } from './wordFieldValues'

/**
 * The dictionary-curation form — edit an existing word, or add one (the `add`
 * mode is the same form plus the word field). Mounted once at the app root and
 * opened through `wordEditStore`; editors only, and the RPCs re-check that.
 *
 * Save applies live and journals to `common.words_edits`; the `note` box is the
 * curator's aside to the upstream word-list process and goes only to the
 * journal. Numbers are plain inputs; the RPC range-checks, so a typo is a clean
 * inline error.
 *
 * The row is `useWordRow`'s, the calls `useWordEditCalls`', and the inputs
 * `WordEditFields`'.
 */
export function WordEditDialog({ request }: { request: ShownWordEditDialog }) {
  const isEditing = request.mode === 'edit'
  const { row, failure } = useWordRow(request)
  const calls = useWordEditCalls({ request, row })

  function close() {
    setShownWordEditDialog(null)
  }

  return (
    <Dialog
      persistKey="puzpuzpuz:word-edit:rect"
      title={request.mode === 'edit' ? `Edit "${request.word.toUpperCase()}"` : 'Add word'}
      onClose={close}
      // Height is the content's — the number below is only the first-paint seed
      // (safe beside `persistKey` on a floating panel that cannot be resized;
      // see `FloatingPanel`'s `fitContent`).
      fitContent
      defaultSize={{ width: 380, height: 500 }}
      resizable={false}
    >
      {failure !== null ? (
        <FailureLine>{failure}</FailureLine>
      ) : row === null ? (
        <p className="muted">Loading…</p>
      ) : (
        // Not rendered until the row is in: `initialValues` is read once, at
        // mount.
        <StandardForm
          initialValues={
            {
              ...row,
              new_word: request.mode === 'edit' ? request.word : '',
              note: '',
            } satisfies WordFormValues
          }
          onSubmit={calls.save}
        >
          {({ values, set }) => (
            <>
              <WordEditFields
                values={values}
                set={set}
                errors={calls.errors}
                isEditing={isEditing}
              />
              <FailureLine>{calls.errors[FORM_ERROR_KEYNAME]}</FailureLine>
              {/* Delete is the LEADING action — alone on the left, away from the
                  pair you reach for on the way out. */}
              <div className={cls(buttonRow.modalButtons, styles.pinBottom)}>
                {isEditing && (
                  <StandardButton
                    show="label"
                    label="Delete"
                    tone="destructive"
                    className={buttonRow.leading}
                    onClick={() => calls.deleteWord(values.note)}
                    disabled={calls.isPending}
                  />
                )}
                <CancelButton show="label" onClick={close} disabled={calls.isPending} />
                <FormSubmitButton show="label" label="Save" disabled={calls.isPending} />
              </div>
            </>
          )}
        </StandardForm>
      )}
    </Dialog>
  )
}
