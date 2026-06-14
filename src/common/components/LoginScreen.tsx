import { useState, type SubmitEvent } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Magic-link sign-in flow.
 *
 * On submit, calls `signInWithOtp` to mail a one-click login link to the
 * user. The link redirects back to `window.location.origin` — so a user
 * who started the flow with `#game=ABC` in their URL lands back on the
 * same hash and gets auto-restored into that game by App's effect.
 *
 * No password flow at all. No "resend" button yet (see CODE_REVIEW.md
 * item 10). The dev-only Mailpit hint catches the email in the local
 * stack so you don't need real email delivery while iterating.
 */
export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  if (status === 'sent') {
    return (
      <div className="card">
        <h1>Check your email</h1>
        <p>
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
        {import.meta.env.DEV && (
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

  return (
    <div className="card">
      <h1>Codenames Duet</h1>
      <p>Sign in with a magic link.</p>
      <form onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'sending'}
        />
        <button type="submit" disabled={status === 'sending' || !email}>
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
