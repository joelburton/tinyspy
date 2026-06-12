import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Props = {
  session: Session
  onEnterGame: (gameId: string) => void
}

export function HomeScreen({ session, onEnterGame }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('failed to load profile', error)
          return
        }
        setDisplayName(data.display_name)
      })
    return () => {
      mounted = false
    }
  }, [session.user.id])

  async function onCreate() {
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('create_game').single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to create game')
      return
    }
    onEnterGame(data.id)
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('join_game', { code })
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to join game')
      return
    }
    onEnterGame(data)
  }

  return (
    <div className="card">
      <h1>Welcome{displayName ? `, ${displayName}` : ''}</h1>
      <p className="muted">{session.user.email}</p>

      <div className="actions">
        <button type="button" onClick={onCreate} disabled={busy}>
          Create new game
        </button>

        <div className="divider">or join with a code</div>

        <form onSubmit={onJoin}>
          <input
            type="text"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            disabled={busy}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="submit" disabled={busy || code.length < 6}>
            Join
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ marginTop: '2rem' }}>
        <a href="#" onClick={() => supabase.auth.signOut()}>
          Log out
        </a>
      </p>
    </div>
  )
}
