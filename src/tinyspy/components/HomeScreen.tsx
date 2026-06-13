import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { HowToPlayModal } from './HowToPlayModal'

type Props = {
  session: Session
  /** Pass both id and code so App can mirror the code to the URL hash. */
  onEnterGame: (gameId: string, joinCode: string) => void
}

/**
 * Post-login screen for a user not currently in a game.
 *
 * Two affordances: create a fresh game (caller becomes seat A) or join
 * an existing one by code (caller becomes seat B, if open). Both call
 * server RPCs that handle the seat assignment atomically.
 *
 * Also fetches the user's `display_name` on mount for the "Welcome,
 * {name}" greeting. The profile row is guaranteed to exist by the
 * `handle_new_user` trigger in the baseline migration.
 */
export function HomeScreen({ session, onEnterGame }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase
      .schema('common')
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
    const { data, error } = await supabase.schema('tinyspy').rpc('create_game').single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to create game')
      return
    }
    onEnterGame(data.id, data.join_code)
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.schema('tinyspy').rpc('join_game', { code })
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to join game')
      return
    }
    onEnterGame(data, code)
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

      <p className="muted home-footer">
        <button type="button" className="link-button" onClick={() => setHowToOpen(true)}>
          How to play
        </button>
        <span className="dot-separator">·</span>
        <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
          Log out
        </button>
      </p>

      <HowToPlayModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  )
}
