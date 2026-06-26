import { useEffect, useRef } from 'react'
import type { FeedbackApi, Member } from '../../common/lib/games'
import { readLeaderboard } from '../lib/leaderboard'
import { RANKS } from '../lib/ranks'
import type { FoundWordRow } from './useGame'

/**
 * Header feedback for what *other players* do — the complement to the
 * in-body pill, which reports the player's OWN word result near the
 * input. Two sources, one per mode:
 *
 *   - **coop**: a peer found a word. coop's `found_words` is club-wide,
 *     so peers' accepted words arrive in `foundWords`; we surface good
 *     and pangram finds. Rejected words (bad / too-short) never become
 *     a `found_words` row, so there's nothing to suppress.
 *   - **compete**: an opponent reached a new rank. Opponents' words are
 *     RLS-hidden in compete, so we can't see *what* they found — but
 *     their rank rides `common.games.status.leaderboard`, and a climb
 *     is the one competitively-meaningful signal worth announcing.
 *
 * Both sources bootstrap from the first loaded render (the `*Ready`
 * refs), so a reconnect or navigate-back doesn't replay a backlog of
 * pills. The player's own activity never fires here: own words go to
 * the in-body pill, own rank is already on the RankBar.
 */
export function usePeerFeedback({
  loading,
  mode,
  selfUserId,
  players,
  foundWords,
  status,
  feedback,
}: {
  loading: boolean
  mode: 'coop' | 'compete' | undefined
  selfUserId: string
  players: Member[]
  foundWords: FoundWordRow[]
  status: Record<string, unknown> | null
  feedback: FeedbackApi
}): void {
  // ── coop: a peer found a (good / pangram) word ──
  // `seen` keys every found word already accounted for; `wordsReady`
  // makes the first loaded render a quiet bootstrap of the backlog.
  const seenWords = useRef<Set<string>>(new Set())
  const wordsReady = useRef(false)
  useEffect(() => {
    if (loading || mode !== 'coop') return
    const key = (r: FoundWordRow) => `${r.user_id}:${r.word}`
    const seen = seenWords.current
    if (!wordsReady.current) {
      wordsReady.current = true
      for (const r of foundWords) seen.add(key(r))
      return
    }
    for (const r of foundWords) {
      if (seen.has(key(r))) continue
      seen.add(key(r))
      if (r.user_id === selfUserId) continue // own word → in-body pill
      const name =
        players.find((p) => p.user_id === r.user_id)?.username ?? 'A teammate'
      feedback.show({
        tone: 'success',
        text: r.is_pangram
          ? `🐝 ${name} found a pangram — ${r.word.toUpperCase()}!`
          : `${name} found ${r.word.toUpperCase()}`,
        dismiss: { kind: 'timed' },
      })
    }
  }, [loading, mode, selfUserId, players, foundWords, feedback])

  // ── compete: an opponent reached a new rank ──
  // `prevRank` remembers each player's last-seen rank index; `ranksReady`
  // bootstraps it so we only announce climbs that happen while watching.
  const prevRank = useRef<Map<string, number>>(new Map())
  const ranksReady = useRef(false)
  useEffect(() => {
    if (loading || mode !== 'compete') return
    const board = readLeaderboard(status)
    const prev = prevRank.current
    if (!ranksReady.current) {
      ranksReady.current = true
      for (const row of board) prev.set(row.user_id, row.rank_idx)
      return
    }
    for (const row of board) {
      const was = prev.get(row.user_id) ?? 0
      prev.set(row.user_id, row.rank_idx)
      if (row.user_id === selfUserId) continue // own rank → RankBar
      if (row.rank_idx > was) {
        const name =
          players.find((p) => p.user_id === row.user_id)?.username ??
          'An opponent'
        feedback.show({
          tone: 'info',
          text: `${name} reached ${RANKS[row.rank_idx] ?? 'a new rank'}`,
          dismiss: { kind: 'timed' },
        })
      }
    }
  }, [loading, mode, selfUserId, players, status, feedback])
}
