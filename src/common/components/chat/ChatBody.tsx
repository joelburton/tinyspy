// cs-unmet

import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { db as commonDb } from '../../db'
import { runRpc } from '../../lib/supabase/dbResult'
import { showFaultModal } from '../../lib/fault/faultStore'
import { colorVarFor } from '../../lib/color/memberColor'
import { linkify } from '../../lib/util/linkify'
import { handOffKeyboardOnTab } from '../../lib/util/keyboardHandoff'
import type { ClubMessage } from '../../hooks/chat/useClubChat'
import styles from './ChatBody.module.css'

import type { Member } from '../../lib/games'

/** What `common.send_message` puts in `data`. The sent line shows up in the
 *  log on its own, so the RPC writes no sentence — `result` is the whole
 *  answer, and the only thing a branch can assert about it. */
type SendAnswer = { result: 'sent' }

type Props = {
  clubHandle: string
  members: Member[]
  /** Messages + loading lifted from Chat (which subscribes
   *  via useClubChat at its level so the force-open detector for
   *  important messages can run even while the panel is closed). */
  messages: ClubMessage[]
  loading: boolean
}

/**
 * The chat conversation itself — message list + input form.
 * Pure rendering plus the send-message form; doesn't subscribe
 * to the message stream itself (its parent Chat does).
 *
 * Looks up each message's sender in the `members` prop (loaded
 * once by the parent), keeping render cheap and avoiding the
 * "embed shape varies between fetch and realtime payload" problem
 * that comes from PostgREST joins.
 *
 * Auto-scrolls to the latest message on each update — `block: 'end'`
 * (not `'smooth'`) so the scroll is instant on first mount and on
 * every incoming message, no partial-scroll-then-jump UX.
 *
 * **Important-message convention.** A message whose content
 * starts with `!` is rendered with its leading `!` stripped and
 * the content bolded (font-weight: 700). Chat handles
 * the matching "force open" behavior; here we just deal with
 * display.
 */
export function ChatBody({ clubHandle, members, messages, loading }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function memberFor(userId: string) {
    return members.find((m) => m.user_id === userId)
  }

  // Focus the input on mount AND whenever a send finishes (busy flips
  // back to false). Sending disables the input mid-flight, which
  // blurs it; refocusing on completion keeps the cursor in the box so
  // the user can fire off the next message without an extra click.
  // (Mount is the busy=false initial render, so this covers both.)
  useEffect(function keepInputFocused() {
    if (!busy) inputRef.current?.focus()
  }, [busy])

  // Auto-scroll to the bottom whenever new messages arrive, so a
  // reader sees them without having to scroll manually. See the
  // file-level docstring for the `block: 'end'` choice.
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
    } else if (res.data.result === 'sent') {
      // Empty the box only once the row is IN. The message itself arrives back
      // through the chat subscription, so nothing is echoed locally.
      setInput('')
    } else {
      // The typed text stays in the box — an answer nobody handled is not
      // evidence the message was posted, and retyping it would be the cost.
      showFaultModal({ text: 'BUG: send_message fell through to unhandled' })
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
          // Resolve the sender once per message — color comes
          // from the cached members roster (see Member type
          // above), no per-message fetch.
          const sender = memberFor(m.user_id)
          const important = m.content.startsWith('!')
          // Strip the leading `!` for display; the marker
          // character itself isn't part of the message. Trim
          // any whitespace immediately after so "!hi" and
          // "! hi" both render as "hi".
          const display = important ? m.content.slice(1).trimStart() : m.content
          return (
            <div key={m.id} className={styles.message}>
              <span
                className={styles.senderName}
                style={{ color: colorVarFor(sender?.color) }}
              >
                {sender?.username ?? '?'}:
              </span>{' '}
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
