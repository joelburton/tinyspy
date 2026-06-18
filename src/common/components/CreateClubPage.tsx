import { useState, type SubmitEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../db'
import { Link } from '../lib/Link'
import { navigate } from '../lib/router'

type Props = {
  session: Session
}

/**
 * Slugify a user-typed name into the club's URL handle.
 *
 * Mirrors `common.slugify_club_name` in the SQL baseline — same
 * shape (lowercase → strip non-alphanumeric → collapse to single
 * hyphens → trim ends → cap at 40 chars). Used for the live
 * preview as the user types; the server runs the canonical
 * version before insert, so this is purely for UX feedback.
 *
 * Keep in sync with `common.slugify_club_name` in
 * 20260615000000_common_baseline.sql.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Create-club form. POSTs to common.create_club; on success,
 * navigates to the new club's page.
 *
 * The "Club name" field doubles as the handle source — we slugify
 * it live and show the preview ("/c/joels-crossword-club") as the
 * user types. There's no separate handle input; if they want a
 * different URL they edit the name. Same pattern keeps the
 * handle/name relationship one-way: handle is derived FROM name,
 * never typed independently.
 *
 * v1 club semantics (see CLAUDE.md / docs/common.md / project
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
 * every page-level component. The next-line disable acknowledges
 * the intentional unused — this project's lint config doesn't
 * auto-exempt underscore-prefixed names.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CreateClubPage({ session: _session }: Props) {
  const [name, setName] = useState('')
  const [usernamesInput, setUsernamesInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewSlug = slugify(name)

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
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
    // create_club returns `text` (just the handle) now — the .single()
    // gives us a string in `data` after the schema regen.
    const { data, error } = await commonDb
      .rpc('create_club', {
        club_name: name.trim(),
        member_usernames: usernames,
      })
      .single()
    setBusy(false)

    if (error || !data) {
      // 23505 = unique_violation on the clubs.handle PK. Surface
      // it as a friendly "name is taken" instead of the raw
      // "duplicate key value violates unique constraint" text.
      const code = (error as { code?: string } | null)?.code
      if (code === '23505') {
        setError(
          `That name is taken (handle "${previewSlug}" exists in this database). Pick a different name.`,
        )
      } else {
        setError(error?.message ?? 'Could not create the club.')
      }
      return
    }
    navigate(`/c/${data}`)
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
          {/* Live preview of the URL handle. The handle is also
              the PK — immutable — so this is the URL forever. The
              friends can edit the name above to fine-tune it
              before submitting. */}
          {previewSlug ? (
            <span className="muted">
              URL: <code>/c/{previewSlug}</code>
            </span>
          ) : (
            <span className="muted">
              The URL will be derived from this name.
            </span>
          )}
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
