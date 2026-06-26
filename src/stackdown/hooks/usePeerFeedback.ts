import { useEffect, useRef } from 'react'
import type { FeedbackApi, Member } from '../../common/lib/games'
import type { SubmissionRow } from './useGame'

/**
 * Header feedback for what *teammates* do in a COOP game — the complement
 * to the player's own in-body pills (which report their own word results).
 *
 * In coop, each player builds words privately but every COMPLETED action
 * is a shared `stackdown.submissions` row (coop RLS shows everyone's), so a
 * teammate's submission reaches this client via the realtime refetch in
 * `useGame`. Without this hook the only sign of a teammate's move was the
 * right-column log quietly growing and (for a valid word) tiles leaving the
 * board — easy to miss while heads-down on your own word. This surfaces each
 * teammate action as a transient pill:
 *
 *   - **word, valid**   → "moth found SCARE"        (success)
 *   - **word, invalid** → "moth tried FOOFS — not a word" (error)
 *   - **hint**          → "moth revealed a hint"    (info)
 *   - **reveal**        → "moth revealed a word"    (info)
 *
 * For a played word it also calls `onPeerWord(letters, valid)` so the
 * PlayArea can flash that word in the shared word-entry row, green for a
 * good word and red for a bad one — the same affordance the player gets for
 * their own accepted word, now mirrored for a teammate's.
 *
 * **Coop only.** In compete a teammate's submissions are RLS-hidden until
 * terminal, and there's no shared board to narrate — so the hook no-ops on
 * any non-coop mode. Like freebee's `usePeerFeedback`, it bootstraps from
 * the first loaded render (the `ready` ref) so a reconnect or navigate-back
 * doesn't replay the whole backlog as a burst of pills, and it skips the
 * player's OWN submissions (those are reported next to their input).
 *
 * Submissions are keyed by `(user_id, seq)` — the submissions PK is
 * `(game_id, user_id, seq)`, so that pair is unique within a game.
 */
export function usePeerFeedback({
  loading,
  mode,
  selfUserId,
  submissions,
  players,
  feedback,
  onPeerWord,
}: {
  loading: boolean
  mode: 'coop' | 'compete' | undefined
  selfUserId: string
  submissions: SubmissionRow[]
  players: Member[]
  feedback: FeedbackApi
  /** Drive the word-entry flash for a teammate's played word. */
  onPeerWord: (letters: string[], valid: boolean) => void
}): void {
  // `seen` keys every submission already accounted for; `ready` makes the
  // first loaded render a quiet bootstrap of the existing backlog.
  const seen = useRef<Set<string>>(new Set())
  const ready = useRef(false)
  useEffect(() => {
    if (loading || mode !== 'coop') return
    const key = (s: SubmissionRow) => `${s.user_id}:${s.seq}`
    const seenSet = seen.current
    if (!ready.current) {
      ready.current = true
      for (const s of submissions) seenSet.add(key(s))
      return
    }
    for (const s of submissions) {
      if (seenSet.has(key(s))) continue
      seenSet.add(key(s))
      if (s.user_id === selfUserId) continue // own action → own pill / flash
      const name =
        players.find((p) => p.user_id === s.user_id)?.username ?? 'A teammate'

      if (s.kind === 'hint') {
        feedback.show({
          tone: 'info',
          text: `${name} revealed a hint`,
          dismiss: { kind: 'timed' },
        })
      } else if (s.kind === 'reveal') {
        feedback.show({
          tone: 'info',
          text: `${name} revealed a word`,
          dismiss: { kind: 'timed' },
        })
      } else {
        // kind === 'word' — a played word, valid or not.
        const word = (s.word ?? '').toUpperCase()
        if (s.valid) {
          feedback.show({
            tone: 'success',
            text: `${name} found ${word}`,
            dismiss: { kind: 'timed' },
          })
          onPeerWord([...word], true)
        } else {
          feedback.show({
            tone: 'error',
            text: `${name} tried ${word} — not a word`,
            dismiss: { kind: 'timed' },
          })
          onPeerWord([...word], false)
        }
      }
    }
  }, [loading, mode, selfUserId, submissions, players, feedback, onPeerWord])
}
