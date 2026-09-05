// cs-unmet

import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { FailureLine } from '../feedback/FailureLine'
import { useProfile, setProfileColor } from '../session/useProfile'
import { NormalModal } from '../floating-panels/NormalModal'
import actionRow from '../floating-panels/modalActions.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { ReadOnlyField } from '../fields/ReadOnlyField'
import { ColorField } from '../fields/ColorField'
import { reportUnhandled } from '../supabase/dbEnvelope'

type Props = {
  session: Session
  /** Save succeeded — the parent closes the dialog. */
  onSaved: () => void
  /** Cancel / Esc / X — the parent closes the dialog. */
  onCancel: () => void
}

/**
 * The "Edit profile" popup, launched from the user menu. A
 * `FloatingPanel` (not a route) so the page underneath — chat, game
 * state, the invitation popups — stays mounted and live behind it.
 *
 * Today the only editable field is the player color: a swatch picker
 * over the 8-entry palette (`MEMBER_COLORS`), each rendered as its
 * actual color circle + name, defaulting to the current color.
 * Username is shown but immutable in v1. Save calls
 * `common.update_profile_color` and optimistically updates the shared
 * profile store (`setProfileColor`) so the menu dot repaints at once.
 *
 * Lifecycle mirrors the other dialogs: App conditionally renders us —
 * mounting opens, unmounting closes; we hold no "is open" state.
 */
/** What the form holds, keyed by the name it is SENT AS — `new_color` is
 *  `common.update_profile_color`'s own parameter. */
type Values = { new_color: string }

/** What `common.update_profile_color` puts in `data`. It writes no message —
 *  the dialog closes and the dot repaints, which says it — so `result` is the
 *  whole answer and the only thing a branch can assert about it. */
type ColorAnswer = { result: 'saved' }

export function EditProfileModal({ session, onSaved, onCancel }: Props) {
  const profile = useProfile(session)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  async function onSubmit({ new_color }: Values) {
    setBusy(true)
    setErrors({})
    const res = await runRpc<ColorAnswer>(
      commonDb.rpc('update_profile_color', { new_color }),
    )
    if (res.type === 'not-ok') {
      setBusy(false)
      // Every outcome here is a fault — the picker offers eight swatches and
      // nothing else — so this line is what remains once the modal is
      // dismissed rather than the primary way anyone hears about it.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      return
    } else if (res.type === 'ok' && res.data.result === 'saved') {
      setProfileColor(new_color) // live-update the menu dot + any reader
      onSaved()
      return
    } else {
      // Clears `busy` as well as screaming: `onSaved` is what unmounts this
      // dialog, so an answer nobody handled would leave Save disabled with only
      // Cancel as a way out. The color is NOT written — an unhandled answer is
      // no evidence the server took it, and the dot would then lie.
      setBusy(false)
      reportUnhandled('update_profile_color', res)
      return
    }
  }

  return (
    <NormalModal
      title="Edit profile"
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it. Before this, the height was a
      // fixed pixel count nobody derived (F23 → C).
      fitContent
      defaultSize={{ width: 380, height: 460 }}
    >
      {/* NOT RENDERED until the profile is in hand, which is what the dialog
          used to spell as `picked ?? profile?.color ?? null` plus a Save
          disabled on the null. `initialValues` is read once at mount, so the
          swatch that starts selected is the color you actually have. */}
      {profile === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <StandardForm
          initialValues={{ new_color: profile.color } satisfies Values}
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

              <ColorField
                name="new_color"
                value={values.new_color}
                onChange={(v) => set('new_color', v)}
                error={errors.new_color}
                disabled={busy}
              />

              <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>

              <div className={actionRow.modalActions}>
                <CancelButton onClick={onCancel} disabled={busy} />
                <StandardButton
                  name={busy ? 'Saving…' : 'Save'}
                  type="submit"
                  weight="primary"
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
