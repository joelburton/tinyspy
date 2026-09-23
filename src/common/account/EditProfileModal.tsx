// cs-blessed-account

import { useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { FailureLine } from '../forms/FailureLine'
import { useProfile, setProfileFields } from '../session/useProfile'
import { NormalModal } from '../floating-panels/NormalModal'
import actionRow from '../floating-panels/modalActions.module.css'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { CancelButton } from '../buttons/CancelButton'
import { ReadOnlyField } from '../fields/ReadOnlyField'
import { ColorChoiceField } from '../fields/ColorChoiceField'
import { CheckboxField } from '../fields/CheckboxField'
import { reportUnhandled } from '../supabase/dbEnvelope'

type Props = {
  // Save succeeded — the parent closes the dialog.
  onSaved: () => void
  // Cancel / Esc / X — the parent closes the dialog.
  onCancel: () => void
}

/** What the form holds, keyed by the name it is SENT AS — both are
 *  `common.update_profile`'s own parameters. */
type Values = { new_color: string; new_sounds_enabled: boolean }

/** What `common.update_profile` puts in `data`. It writes no message — the
 *  dialog closes and the settings take effect, which says it — so `result` is
 *  the whole answer and the only thing a branch can assert about it. */
type SavedAnswer = { result: 'saved' }

/**
 * The **"Edit profile" dialog** — a `<NormalModal>`, opened from the account
 * submenu of whichever page menu is on screen. The page underneath stays
 * mounted and live behind it.
 *
 * It edits two things, starting on what you have: your player color, through
 * `<ColorChoiceField>`, and "Enable sounds", which turns every sound the app
 * plays on or off. The username is shown and cannot be changed. Saving sends
 * both in one `common.update_profile` call and then tells the shared profile
 * store what the server now holds, so the menu dot repaints and the next sound
 * obeys the new setting.
 *
 * Mount it to open and unmount it to close — it holds no open/closed state of
 * its own, and `onSaved` / `onCancel` are how it asks to be unmounted.
 */
export function EditProfileModal({ onSaved, onCancel }: Props) {
  const profile = useProfile()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  async function onSubmit({ new_color, new_sounds_enabled }: Values) {
    setBusy(true)
    setErrors({})
    const res = await runRpc<SavedAnswer>(
      commonDb.rpc('update_profile', { new_color, new_sounds_enabled }),
    )
    if (res.type === 'not-ok') {
      setBusy(false)
      // Every outcome here is a fault — the picker offers eight swatches and
      // the sounds row is a checkbox — so this line is what remains once the
      // modal is dismissed rather than the primary way anyone hears about it.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    } else if (res.type === 'ok' && res.data.result === 'saved') {
      // Live-update the menu dot, and every later sound, from what was saved.
      setProfileFields({ color: new_color, sounds_enabled: new_sounds_enabled })
      onSaved()
      return
    } else {
      // Clears `busy` as well as screaming: `onSaved` is what unmounts this
      // dialog, so an answer nobody handled would leave Save disabled with only
      // Cancel as a way out. The store is NOT written — an unhandled answer is
      // no evidence the server took it, and the dot would then lie.
      setBusy(false)
      reportUnhandled('update_profile', res)
      return
    }
  }

  return (
    <NormalModal
      title="Edit profile"
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it.
      fitContent
      defaultSize={{ width: 380, height: 460 }}
    >
      {/* The profile is in hand by the time this mounts — it opens from a menu
          row that exists only past the session gate — so the branch belongs to
          `Profile | null` rather than to a loading moment. `initialValues` is
          read once at mount, which is why the form waits for it: the swatch
          that starts selected has to be the color you actually have. */}
      {profile === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <StandardForm
          initialValues={{
            new_color: profile.color,
            new_sounds_enabled: profile.sounds_enabled,
          } satisfies Values}
          onSubmit={onSubmit}
        >
          {({ values, set }) => (
            <>
              <ReadOnlyField
                name="username"
                label="Username"
                value={profile.username}
                error={errors.username}
              />

              <ColorChoiceField
                name="new_color"
                value={values.new_color}
                onChange={(v) => set('new_color', v)}
                error={errors.new_color}
                disabled={busy}
              />

              <CheckboxField
                name="new_sounds_enabled"
                value={values.new_sounds_enabled}
                onChange={(v) => set('new_sounds_enabled', v)}
                error={errors.new_sounds_enabled}
                disabled={busy}
              >
                Enable sounds
              </CheckboxField>

              <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>

              <div className={actionRow.modalActions}>
                <CancelButton show="label" onClick={onCancel} disabled={busy} />
                <FormSubmitButton
                  show="label"
                  label={busy ? 'Saving…' : 'Save'}
                  disabled={busy}
                  autoFocus
                />
              </div>
            </>
          )}
        </StandardForm>
      )}
    </NormalModal>
  )
}
