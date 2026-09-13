// cs-audited-simple-page

import { StandardForm } from '../forms/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { FailureLine } from '../forms/FailureLine'
import { useRef, useState } from 'react'
import { useTabRing } from '../keyboard/useTabRing'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { supabase } from '../supabase/supabase'
import { cls } from '../utils/cls'
import { defaultColorFor } from '../members/memberColor'
import styles from './ClaimHandleScreen.module.css'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { CancelButton } from '../buttons/CancelButton'
import { TextField } from '../fields/TextField'
import { ColorChoiceField } from '../fields/ColorChoiceField'
import { reportUnhandled } from '../supabase/dbEnvelope'

/** What `common.claim_username` puts in `data`. `result` sits beside the
 *  username rather than replacing it — the name is what a caller would use,
 *  `result` is what says which answer this is. */
type ClaimAnswer = { result: 'claimed'; username: string }

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

/**
 * What the form holds, keyed by the name each value is SENT AS — both are
 * `common.claim_username`'s own parameters, so PN017's `column = 'desired'`
 * lands on the username box with nothing to translate.
 */
type Values = { desired: string; chosen_color: string }

export function ClaimHandleScreen({ onClaimed, email }: Props) {
  // This page is nothing but this form, so the form IS the page's tab ring:
  // Tab cycles the handle field, the color swatches and the buttons, and never
  // walks off into the browser's chrome.
  const formRef = useRef<HTMLFormElement>(null)
  useTabRing({ within: formRef })

  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // Pre-filled with the email-derived suggestion as an editable default, and
  // the color seeded from a deterministic hash of it (so two people rarely
  // start on the same one).
  //
  // The color deliberately does NOT track the username field. Deriving it live
  // (say `picked ?? defaultColorFor(desired)`) makes the selection hop from
  // swatch to swatch on every keystroke — you type in one control and watch
  // another flicker. A default is worth having; one that keeps re-deciding
  // while you type isn't. `initialValues` is read at mount, which is exactly
  // that rule expressed once rather than per field.
  const suggested = suggestedHandleFromEmail(email)

  async function onSubmit({ desired, chosen_color }: Values) {
    setErrors({})

    if (!HANDLE_REGEX.test(desired)) {
      setErrors({ desired: RULES })
      return
    }

    setBusy(true)
    const res = await runRpc<ClaimAnswer>(
      commonDb.rpc('claim_username', { desired, chosen_color }),
    )
    setBusy(false)

    if (res.type === 'not-ok') {
      // ONE entry, under the field the server named. PN017 — the username is
      // taken — says `desired`, and it is the only thing here a player can act
      // on. Everything else says `_` and lands on the form's own line; those
      // have already raised the modal, and the line is what remains after it.
      setErrors({ [res.field ?? FORM_ERROR_KEYNAME]: res.message })
      // PN018 is the one outcome with something to DO: the auth.users row
      // behind this JWT is gone (a stale token after a db:reset, a deleted
      // account), so there is no recovering the session. Reading the code here
      // picks a RECOVERY, not a severity — the server already said fault.
      if (res.dbcode === 'PN018') await signOutAndLeave()
      return
    } else if (res.type === 'ok' && res.data.result === 'claimed') {
      // The name isn't read: `onClaimed` re-probes the profiles row, so the
      // parent takes it from the table rather than from this answer.
      onClaimed()
      return
    } else {
      // Nothing to undo — `busy` is already clear, and the screen stays put so
      // the name can be resubmitted.
      reportUnhandled('claim_username', res)
      return
    }
  }

  // The one way off this screen, for both of its exits: the "Not you? Sign
  // out" button, and PN018, when the RPC finds no auth.users row behind the
  // token. Neither trusts the auth listener to put LoginScreen up: on a stale
  // session `signOut()`'s SIGNED_OUT event has not reliably re-rendered, and
  // a stale session is exactly what brings people here. So sign out
  // best-effort — the revoke can fail on that same stale session — then a HARD
  // navigation to "/": the full reload re-runs useSession from a clean slate.
  // The in-app router wouldn't do: this screen is gated on `needsClaim`, not
  // the path, so it would still render.
  async function signOutAndLeave() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Leaving regardless — a failed revoke must not block the escape.
    }
    window.location.assign('/')
  }

  return (
    <div className="pageHeaderAndMainArea">
      <div className={cls('card', 'pageMain')}>
        <h1>Let&rsquo;s set you up</h1>
        <p>
          Your username is your permanent handle — pick one you&rsquo;ll be happy with. Your color can be changed later.
        </p>

        <StandardForm
          ref={formRef}
          initialValues={
            { desired: suggested, chosen_color: defaultColorFor(suggested) } satisfies Values
          }
          onSubmit={onSubmit}
        >
          {({ values, set }) => {
            // Checked as you type, so it isn't in the errors object: that holds
            // what a SUBMIT produced, and this is recomputed every render.
            // Empty string counts as valid — don't badger someone who hasn't
            // typed anything yet.
            const localValid = values.desired.length === 0 || HANDLE_REGEX.test(values.desired)
            return (
              <>
                <TextField
                  name="desired"
                  label="Username"
                  value={values.desired}
                  onChange={(v) => set('desired', v)}
                  disabled={busy}
                  autoFocus
                  required
                  // Hard stop at the CHECK's ceiling — a handle you can't submit
                  // shouldn't be typeable in the first place.
                  maxLength={15}
                  // The rules are entry help while they hold and the error when
                  // they don't — same sentence either way, because breaking them
                  // is exactly what it warns against. The field also rings the
                  // box. While they hold, the box shows what the SERVER said
                  // about this field, which is where "that username is taken"
                  // lands.
                  entryHelp={localValid ? RULES : undefined}
                  error={localValid ? errors.desired : RULES}
                />

                <ColorChoiceField
                  name="chosen_color"
                  value={values.chosen_color}
                  onChange={(v) => set('chosen_color', v)}
                  error={errors.chosen_color}
                  disabled={busy}
                />

                <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>

                {/* Always-available escape (a user can land here on a stale
                    session and not want — or be able — to claim anything; the
                    rest of the app's chrome isn't mounted behind the needsClaim
                    gate). Sits beside Accept now, styled as a real button. */}
                <div className={styles.buttonRow}>
                  <CancelButton
                    show="label"
                    label="Not you? Sign out"
                    disabled={busy}
                    onClick={() => void signOutAndLeave()}
                  />
                  <FormSubmitButton
                    show="label"
                    label={busy ? 'Setting up…' : 'Accept'}
                    disabled={busy || !HANDLE_REGEX.test(values.desired)}
                  />
                </div>
              </>
            )
          }}
        </StandardForm>
      </div>
    </div>
  )
}
