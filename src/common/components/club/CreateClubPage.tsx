import { useEffect, useState, type SubmitEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db as commonDb } from '../../db'
import { navigate } from '../../lib/routing/router'
import styles from './CreateClubPage.module.css'

type Props = {
  session: Session
}

/**
 * Slugify a user-typed name into the club's URL handle.
 *
 * Mirrors `common.slugify_club_name` in the SQL baseline — same
 * shape (lowercase → strip non-alphanumeric → collapse to single
 * hyphens → trim ends → cap at 40 chars). Used to pre-validate the
 * derived handle on the FE (see `handleError`) and to name the handle
 * in the "name is taken" message; the server runs the canonical
 * version before insert.
 *
 * Keep in sync with `common.slugify_club_name` in
 * 20260615000000_common.sql.
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
 * Validate the handle a name would slugify to, against `common.clubs`'
 * CHECK (`^=?[a-z][a-z0-9-]{2,29}$`): start with a letter, then 2–29
 * more url-safe chars (3–30 total). Returns a friendly message, or null
 * if the handle is valid. Without this, a too-short name (e.g. "Jo")
 * surfaces the raw Postgres constraint name instead of guidance.
 */
function handleError(slug: string): string | null {
  if (/^[a-z][a-z0-9-]{2,29}$/.test(slug)) return null
  if (!slug) return 'Please use at least one letter or number in the name.'
  if (!/^[a-z]/.test(slug)) {
    return `That makes the handle “${slug}”, which must start with a letter — try a name beginning with a letter.`
  }
  if (slug.length < 3) {
    return `That makes the handle “${slug}”, which is too short — the handle needs at least 3 characters.`
  }
  return `That makes the handle “${slug}”, which is too long — please shorten the name.`
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

  // Escape cancels — the keyboard twin of the Cancel button. The page reads
  // as a modal (a lone card over nothing), so Escape-to-dismiss is the
  // expected key; this is what the FloatingPanel dialogs do natively, but
  // this is a routed PAGE, so it wires its own. Window-level so it works
  // from inside the form fields too (typed text is cheap to lose — same
  // judgment as the Cancel button, which doesn't confirm). Inert while the
  // create RPC is in flight, matching Cancel's disabled={busy}.
  useEffect(
    function escapeCancels() {
      if (busy) return
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') navigate('/')
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    },
    [busy],
  )

  // The handle the current name would slugify to. Shown discreetly in
  // the "Club name" label so the validation (which is really about the
  // handle, not the name) makes sense — e.g. "JB!" → handle "jb", too
  // short. slugify already trims, so this matches slugify(name.trim()).
  const previewSlug = slugify(name)

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please give the club a name.')
      return
    }
    // Validate the derived handle before hitting the server so a
    // too-short / non-letter-leading name gets guidance, not the raw
    // clubs_handle CHECK violation.
    const slugErr = handleError(previewSlug)
    if (slugErr) {
      setError(slugErr)
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
        club_name: trimmed,
        member_usernames: usernames,
      })
      .single()
    setBusy(false)

    if (error || !data) {
      const code = (error as { code?: string } | null)?.code
      // 23505 = unique_violation on the clubs.handle PK. Surface it as
      // a friendly "name is taken" instead of the raw "duplicate key"
      // text.
      if (code === '23505') {
        setError(
          `That name is taken (handle "${previewSlug}" exists in this database). Pick a different name.`,
        )
      } else if (code === '23514') {
        // check_violation — the handle CHECK (or similar). handleError
        // catches the common cases above, but this is the backstop so a
        // raw constraint name never reaches the user.
        setError('That club name can’t be used — please try a different one.')
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

      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.labelRow}>
            Club name
            {/* Discreet preview of the derived URL handle, so the
                handle-based validation reads sensibly ("JB!" → "jb").
                Hidden when the name is blank; "(empty)" when the name
                has no slug-able characters at all (e.g. "!!!"). */}
            {name.trim() && (
              <span className={styles.handleHint}>
                {previewSlug ? `(becomes handle: ${previewSlug})` : '(empty)'}
              </span>
            )}
          </span>
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

        <label className={styles.field}>
          Other members' usernames
          <textarea
            className={styles.textarea}
            value={usernamesInput}
            onChange={(e) => setUsernamesInput(e.target.value)}
            disabled={busy}
            placeholder="alice, bob"
            rows={2}
          />
          <span className="muted">
            Comma or space separated. You're added automatically.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <div className={styles.buttonRow}>
          <button
            type="button"
            className="secondary"
            onClick={() => navigate('/')}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create club'}
          </button>
        </div>
      </form>
    </div>
  )
}
