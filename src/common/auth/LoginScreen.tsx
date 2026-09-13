// cs-blessed-simple-page

import { useRef, useState } from 'react'
import { StandardForm } from '../forms/StandardForm'
import { useTabRing } from '../keyboard/useTabRing'
import { FORM_ERROR_KEYNAME, type FormErrors } from '../forms/formState'
import { FailureLine } from '../forms/FailureLine'
import { supabase } from '../supabase/supabase'
import { PuzpuzpuzWordmark } from '../branding/PuzpuzpuzWordmark'
import { cls } from '../utils/cls'
import { FormSubmitButton } from '../buttons/FormSubmitButton'
import { TextField } from '../fields/TextField'

// Dev-only convenience: prefill the email so heavy local iteration (esp. on a
// phone, where typing is a pain) doesn't mean re-entering it every reload. Empty
// in prod — the friends type their own.
const DEV_DEFAULT_EMAIL = import.meta.env.DEV ? 'joel@test.local' : ''

/** What the form holds. Neither is an RPC parameter — these go to
 *  `supabase.auth`, which answers with a message and never names a field — so
 *  its refusals land on the form's own line. */
type Values = { email: string; code: string }

/**
 * Signing in. Takes no props, and unmounts itself: both paths it offers end in
 * a SIGNED_IN event, and `useSession` — which put this screen up — takes it
 * down.
 *
 * The two paths are one email. `signInWithOtp` mails a clickable magic link
 * and a code; the form here toggles between asking for the address and
 * verifying a code typed from that email on this device. `doc.md` says why
 * both exist.
 */
export function LoginScreen() {
  // This page is nothing but this form, so the form IS the page's tab ring:
  // Tab cycles the fields showing right now, Submit and the toggle link, and
  // never walks off into the browser's chrome.
  const formRef = useRef<HTMLFormElement>(null)
  useTabRing({ within: formRef })

  // WHICH FORM this is, not something typed into it, so it stays here: the
  // fields on screen change with it.
  const [action, setAction] = useState<'send-link' | 'verify-code'>('send-link')
  // Only what is in flight right now. Whether a mail went out is `sentTo`'s
  // business, and a failure is the form's line — neither is a status.
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying'>('idle')
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
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (authError) {
        setErrors({ [FORM_ERROR_KEYNAME]: authError.message })
        setStatus('idle')
        return
      }
      setSentTo(email)
      setStatus('idle')
      // Auto-switch to code-entry. If the magic link works first,
      // useSession picks up SIGNED_IN and unmounts this screen; if not,
      // the user can enter the code from the same email right
      // here without re-typing their address.
      setAction('verify-code')
      return
    }

    // verify-code path
    setStatus('verifying')
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (authError) {
      setErrors({ [FORM_ERROR_KEYNAME]: authError.message })
      setStatus('idle')
      return
    }
    // On success, useSession's onAuthStateChange picks up SIGNED_IN
    // and unmounts this screen. No further action needed here.
  }

  /** Swap which form this is. The code lives in the form's values, so the
   *  toggle takes the setter from inside it to clear it. */
  function toggleAction(clearCode: () => void) {
    setErrors({})
    setStatus('idle')
    clearCode()
    setAction(action === 'send-link' ? 'verify-code' : 'send-link')
  }

  // A mail went out AND the code form is the one on screen. A wrong code does
  // not un-send that email, so the address stays named while the user retries;
  // toggling back to the send form takes the sentence away with the code field
  // the sentence points at.
  const showSent = sentTo !== '' && action === 'verify-code'

  return (
    <div className="pageHeaderAndMainArea">
      <div className={cls('card', 'pageMain')}>
        <PuzpuzpuzWordmark />

        {showSent ? (
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
          ref={formRef}
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
                  value={values.code}
                  onChange={(v) => set('code', v)}
                  disabled={busy}
                  required
                />
              )}
              <FormSubmitButton
                show="label"
                label={
                  action === 'send-link'
                    ? status === 'sending'
                      ? 'Sending…'
                      : 'Send magic link'
                    : status === 'verifying'
                      ? 'Verifying…'
                      : 'Verify code'
                }
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

        {showSent && import.meta.env.DEV && (
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
