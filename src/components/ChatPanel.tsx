import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useChat } from '../hooks/useChat'
import type { Player } from '../hooks/useGame'

type Props = {
  gameId: string
  players: Player[]
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
export function ChatPanel({ gameId, players }: Props) {
  const { messages, loading } = useChat(gameId)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Map user_id → seat letter so each message can be color-coded without
  // an extra query. The players list is small (≤ 2) so a find() is fine.
  function seatFor(userId: string): 'A' | 'B' | undefined {
    return players.find((p) => p.user_id === userId)?.seat
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
    const { error } = await supabase.rpc('send_message', {
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
          const seat = seatFor(m.user_id)
          const name = m.profiles?.display_name ?? '?'
          return (
            <div key={m.id} className="chat-msg">
              <span className={`chat-name chat-seat-${seat ?? 'A'}`}>{name}:</span>{' '}
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
