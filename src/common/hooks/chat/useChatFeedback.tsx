import { useClubChat } from './useClubChat'
import { useGlobalFeedback } from '../feedback/useGlobalFeedback'
import { memberById } from '../../lib/game/peers'
import type { GenericFeedbackApi, Member } from '../../lib/games'

/** Longest chat text shown in the pill before it's clipped. The global-feedback
 *  slot is a small header element and this repo forbids header reflow (docs/ui.md
 *  → Layout stability), so a long message (chat allows up to 1000 chars) is
 *  truncated rather than allowed to grow the slot. */
const MAX_PILL_CHARS = 80

/**
 * Bridges club chat → the GLOBAL feedback area: every NEW chat message pops a
 * "● HANDLE: text" pill (neutral tone) for every club member EXCEPT the sender;
 * it auto-clears after 2s, or sooner if another global feedback replaces it.
 *
 * Reuses the two hooks built for exactly this: `useClubChat` for the message
 * stream, and `useGlobalFeedback` for the "fire on each NEW item, never replay
 * the backlog" bootstrap. **`enabled: !loading` is what makes the historical
 * case correct** — the machinery seeds the already-loaded history as "seen" on
 * the first loaded render, so signing in at 9:05 does NOT pop the 9:00/9:01
 * messages (they're only in the chat log); a message that arrives AFTER you're
 * connected pops. It keys off message `id`, so there's no clock/timestamp
 * reasoning, and the seed can't leak because `useClubChat` keeps `loading` true
 * until the real backlog is present (and the pages remount per club/game, so the
 * seen-set is always fresh for the current club — see App's route keying).
 *
 * `members` is the FULL club roster (not just a game's players) so a sender is
 * named even when they aren't in the current game. `selfId` is the viewer —
 * their own messages never pop. Call it wherever the global feedback area lives:
 * ClubPage and GamePage.
 */
export function useChatFeedback({
  clubHandle,
  members,
  selfId,
  globalFeedback,
}: {
  clubHandle: string
  members: Member[]
  selfId: string
  globalFeedback: GenericFeedbackApi
}): void {
  const { messages, loading } = useClubChat(clubHandle)

  useGlobalFeedback({
    // Gate until the history has loaded so the seed captures the real backlog
    // (not an empty set that would replay everything on arrival).
    enabled: !loading,
    items: messages,
    keyOf: (m) => m.id,
    messageFor: (m) => {
      if (m.user_id === selfId) return null // my own message — never pop it back at me
      const member = memberById(members, m.user_id)
      const handle = member?.username ?? '?'
      // Mirror ChatBody: a leading '!' is the "force-open for everyone" marker,
      // not part of the shown text.
      const important = m.content.startsWith('!')
      const body = important ? m.content.slice(1).trimStart() : m.content
      const text = body.length > MAX_PILL_CHARS ? `${body.slice(0, MAX_PILL_CHARS)}…` : body
      return {
        tone: 'neutral',
        variant: 'outline',
        // The leading identity disc in the caller's spec's "()"; omitted (no
        // disc) for an unresolvable sender rather than a misleading default color.
        dot: member?.color,
        text: (
          <>
            <strong>{handle}</strong>: {text}
          </>
        ),
        // Timed: auto-clears after 2s (or sooner if another global feedback —
        // a peer game event, the next chat message — replaces it).
        dismiss: { kind: 'timed', ms: 2000 },
      }
    },
    globalFeedback,
  })
}
