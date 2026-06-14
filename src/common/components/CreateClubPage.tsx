import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'

type Props = {
  session: Session
}

/**
 * Create-club form. POSTs to common.create_club; on success,
 * navigates to the new club's page.
 *
 * v1 club semantics (see CLAUDE.md / docs/naming.md / project
 * memory): the membership list is fixed at creation. There's no
 * "invite later" flow yet. The creator is auto-added by the RPC,
 * so this form only asks for the other members.
 *
 * UX is intentionally minimal — alpha-software prior; we're
 * optimizing for "Joel and a couple friends can use this" not
 * "looks polished for strangers." A real picker for member
 * selection (typeahead from common.profiles) lands when we have
 * enough users to make that worthwhile.
 *
 * Note: this form doesn't take `session` for anything yet — the
 * server-side RPC uses `auth.uid()` directly. The prop is here so
 * we have it if a future "this is who you are" affordance shows
 * up, and so the App.tsx routing block can pass it uniformly to
 * every page-level component.
 *
 * eslint-disable-next-line @typescript-eslint/no-unused-vars
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CreateClubPage({ session: _session }: Props) {
  const [name, setName] = useState('')
  const [usernamesInput, setUsernamesInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Please give the club a name.')
      return
    }
    const usernames = usernamesInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    setBusy(true)
    const { data, error } = await commonDb
      .rpc('create_club', {
        club_name: name.trim(),
        member_usernames: usernames,
      })
      .single()
    setBusy(false)

    if (error || !data) {
      setError(error?.message ?? 'Could not create the club.')
      return
    }
    navigate(`/c/${data.handle}`)
  }

  return (
    <div className="card">
      <h1>Create a club</h1>
      <p className="muted">
        A club is a fixed group of friends who play games together.
        Membership is set at creation and can't be changed later
        (no invitations, no leaving). Chat and any in-progress games
        in this club will be visible to all members.
      </p>

      <form onSubmit={onSubmit} className="actions">
        <label>
          Club name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="Joel and Leah"
            autoFocus
            required
          />
        </label>

        <label>
          Other members' usernames
          <input
            type="text"
            value={usernamesInput}
            onChange={(e) => setUsernamesInput(e.target.value)}
            disabled={busy}
            placeholder="alice, bob"
          />
          <span className="muted">
            Comma or space separated. You're added automatically.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create club'}
          </button>
          <Link to="/" className="link-button">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
