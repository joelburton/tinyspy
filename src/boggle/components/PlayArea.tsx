import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { ShuffleButton } from '../../common/components/ShuffleButton'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { boardToDisplay } from '../lib/dice'
import { traceableStr } from '../lib/boardTrace'
import { LADDERS, scoreFor, type LadderName } from '../lib/solver'
import { useGame } from '../hooks/useGame'
import { WordList } from './WordList'
import { db } from '../db'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * MothCubes play surface — two fixed-height columns (board left, input +
 * found-words list right), no full-page scroll (docs/ui.md). The board is shipped
 * to the FE with its required-word list, so guesses are classified instantly:
 * a required word (membership) or an off-board/too-short word needs no server
 * round-trip; only an unknown (bonus-candidate) word is sent for the dictionary
 * check. Traceability is checked client-side (trusting-commit).
 */
export function PlayArea(ctx: GamePageCtx) {
  const { gameId, players, isTerminal, setup, feedback, menu, goToClub, session } = ctx
  const { game, foundWords } = useGame(gameId)
  const myId = session.user.id

  const [word, setWord] = useState('')
  const [lastWord, setLastWord] = useState('')
  const [rotation, setRotation] = useState(0)

  const ladder: LadderName = ((setup.scoring_ladder as LadderName) ?? 'basic')
  const grid = useMemo(
    () => (game ? boardToDisplay(game.board, game.n) : null),
    [game],
  )
  const foundSet = useMemo(() => new Set(foundWords.map((f) => f.word)), [foundWords])
  const distinctFoundCount = foundSet.size

  const submit = useCallback(async () => {
    const w = word.trim().toLowerCase()
    if (!game || isTerminal || w.length === 0) return
    const say = (tone: 'success' | 'error' | 'info', text: string) =>
      feedback.show({ tone, text, dismiss: { kind: 'timed', ms: 1600 } })

    if (w.length < game.min_word_length) {
      say('info', `Too short (min ${game.min_word_length})`)
      return
    }
    const dup = foundWords.some(
      (f) => f.word === w && (game.mode === 'coop' || f.user_id === myId),
    )
    if (dup) {
      say('info', `${w.toUpperCase()} — already found`)
      setWord('')
      return
    }
    if (!traceableStr(game.board, w)) {
      say('error', `${w.toUpperCase()} — not on the board`)
      return
    }

    const required = game.required_words.find((r) => r.word === w)
    const points = required ? required.points : scoreFor(w.length, LADDERS[ladder] ?? LADDERS.basic)
    setLastWord(word)
    setWord('')

    if (required) {
      // Known-good (member + traceable + not dup): show points instantly, record
      // in the background — the realtime insert lands it in the list.
      say('success', `${w.toUpperCase()} +${points}`)
      void db.rpc('submit_word', { target_game: gameId, word: w, points }).then(({ error }) => {
        if (error) say('error', error.message)
      })
      return
    }
    // Bonus candidate — only the server knows if it's a real word.
    const { data, error } = await db.rpc('submit_word', { target_game: gameId, word: w, points })
    if (error) {
      say('error', error.message)
      return
    }
    const res = data as { result: string; points: number }
    if (res.result === 'bonus' || res.result === 'accepted') say('success', `${w.toUpperCase()} +${res.points} (bonus)`)
    else if (res.result === 'notAWord') say('error', `${w.toUpperCase()} — not a word`)
    else if (res.result === 'alreadyFound') say('info', `${w.toUpperCase()} — already found`)
    else say('info', res.result)
  }, [word, game, isTerminal, foundWords, myId, ladder, feedback, gameId])

  const endGame = useCallback(async () => {
    await db.rpc('end_game', { target_game: gameId })
  }, [gameId])

  useEffect(function syncMenu() {
    menu.setGameItems([
      { id: 'end-game', label: 'End game', onClick: () => void endGame(), disabled: isTerminal },
    ])
    return () => menu.setGameItems([])
  }, [menu, endGame, isTerminal])

  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (!game || !grid) return <div className={styles.loading}>Loading…</div>

  // Post-terminal reveal: required words nobody found.
  const revealWords = isTerminal
    ? game.required_words.filter((r) => !foundSet.has(r.word))
    : null

  return (
    <div className={styles.playArea}>
      <div className={styles.boardCol}>
        <div
          className={styles.board}
          style={{ gridTemplateColumns: `repeat(${game.n}, 1fr)`, transform: `rotate(${rotation}deg)` }}
        >
          {grid.flatMap((row, y) =>
            row.map((cell, x) => (
              <div key={`${y}-${x}`} className={styles.tile}>
                {cell}
              </div>
            )),
          )}
        </div>
        <ShuffleButton onShuffle={() => setRotation((r) => (r + 90) % 360)} label="Rotate board" />
      </div>

      <div className={styles.sidePanel}>
        <form
          className={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            data-game-input
            type="text"
            className={styles.input}
            value={word}
            placeholder="type a word…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={isTerminal}
            onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setWord(lastWord)
              }
            }}
          />
        </form>
        <WordList
          foundWords={foundWords}
          players={players}
          foundWordsCount={distinctFoundCount}
          requiredWordsCount={game.required_words_count}
          revealWords={revealWords}
        />
      </div>

      {showModal && isTerminal && (
        <GameOverModal
          outcome={buildOutcome(game.mode, ctx.status, myId)}
          verdict={buildVerdict(game.mode, ctx.status, myId, distinctFoundCount)}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id: string; count: number; score: number }

function buildOutcome(mode: string, status: StatusBlob | null, myId: string): 'won' | 'lost' {
  if (mode === 'coop') return 'won' // coop has no loss — it's a shared result
  const board = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const max = board.reduce((m, r) => Math.max(m, r.score), 0)
  const mine = board.find((r) => r.user_id === myId)?.score ?? 0
  return mine >= max && max > 0 ? 'won' : 'lost'
}

function buildVerdict(mode: string, status: StatusBlob | null, myId: string, coopCount: number): string {
  if (mode === 'coop') {
    const score = (status?.score as number | undefined) ?? 0
    return `${coopCount} words · ${score} points`
  }
  const board = (status?.leaderboard as LeaderRow[] | undefined) ?? []
  const mine = board.find((r) => r.user_id === myId)
  const max = board.reduce((m, r) => Math.max(m, r.score), 0)
  const myScore = mine?.score ?? 0
  return myScore >= max && max > 0
    ? `You win — ${mine?.count ?? 0} words, ${myScore} points`
    : `${mine?.count ?? 0} words, ${myScore} points`
}
