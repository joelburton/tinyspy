import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useChat, type ChatSchema } from '../hooks/useChat'

// Structural minimum a chat panel needs from a player record. Defined
// locally rather than importing from any specific game's roster so this
// component stays cross-game (e.g. tinyspy passes its Player[] in;
// future games can pass their own equivalent shape). The seat is
// `'A' | 'B'` in Tinyspy but kept as plain `string` here so other games
// with different seat conventions still satisfy the type.
type ChatRosterEntry = {
  user_id: string
  seat: string
  display_name: string
}

type Props = {
  /** Which game's chat to show. Today only `'tinyspy'`; see useChat's
   *  ChatSchema for the future-evolution plan. */
  gameSchema: ChatSchema
  gameId: string
  players: ChatRosterEntry[]
}

/**
 * Per-game chat panel rendered to the right of the game log on desktop.
 *
 * Each message line is `name: content`, with the sender's name colored
 * by seat (A = blue, B = orange) so the conversation is visually parseable
 * without a full chat-app's avatar treatment.
 *
 * Auto-scrolls to the latest message on every update. The input is a
 * single text field with Enter-to-send via the form's default submit.
 */
export function ChatPanel({ gameSchema, gameId, players }: Props) {
  const { messages, loading } = useChat(gameSchema, gameId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Look up the sender in the roster from useGame. The players list is
  // small (≤ 2) so a find() is cheap. Doing the lookup here (instead of
  // in useChat) means useChat returns raw rows — which matches the shape
  // of realtime INSERT payloads exactly, so the append-on-INSERT path
  // doesn't need to refetch the row to get the display name.
  function playerFor(userId: string) {
    return players.find((p) => p.user_id === userId)
  }

  // Auto-scroll to the bottom on every message change. Uses 'auto' rather
  // than 'smooth' so the scroll is instant on the first mount + every
  // incoming message — avoids the partial-scroll-then-jump UX.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.schema(gameSchema).rpc('send_message', {
      target_game: gameId,
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
    <section className="chat-panel">
      <h3>Chat</h3>
      <div className="chat-messages">
        {loading && <p className="muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="muted">No messages yet. Say hi.</p>
        )}
        {messages.map((m) => {
          const sender = playerFor(m.user_id)
          const name = sender?.display_name ?? '?'
          const seat = sender?.seat ?? 'A'
          return (
            <div key={m.id} className="chat-msg">
              <span className={`chat-name chat-seat-${seat}`}>{name}:</span>{' '}
              <span>{m.content}</span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSend} className="chat-input-row">
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
