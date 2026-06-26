import { useState, type SubmitEvent } from 'react'
import { db as commonDb } from '../db'
import { supabase } from '../lib/supabase'
import { cls } from '../lib/cls'
import { defaultColorFor } from '../lib/memberColor'
import { ColorChoiceList } from './ColorChoiceList'
import styles from './ClaimHandleScreen.module.css'

type Props = {
  /** Re-probe the profile table after the claim_username RPC
   *  succeeds, so the parent App.tsx flips needsClaim → false and
   *  renders HomePage instead of this screen. */
  onClaimed: () => void
  /** Signed-in user's email address. Used to derive the pre-filled
   *  default username from the local-part — better than a blank field
   *  or a hardcoded "joel" that's confusing for everyone else. */
  email: string | null | undefined
}

/**
 * First-run setup gate. Rendered by App.tsx when `useSession` reports
 * `needsClaim` (= signed in but no profiles row).
 *
 * Two fields: a username (the user's permanent handle — shown in chat,
 * on every game roster, and as the literal handle of their solo club
 * `=<username>`; immutable post-claim) and a player color. The color
 * defaults to a deterministic hash of the username (`defaultColorFor`)
 * so it's pre-selected, but they can change it here or later from the
 * profile dialog.
 *
 * The username regex is enforced both in the FE (instant feedback) and
 * on the server (CHECK + the RPC's P0001 raise), kept in sync with the
 * SQL CHECK in 20260615000000_common.sql.
 *
 * Error mapping (the RPC's SQLSTATE codes → display):
 *   - P0001 "username must be 3–30 chars …" → show as-is
 *   - 23505 unique_violation                → "that username is taken"
 *   - 23503 foreign_key_violation           → "session expired,
 *                                              sign in again" + signOut
 *   - anything else                         → raw message
 */

// Mirror of the SQL CHECK regex on common.profiles.username.
// Update both together; tests in supabase/tests/common/
// claim_username_test.sql gate the server side.
const HANDLE_REGEX = /^[a-z][a-z0-9-]{2,29}$/

/**
 * Derive a suggested handle from an email address — used to pre-fill
 * the field as an editable default. Normalizes the local-part
 * (lowercase, drop invalid chars, drop leading non-letters, truncate
 * to 30) and returns the result only if it satisfies HANDLE_REGEX —
 * otherwise an empty string, so the field starts blank rather than
 * pre-filled with something misleading like "foo!" or a too-short
 * fragment.
 *
 * Examples:
 *   joel.burton@gmail.com  → "joelburton"
 *   joel+test@example.com  → "joeltest"
 *   123foo@x.com           → "foo"     (leading digits dropped)
 *   jb@x.com               → ""        (only 2 chars, fails regex)
 */
function suggestedHandleFromEmail(email: string | null | undefined): string {
  if (!email) return ''
  const localPart = email.split('@')[0] ?? ''
  const normalized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')   // strip dots, plus-tags, underscores, …
    .replace(/^[^a-z]+/, '')       // must start with a letter
    .slice(0, 30)
  return HANDLE_REGEX.test(normalized) ? normalized : ''
}

export function ClaimHandleScreen({ onClaimed, email }: Props) {
  // Pre-fill with the email-derived suggestion as an editable default.
  const [desired, setDesired] = useState(() => suggestedHandleFromEmail(email))
  // The player's explicit color pick, or null to use the username
  // default. `selected` resolves the two.
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // FE-side regex check, shown as you type. Empty string → no hint
  // (don't badger the user before they've typed anything).
  const localValid = desired.length === 0 || HANDLE_REGEX.test(desired)
  // The color shown selected: the player's pick, else a deterministic
  // default from the username (updates as they type until they pick).
  const selected = picked ?? defaultColorFor(desired)

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!HANDLE_REGEX.test(desired)) {
      setError('Username must be 3–30 chars, lowercase letters/digits/hyphens, starting with a letter.')
      return
    }

    setBusy(true)
    const { error: rpcError } = await commonDb.rpc('claim_username', {
      desired,
      chosen_color: selected,
    })
    setBusy(false)

    if (rpcError) {
      // PostgREST surfaces SQLSTATE on `.code`. Map to friendly copy.
      const code = (rpcError as { code?: string }).code
      if (code === '23505') {
        setError('That username is taken — try another.')
      } else if (code === '23503') {
        // auth.users row vanished while a stale JWT lingered (a
        // db:reset edge case). Reset back to LoginScreen.
        setError('Your session expired — signing you out.')
        await supabase.auth.signOut()
      } else {
        setError(rpcError.message)
      }
      return
    }

    onClaimed()
  }

  // The always-available escape off this screen. We deliberately DON'T lean
  // on the auth listener to flip us back to LoginScreen here: a user usually
  // reaches this screen on a stale/invalid session (a JWT that outlived its
  // auth.users row — e.g. a dev db:reset, or a deleted user in prod), and for
  // those `signOut()`'s SIGNED_OUT event doesn't reliably re-render — leaving
  // them stranded with no way out but guessing at the URL. So sign out
  // best-effort, then HARD-redirect to "/": the full reload re-runs useSession
  // from a clean slate (clearing any leftover stale JWT) and lands on
  // LoginScreen.
  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Leaving regardless — a failed revoke must not block the escape.
    }
    // HARD navigation (not the in-app router): a full reload is what re-runs
    // useSession. Client-side routing wouldn't help — the screen is gated on
    // `needsClaim`, not the path, so it'd still render with the stale session.
    window.location.assign('/')
  }

  return (
    <div className="card">
      <h1>Let&rsquo;s set you up</h1>
      <p>
        Your username is your permanent handle — it shows up everywhere
        in the app (chat, rosters, URLs) and can&rsquo;t be changed later,
        so pick one you&rsquo;ll be happy with. Your color is just a
        starting point; you can change it any time from your profile.
      </p>

      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Username</span>
          <input
            type="text"
            value={desired}
            onChange={(e) => setDesired(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
          <span className={cls(styles.help, localValid ? 'muted' : 'error')}>
            3–30 characters: lowercase letters, digits, and hyphens. Must
            start with a letter.
          </span>
        </label>

        <fieldset className={styles.field}>
          <legend className={styles.label}>Player color</legend>
          <ColorChoiceList value={selected} onChange={setPicked} disabled={busy} />
        </fieldset>

        {error && <p className="error">{error}</p>}

        {/* Always-available escape (a user can land here on a stale
            session and not want — or be able — to claim anything; the
            rest of the app's chrome isn't mounted behind the needsClaim
            gate). Sits beside Accept now, styled as a real button. */}
        <div className={styles.buttonRow}>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void handleSignOut()}
          >
            Not you? Sign out
          </button>
          <button type="submit" disabled={busy || !HANDLE_REGEX.test(desired)}>
            {busy ? 'Setting up…' : 'Accept'}
          </button>
        </div>
      </form>
    </div>
  )
}
