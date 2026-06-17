import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { db as commonDb } from '../db'
import { useClubChat } from '../hooks/useClubChat'
import { colorVarFor } from '../lib/peerColor'
import styles from './ChatBody.module.css'

/** Minimal member shape the chat body needs to render names. The
 *  caller passes the roster it's already loaded for the parent
 *  page (ClubPage / GamePage). `color` is the identity palette
 *  name from `common.profiles.color`, used to color the bold
 *  username label per message. */
type Member = {
  user_id: string
  username: string
  color: string
}

type Props = {
  clubId: string
  members: Member[]
}

/**
 * The chat conversation itself — message list + input form —
 * extracted from the old `ClubChatPanel` so the floating-window
 * shell (`<FloatingChat>` → `<FloatingPanel>`) can wrap it
 * without inheriting the old static section's chrome.
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
export function ChatBody({ clubId, members }: Props) {
  const { messages, loading } = useClubChat(clubId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function memberFor(userId: string) {
    return members.find((m) => m.user_id === userId)
  }

  // Focus the input on mount so a user opening the panel can
  // start typing immediately without an extra click. Matches the
  // ../connections pattern.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-scroll to the bottom whenever new messages arrive, so a
  // reader sees them without having to scroll manually. See the
  // file-level docstring for the `block: 'end'` choice.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function onSend(e: SubmitEvent<HTMLFormElement>) {
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
    <div className={styles.chat}>
      <div className={styles.messages}>
        {loading && <p className="muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="muted">No messages yet. Say hi.</p>
        )}
        {messages.map((m) => {
          // Resolve the sender once per message — color comes
          // from the cached members roster (see Member type
          // above), no per-message fetch.
          const sender = memberFor(m.user_id)
          return (
            <div key={m.id} className={styles.message}>
              <span
                className={styles.senderName}
                style={{ color: colorVarFor(sender?.color) }}
              >
                {sender?.username ?? '?'}:
              </span>{' '}
              <span>{m.content}</span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSend} className={styles.inputRow}>
        {/* No Send button — Enter submits the form. A bare input
            cuts visual clutter and matches how chats usually
            feel. The form still has an implicit submit, which
            is what onSubmit catches. */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message and press Enter…"
          disabled={busy}
          maxLength={1000}
        />
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
