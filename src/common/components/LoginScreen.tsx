import { useState, type SubmitEvent } from 'react'
import { supabase } from '../lib/supabase'

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
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [action, setAction] = useState<'send-link' | 'verify-code'>('send-link')
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'sent' | 'verifying' | 'error'
  >('idle')
  const [error, setError] = useState<string | null>(null)

  const busy = status === 'sending' || status === 'verifying'

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (action === 'send-link') {
      setStatus('sending')
      const { error: rpcError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (rpcError) {
        setError(rpcError.message)
        setStatus('error')
        return
      }
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
      setError(rpcError.message)
      setStatus('error')
      return
    }
    // On success, useSession's onAuthStateChange picks up SIGNED_IN
    // and unmounts this screen. No further action needed here.
  }

  function toggleAction() {
    setError(null)
    setStatus('idle')
    setCode('')
    setAction(action === 'send-link' ? 'verify-code' : 'send-link')
  }

  return (
    <div className="card">
      <h1>PuzPuzPuz</h1>

      {status === 'sent' ? (
        <p>
          Sent a magic link and a sign-in code to <strong>{email}</strong>.
          Click the link in the email, or enter the code below.
        </p>
      ) : (
        <p>
          {action === 'send-link'
            ? 'Sign in with a magic link.'
            : 'Enter your email and the code from your sign-in email.'}
        </p>
      )}

      <form onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        {action === 'verify-code' && (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            placeholder="Sign-in code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            required
          />
        )}
        <button
          type="submit"
          disabled={
            busy || !email || (action === 'verify-code' && !code.trim())
          }
        >
          {action === 'send-link'
            ? status === 'sending'
              ? 'Sending…'
              : 'Send magic link'
            : status === 'verifying'
              ? 'Verifying…'
              : 'Verify code'}
        </button>
        <p>
          <button
            type="button"
            className="link-button"
            onClick={toggleAction}
            disabled={busy}
          >
            {action === 'send-link'
              ? 'I have a code already'
              : 'Send me a magic link instead'}
          </button>
        </p>
      </form>

      {error && <p className="error">{error}</p>}

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
  )
}
