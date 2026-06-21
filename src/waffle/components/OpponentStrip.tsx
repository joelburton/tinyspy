import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import type { WafflePlayerState } from '../hooks/useGame'

type Props = {
  members: Member[]
  playerStates: WafflePlayerState[]
  selfId: string
  maxSwaps: number
}

/**
 * Compete-mode progress strip — "You: 3 · Bea: 5 ✓". The entire
 * opponent-visibility surface in compete: you see each player's swap
 * count and whether they've solved, but never their board (the view
 * hides an opponent's tiles mid-game). Self first, then peers by name.
 */
export function OpponentStrip({ members, playerStates, selfId, maxSwaps }: Props) {
  const ordered = [...members].sort((a, b) => {
    if (a.user_id === selfId) return -1
    if (b.user_id === selfId) return 1
    return a.username.localeCompare(b.username)
  })

  return (
    <p className="muted">
      {ordered.map((m, i) => {
        const ps = playerStates.find((p) => p.user_id === m.user_id)
        const swaps = ps?.swaps_used ?? 0
        const solved = ps?.solved ?? false
        const out = !solved && swaps >= maxSwaps
        const label = m.user_id === selfId ? 'You' : m.username
        const mark = solved ? ' ✓' : out ? ' ✗' : ''
        return (
          <span key={m.user_id}>
            {i > 0 && ' · '}
            <strong style={{ color: colorVarFor(m.color) }}>{label}</strong>: {swaps}
            {mark}
          </span>
        )
      })}
    </p>
  )
}
