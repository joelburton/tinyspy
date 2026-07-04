import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'
import { useProfile, setProfileColor } from '../../hooks/session/useProfile'
import { ColorChoiceList } from './ColorChoiceList'
import { FloatingPanel } from '../panels/FloatingPanel'
import actionRow from '../panels/modalActions.module.css'
import styles from './EditProfileDialog.module.css'

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
export function EditProfileDialog({ session, onSaved, onCancel }: Props) {
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
      setError(rpcError.message)
      return
    }
    setProfileColor(selected) // live-update the menu dot + any reader
    onSaved()
  }

  return (
    <FloatingPanel
      title="Edit profile"
      onClose={onCancel}
      backdrop
      resizable={false}
      defaultSize={{ width: 380, height: 460 }}
      minWidth={320}
      minHeight={340}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <span className={styles.label}>Username</span>
          <span className={styles.username}>{profile?.username ?? '…'}</span>
        </div>

        <fieldset className={styles.field}>
          <legend className={styles.label}>Player color</legend>
          <ColorChoiceList value={selected} onChange={setPicked} disabled={busy} />
        </fieldset>

        {error && <p className="error">{error}</p>}

        <div className={actionRow.modalActions}>
          <button
            type="button"
            className="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !selected}
            autoFocus
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </FloatingPanel>
  )
}
