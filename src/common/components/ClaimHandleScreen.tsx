import { useState, type SubmitEvent } from 'react'
import { db as commonDb } from '../db'
import { supabase } from '../lib/supabase'

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
 * Username-claim gate. Rendered by App.tsx when `useSession`
 * reports `needsClaim` (= signed in but no profiles row).
 *
 * One input + one submit. The chosen handle becomes the user's
 * permanent identity: shown in chat, listed on every game roster,
 * and used as the literal handle of their solo club (`=<username>`).
 * Immutable post-claim — the "I want a different name later"
 * escape hatch is delete-and-recreate.
 *
 * The regex is enforced both in the FE (instant feedback as the
 * user types) and on the server (CHECK constraint + RPC's explicit
 * P0001 raise). The two surfaces use the same source-of-truth
 * pattern, kept in sync with the SQL CHECK in
 * 20260615000000_common.sql.
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
  // Pre-fill with the email-derived suggestion as an editable
  // default — the user can accept it as-is (one click on Claim) or
  // type over it. Lazy initializer so it runs once on mount; `email`
  // is always present here (App only renders this screen for a
  // signed-in session). Empty string when the email yields no valid
  // handle, so the field just starts blank.
  const [desired, setDesired] = useState(() => suggestedHandleFromEmail(email))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // FE-side regex check, shown as you type. Empty string → no
  // hint (don't badger the user before they've typed anything).
  const localValid = desired.length === 0 || HANDLE_REGEX.test(desired)

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

  return (
    <div className="card">
      <h1>Pick a username</h1>
      <p>
        This is your permanent handle — it shows up everywhere in
        the app (chat, rosters, URLs) and can't be changed later. So
        pick one you'll be happy with.
      </p>

      <form onSubmit={onSubmit}>
        <label>
          Username
          <input
            type="text"
            value={desired}
            onChange={(e) => setDesired(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
          <span className={localValid ? 'muted' : 'error'}>
            3–30 characters: lowercase letters, digits, and hyphens.
            Must start with a letter.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || !HANDLE_REGEX.test(desired)}>
          {busy ? 'Claiming…' : 'Claim username'}
        </button>
      </form>
    </div>
  )
}
