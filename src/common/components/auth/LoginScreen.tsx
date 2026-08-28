// cs-unmet

import { useState } from 'react'
import { StandardForm } from '../fields/StandardForm'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../fields/formState'
import { FailureLine } from '../feedback/FailureLine'
import { supabase } from '../../lib/supabase/supabase'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
import { cls } from '../../lib/util/cls'
import { StandardButton } from '../buttons/StandardButton'
import { TextField } from '../fields/TextField'

/**
 * Magic-link sign-in flow with two verification paths.
 *
 * On submit, calls `signInWithOtp` to mail the user an email that
 * contains BOTH a clickable magic link AND a numeric code. The user can
 * verify either way:
 *
 * (We deliberately don't name the code's digit count in the UI — the
 * length is a Supabase setting, `auth.email.otp_length`, and the local
 * config.toml has differed from the deployed project before. Length-
 * agnostic copy stays correct whatever that setting is; the input has no
 * maxLength so any length pastes/types fine.)
 *
 *   1. Click the magic link — the browser hits Supabase's redirect URL,
 *      which exchanges the link's hash token for a session and lands the
 *      user back at `window.location.origin` (so a sign-in started on
 *      `/g/codenamesduet/<id>` returns to that same path).
 *
 *   2. Enter the code in the "I have a code" form here — calls
 *      `verifyOtp({type: 'email'})` to exchange the code for a session
 *      on the current device. This is the only way to sign in when the
 *      email was opened on one device (commonly a phone) but the user
 *      wants to use the app on another (laptop, desktop browser).
 *
 * Either path triggers `onAuthStateChange`'s SIGNED_IN event, which
 * `useSession` is subscribed to — the screen unmounts on success without
 * any further action here. Toggling back to "Send a magic link instead"
 * also doubles as a resend (the email value stays in state).
 *
 * No password flow at all. The dev-only Mailpit hint catches the email
 * in the local stack so you don't need real email delivery while
 * iterating.
 */
// Dev-only convenience: prefill the email so heavy local iteration (esp. on a
// phone, where typing is a pain) doesn't mean re-entering it every reload. Empty
// in prod — the friends type their own.
const DEV_DEFAULT_EMAIL = import.meta.env.DEV ? 'joel@joelburton.com' : ''

/** What the form holds. Neither is an RPC parameter — these go to
 *  `supabase.auth`, which answers with a message and never names a field — so
 *  its refusals land on the form's own line. */
type Values = { email: string; code: string }

export function LoginScreen() {
  // WHICH FORM this is, not something typed into it, so it stays here: the
  // fields on screen change with it.
  const [action, setAction] = useState<'send-link' | 'verify-code'>('send-link')
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'sent' | 'verifying' | 'error'
  >('idle')
  const [errors, setErrors] = useState<FormErrors>({})
  // The address the mail actually WENT to, captured when it was sent. The
  // confirmation names it, and reading the live field there would let it follow
  // an edit — telling you a link went somewhere it didn't.
  const [sentTo, setSentTo] = useState('')

  const busy = status === 'sending' || status === 'verifying'

  async function onSubmit({ email, code }: Values) {
    setErrors({})

    if (action === 'send-link') {
      setStatus('sending')
      const { error: rpcError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (rpcError) {
        setErrors({ [FORM_ERROR_KEYNAME]: rpcError.message })
        setStatus('error')
        return
      }
      setSentTo(email)
      setStatus('sent')
      // Auto-switch to code-entry. If the magic link works first,
      // useSession picks up SIGNED_IN and unmounts this screen; if not,
      // the user can enter the code from the same email right
      // here without re-typing their address.
      setAction('verify-code')
      return
    }

    // verify-code path
    setStatus('verifying')
    const { error: rpcError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (rpcError) {
      setErrors({ [FORM_ERROR_KEYNAME]: rpcError.message })
      setStatus('error')
      return
    }
    // On success, useSession's onAuthStateChange picks up SIGNED_IN
    // and unmounts this screen. No further action needed here.
  }

  /** Swap which form this is. Clearing the code is the form's business now, so
   *  the toggle takes the setter from inside it. */
  function toggleAction(clearCode: () => void) {
    setErrors({})
    setStatus('idle')
    clearCode()
    setAction(action === 'send-link' ? 'verify-code' : 'send-link')
  }

  return (
    <div className="pageHeaderAndMainArea">
      <div className={cls('card', 'pageMain')}>
        <PuzpuzpuzWordmark />

        {status === 'sent' ? (
          <p>
            Sent a magic link and a sign-in code to <strong>{sentTo}</strong>.
            Click the link in the email, or enter the code below.
          </p>
        ) : (
          <p>
            {action === 'send-link'
              ? 'Sign in with a magic link.'
              : 'Enter your email and the code from your sign-in email.'}
          </p>
        )}

        <StandardForm
          initialValues={{ email: DEV_DEFAULT_EMAIL, code: '' } satisfies Values}
          onSubmit={onSubmit}
        >
          {({ values, set }) => (
            <>
              {/* CAPTIONED, not named by placeholder alone: a placeholder
                  vanishes the moment you type, on the first screen anyone
                  sees. */}
              <TextField
                name="email"
                label="Email"
                type="email"
                required
                placeholder="you@example.com"
                value={values.email}
                onChange={(v) => set('email', v)}
                disabled={busy}
              />
              {action === 'verify-code' && (
                <TextField
                  name="code"
                  label="Sign-in code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={values.code}
                  onChange={(v) => set('code', v)}
                  disabled={busy}
                  required
                />
              )}
              <StandardButton
                name={
                  action === 'send-link'
                    ? status === 'sending'
                      ? 'Sending…'
                      : 'Send magic link'
                    : status === 'verifying'
                      ? 'Verifying…'
                      : 'Verify code'
                }
                type="submit"
                weight="primary"
                disabled={
                  busy || !values.email || (action === 'verify-code' && !values.code.trim())
                }
              />
              <p>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleAction(() => set('code', ''))}
                  disabled={busy}
                >
                  {action === 'send-link'
                    ? 'I have a code already'
                    : 'Send me a magic link instead'}
                </button>
              </p>

              {/* Auth answers with a message and never names a field, so every
                  refusal here is the form's own. */}
              <FailureLine>{errors[FORM_ERROR_KEYNAME]}</FailureLine>
            </>
          )}
        </StandardForm>

        {status === 'sent' && import.meta.env.DEV && (
          <p className="muted">
            In local dev, the email lands in Mailpit at{' '}
            <a href="http://localhost:54324" target="_blank" rel="noreferrer">
              http://localhost:54324
            </a>
            .
          </p>
        )}
      </div>
    </div>
  )
}
