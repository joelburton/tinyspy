import type { Session } from '@supabase/supabase-js'
import { useGame } from '../hooks/useGame'
import { useBoard, type KeyLabel } from '../hooks/useBoard'

type Props = {
  session: Session
  gameId: string
}

const LABEL_CLASS: Record<KeyLabel, string> = {
  G: 'tile-green',
  N: 'tile-neutral',
  A: 'tile-assassin',
}

export function BoardScreen({ session, gameId }: Props) {
  const { game, players } = useGame(gameId)
  const { words, myKey, loading } = useBoard(gameId, session.user.id)

  if (loading || !game || !myKey || words.length < 25) {
    return <div className="card">Loading board…</div>
  }

  const mySeat = players.find((p) => p.user_id === session.user.id)?.seat
  const greenCount = myKey.filter((l) => l === 'G').length
  const foundCount = words.filter((w) => w.revealed_as === 'G').length

  return (
    <div className="board-wrap">
      <header className="board-header">
        <div>
          <div className="muted">Game {game.join_code}</div>
          <div>
            You are <strong>{mySeat}</strong> · clue-giver: <strong>{game.current_clue_giver}</strong>
          </div>
        </div>
        <div className="status">
          <div>
            <strong>{foundCount}</strong> / 15 agents
          </div>
          <div className="muted">{game.turns_remaining} tokens left</div>
        </div>
      </header>

      <div className="board-grid">
        {words.map((w) => {
          const myLabel = myKey[w.position]
          const revealed = w.revealed_as !== null
          const cls = revealed ? `tile-revealed ${LABEL_CLASS[w.revealed_as as KeyLabel]}` : `tile-hint ${LABEL_CLASS[myLabel]}`
          return (
            <div key={w.position} className={`tile ${cls}`}>
              <span className="tile-word">{w.word}</span>
              {!revealed && <span className="tile-key">{myLabel}</span>}
            </div>
          )
        })}
      </div>

      <p className="muted board-help">
        Tinted cells show <strong>your</strong> key view ({greenCount} green, {myKey.filter((l) => l === 'A').length} assassins).
        Revealed cells show the authoritative label. Clue / guess controls land in step 4.
      </p>
    </div>
  )
}
