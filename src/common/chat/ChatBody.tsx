// cs-blessed-chat

import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { DotActor } from '../members/ActorMention'
import { memberById } from '../members/memberList'
import { linkify } from '../utils/linkify'
import { handOffKeyboardOnTab } from '../keyboard/keyboardHandoff'
import type { ClubMessage } from './useClubChat'
import styles from './ChatBody.module.css'

import type { Member } from '../members/member'
import { reportUnhandled } from '../supabase/dbEnvelope'

/** What `common.send_message` puts in `data`. The sent line shows up in the
 *  log on its own, so the RPC writes no sentence — `result` is the whole
 *  answer, and the only thing a branch can assert about it. */
type SendAnswer = { result: 'sent' }

type Props = {
  clubHandle: string
  members: Member[]
  // The stream is `<Chat>`'s, which subscribes at its level so the force-open
  // detector runs while the panel is closed; this only renders it.
  messages: ClubMessage[]
  loading: boolean
}

/**
 * The chat conversation itself — the message list and the entry box. It
 * renders what `<Chat>` hands it and sends through `common.send_message`; it
 * does not subscribe to the stream. Each sender is looked up in `members`, the
 * club roster the page already holds.
 *
 * A message whose content starts with `!` is shown without the marker and in
 * bold; the matching force-open is `<Chat>`'s.
 */
export function ChatBody({ clubHandle, members, messages, loading }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input on mount AND whenever a send finishes (busy flips
  // back to false). Sending disables the input mid-flight, which
  // blurs it; refocusing on completion keeps the cursor in the box so
  // the user can fire off the next message without an extra click.
  // (Mount is the busy=false initial render, so this covers both.)
  useEffect(function keepInputFocused() {
    if (!busy) inputRef.current?.focus()
  }, [busy])

  // Auto-scroll to the bottom whenever new messages arrive, so a reader sees
  // them without scrolling. An instant scroll, not a smooth one: no
  // partial-scroll-then-jump on first mount or on an incoming message.
  useEffect(function autoScrollToBottom() {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function onSend(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    const res = await runRpc<SendAnswer>(
      commonDb.rpc('send_message', { target_club: clubHandle, content: trimmed }),
    )
    setBusy(false)
    if (res.type === 'not-ok') {
      // Every severity lands on this line. In practice what arrives is a fault
      // — the input's own `maxLength` already enforces the 1000-char cap, so
      // the server's PN031 is the second lock rather than the one a player
      // meets. A fault has already raised the modal; this line is what remains
      // after it is dismissed.
      setError(res.message)
      return
    } else if (res.type === 'ok' && res.data.result === 'sent') {
      // Empty the box only once the row is IN. The message itself arrives back
      // through the chat subscription, so nothing is echoed locally.
      setInput('')
      return
    } else {
      // The typed text stays in the box — an answer nobody handled is not
      // evidence the message was posted, and retyping it would be the cost.
      reportUnhandled('send_message', res)
      return
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.messages}>
        {loading && <p className="muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="muted">No messages yet. Say hi.</p>
        )}
        {messages.map((m) => {
          // The sender comes from the roster the page holds — no per-message
          // fetch.
          const sender = memberById(members, m.user_id)
          const important = m.content.startsWith('!')
          // Strip the leading `!` for display; the marker
          // character itself isn't part of the message. Trim
          // any whitespace immediately after so "!hi" and
          // "! hi" both render as "hi".
          const display = important ? m.content.slice(1).trimStart() : m.content
          return (
            <div key={m.id} className={styles.message}>
              {/* `show="both"`: a chat line without its sender's name is
                  unreadable, so the name survives on a phone. */}
              <DotActor actor={sender} fallback="?" show="both" />:{' '}
              <span
                className={important ? styles.importantContent : undefined}
              >
                {linkify(display)}
              </span>
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
          // Marks this as the chat box so the "/" shortcut can focus it.
          // NOT data-game-input — typing "/" here inserts a literal slash.
          data-chat-input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handOffKeyboardOnTab}
          placeholder="Type a message and press Enter…"
          disabled={busy}
          maxLength={1000}
        />
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
