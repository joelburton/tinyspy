// cs-unmet

import { formFailureText } from '../../lib/game/serverError'
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'
import { useProfile, setProfileColor } from '../../hooks/session/useProfile'
import { FloatingPanel } from '../floating-panels/FloatingPanel'
import actionRow from '../floating-panels/modalActions.module.css'
import styles from './EditProfileModal.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { ReadOnlyField } from '../fields/ReadOnlyField'
import { ColorField } from '../fields/ColorField'

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
export function EditProfileModal({ session, onSaved, onCancel }: Props) {
  const profile = useProfile(session)
  // The picked color, or — until the user picks — the current one
  // (so the dialog opens with the current color preselected). Null only
  // in the brief window before the profile store resolves.
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? profile?.color ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!selected) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await commonDb.rpc('update_profile_color', {
      new_color: selected,
    })
    if (rpcError) {
      setBusy(false)
      // Split by surface rule: validation ("That username is taken") stays on
      // the form's line; a fault pops the modal and the line stays empty.
      setError(formFailureText(rpcError, 'profile'))
      return
    }
    setProfileColor(selected) // live-update the menu dot + any reader
    onSaved()
  }

  return (
    <FloatingPanel
      family="modal-normal"
      title="Edit profile"
      onClose={onCancel}
      resizable={false}
      // Height is the content's: the number below is only the first-paint
      // seed, and `fitContent` grows past it. Before this, the height was a
      // fixed pixel count nobody derived (F23 → C).
      fitContent
      defaultSize={{ width: 380, height: 460 }}
    >
      <div className={styles.content}>
        <ReadOnlyField label="Username">{profile?.username ?? '…'}</ReadOnlyField>

        <ColorField value={selected} onChange={setPicked} disabled={busy} />

        {error && <p className="error">{error}</p>}

        <div className={actionRow.modalActions}>
          <CancelButton onClick={onCancel} disabled={busy} />
          <StandardButton
            name={busy ? 'Saving…' : 'Save'}
            weight="primary"
            onClick={handleSave}
            disabled={busy || !selected}
            autoFocus
          />
        </div>
      </div>
    </FloatingPanel>
  )
}
