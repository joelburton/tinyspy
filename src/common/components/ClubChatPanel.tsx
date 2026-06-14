import { useEffect, useRef, useState, type FormEvent } from 'react'
import { db as commonDb } from '../db'
import { useClubChat } from '../hooks/useClubChat'
import styles from './ClubChatPanel.module.css'

/** Minimal member shape the chat panel needs to render names. The
 *  caller passes the roster it's already loaded for the club page. */
type Member = {
  user_id: string
  username: string
}

type Props = {
  clubId: string
  members: Member[]
}

/**
 * Chat panel for a club. The only chat panel — every game's
 * BoardScreen mounts this directly. Chat is keyed by club, not
 * by game, so the same thread persists across game-kind switches
 * and play-again chains within the same club.
 *
 * Looks up each message's sender in the `members` prop (loaded
 * once by the parent), keeping render cheap and avoiding the
 * "embed shape varies between fetch and realtime payload" problem
 * that comes from PostgREST joins.
 *
 * Auto-scrolls to the latest message on each update — `block: 'end'`
 * (not `'smooth'`) so the scroll is instant on first mount and on
 * every incoming message, no partial-scroll-then-jump UX.
 */
export function ClubChatPanel({ clubId, members }: Props) {
  const { messages, loading } = useClubChat(clubId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  function nameFor(userId: string) {
    return members.find((m) => m.user_id === userId)?.username ?? '?'
  }

  // Auto-scroll to the bottom whenever new messages arrive, so a
  // reader sees them without having to scroll manually. See the
  // file-level docstring for the `block: 'end'` choice.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function onSend(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const { error } = await commonDb.rpc('send_message', {
      target_club: clubId,
      content: trimmed,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setInput('')
  }

  return (
    <section className={styles.chatPanel}>
      <h3>Chat</h3>
      <div className={styles.chatMessages}>
        {loading && <p className="muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="muted">No messages yet. Say hi.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={styles.chatMsg}>
            <span className={styles.chatName}>{nameFor(m.user_id)}:</span>{' '}
            <span>{m.content}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSend} className={styles.chatInputRow}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={busy}
          maxLength={1000}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </section>
  )
}
