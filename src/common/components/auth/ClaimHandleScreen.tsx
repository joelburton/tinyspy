// cs-unmet

import { StandardForm } from '../fields/StandardForm'
import { useState } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { supabase } from '../../lib/supabase/supabase'
import { cls } from '../../lib/util/cls'
import { defaultColorFor } from '../../lib/color/memberColor'
import styles from './ClaimHandleScreen.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { CancelButton } from '../buttons/CancelButton'
import { TextField } from '../fields/TextField'
import { ColorField } from '../fields/ColorField'

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
 * `=<username>`; immutable post-claim) and a player color. The color is
 * pre-selected from a deterministic hash of the SUGGESTED handle
 * (`defaultColorFor`, seeded once on mount — it doesn't follow the field as
 * they type), and they can change it here or later from the profile dialog.
 *
 * The username regex is enforced both in the FE (instant feedback) and
 * on the server (CHECK + the RPC's P0001 raise), kept in sync with the
 * SQL CHECK in 20260615000000_common.sql.
 *
 * Error mapping (the RPC's SQLSTATE codes → display):
 *   - P0001 "username must be 3–15 chars …" → show as-is
 *   - 23505 unique_violation                → "that username is taken"
 *   - 23503 foreign_key_violation           → "session expired,
 *                                              sign in again" + signOut
 *   - anything else                         → raw message
 */

// Mirror of the SQL CHECK regex on common.profiles.username.
// Update both together; tests in supabase/tests/common/
// claim_username_test.sql gate the server side.
const HANDLE_REGEX = /^[a-z][a-z0-9-]{2,14}$/

/**
 * Derive a suggested handle from an email address — used to pre-fill
 * the field as an editable default. Normalizes the local-part
 * (lowercase, drop invalid chars, drop leading non-letters, truncate
 * to 15) and returns the result only if it satisfies HANDLE_REGEX —
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
    .slice(0, 15)
  return HANDLE_REGEX.test(normalized) ? normalized : ''
}

/** The handle rules, said once — they are the entry help while they hold and
 *  the error the moment they don't. */
const RULES =
  '3–15 characters: lowercase letters, digits, and hyphens. Must start with a letter.'

export function ClaimHandleScreen({ onClaimed, email }: Props) {
  // Pre-fill with the email-derived suggestion as an editable default.
  const [desired, setDesired] = useState(() => suggestedHandleFromEmail(email))
  // The selected color. Seeded ONCE from the suggested handle (a deterministic
  // hash, so two people rarely start on the same color) and then owned entirely
  // by the player.
  //
  // It deliberately does NOT track the username field. Deriving it live (say
  // `picked ?? defaultColorFor(desired)`) makes the selection hop from swatch to
  // swatch on every keystroke — you type in one control and watch another
  // flicker. A default is worth having; one that keeps re-deciding while you
  // type isn't.
  const [selected, setSelected] = useState(() =>
    defaultColorFor(suggestedHandleFromEmail(email)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // FE-side regex check, shown as you type. Empty string → no hint
  // (don't badger the user before they've typed anything).
  const localValid = desired.length === 0 || HANDLE_REGEX.test(desired)

  async function onSubmit() {
    setError(null)

    if (!HANDLE_REGEX.test(desired)) {
      setError('Username must be 3–15 chars, lowercase letters/digits/hyphens, starting with a letter.')
      return
    }

    setBusy(true)
    const res = await runRpc(
      commonDb.rpc('claim_username', { desired, chosen_color: selected }),
    )
    setBusy(false)

    if (res.type !== 'ok') {
      // Every answer goes on the form's line. A fault has already raised the
      // modal, and the line is what remains once that is dismissed.
      setError(res.message)
      // PN018 is the one outcome with something to DO: the auth.users row
      // behind this JWT is gone (a stale token after a db:reset, a deleted
      // account), so there is no recovering the session. Reading the code here
      // picks a RECOVERY, not a severity — the server already said fault.
      if (res.dbcode === 'PN018') await supabase.auth.signOut()
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
    <div className="pageHeaderAndMainArea">
      <div className={cls('card', 'pageMain')}>
        <h1>Let&rsquo;s set you up</h1>
        <p>
          Your username is your permanent handle — pick one you&rsquo;ll be happy with. Your color can be changed later.
        </p>

        <StandardForm onSubmit={onSubmit}>
          <TextField
            label="Username"
            value={desired}
            onChange={setDesired}
            disabled={busy}
            autoFocus
            required
            // Hard stop at the CHECK's ceiling — a handle you can't submit
            // shouldn't be typeable in the first place.
            maxLength={15}
            // The rules are entry help while they hold and the error when they
            // don't — same sentence either way, because breaking them is exactly
            // what it warns against. The field also rings the box.
            entryHelp={localValid ? RULES : undefined}
            error={localValid ? null : RULES}
          />

          <ColorField value={selected} onChange={setSelected} disabled={busy} />

          {error && <p className="error">{error}</p>}

          {/* Always-available escape (a user can land here on a stale
              session and not want — or be able — to claim anything; the
              rest of the app's chrome isn't mounted behind the needsClaim
              gate). Sits beside Accept now, styled as a real button. */}
          <div className={styles.buttonRow}>
            <CancelButton
              name="Not you? Sign out"
              disabled={busy}
              onClick={() => void handleSignOut()}
            />
            <StandardButton
              name={busy ? 'Setting up…' : 'Accept'}
              type="submit"
              weight="primary"
              disabled={busy || !HANDLE_REGEX.test(desired)}
            />
          </div>
        </StandardForm>
      </div>
    </div>
  )
}
