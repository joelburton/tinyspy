import { useCallback, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { Board } from './Board'
import { WordEntry } from './WordEntry'
import { FoundWords } from './FoundWords'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * StackDown's play surface, shared by the coop and compete manifests.
 * Two columns: the tile stack + the word-being-built on the left, the
 * opponent strip (compete) + the submission log on the right. Mode is
 * read from `game.mode`.
 *
 * Clicking an exposed tile picks it onto the word; the fifth tile
 * auto-submits via `stackdown.submit_word`. Accepted words remove their
 * tiles (the board updates via the realtime refetch in useGame);
 * invalid attempts are logged and their tiles returned. The shared
 * coop word is kept in sync peer-to-peer by useGame's Broadcast.
 *
 * Coop renders the SHARED stack + log (everyone's, 6 words to clear
 * together). Compete renders the caller's own copy + an OpponentStrip of
 * each player's found-word count; first to clear all six wins.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  timer,
  status,
  feedback,
  goToClub,
  menu,
}: GamePageCtx) {
  const {
    game,
    players: playerStates,
    submissions,
    removedTileIds,
    currentWord,
    appendTile,
    retractTo,
    clearWord,
    markAccepted,
    loading,
  } = useGame(session, gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)
  const [submitting, setSubmitting] = useState(false)

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  const mySolved = self?.solved ?? false
  const canPlay =
    !!self && !isTerminal && !submitting && !(isCompete && mySolved)

  // ─── Submit a completed (5-tile) word ─────────────────────────
  // Only the client that placed the fifth tile calls this (appendTile
  // returns the word to its local caller; remote peers just see the
  // broadcast), so a coop word isn't double-submitted.
  const submit = useCallback(
    async (tileIds: number[]) => {
      setSubmitting(true)
      const { data, error } = await db.rpc('submit_word', {
        target_game: gameId,
        tile_ids: tileIds,
      })
      setSubmitting(false)
      if (error) {
        // Reachability/lock races (rare in friendly coop) land here.
        clearWord()
        feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 1500 } })
        return
      }
      const res = data as { result: 'accepted' | 'invalid'; word: string }
      if (res.result === 'accepted') {
        // Hold the tiles removed optimistically so they don't flash back
        // on-board before the valid submission arrives via realtime.
        markAccepted(tileIds)
        clearWord()
      } else {
        clearWord() // invalid → the tiles return to the board
        feedback.show({ tone: 'error', text: `Not a word: ${res.word}`, dismiss: { kind: 'timed', ms: 1500 } })
      }
    },
    [gameId, feedback, clearWord, markAccepted],
  )

  // ─── Reveal next word (a CHEAT — see stackdown.reveal_next_word) ──
  // Peeks at the next solution word the caller still has to clear. Used
  // to verify generated boards are solvable in order; may be removed once
  // boards are trusted. Surfaced in the header feedback slot so it stays
  // readable while playing.
  const revealNext = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_word', { target_game: gameId })
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 1500 } })
      return
    }
    const word = data as string | null
    feedback.show({
      tone: 'info',
      text: word ? `Next word: ${word}` : 'All words cleared',
      dismiss: { kind: 'closeable' },
    })
  }, [gameId, feedback])

  // ─── Tile click → extend the word, submit on the fifth ────────
  const onTileClick = useCallback(
    (tileId: number) => {
      if (!canPlay) return
      const word = appendTile(tileId)
      if (word && word.length === 5) void submit(word)
    },
    [canPlay, appendTile, submit],
  )

  // ─── End-game menu item (both modes) ──────────────────────────
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  // Everything off the board: tiles spent on accepted words plus the
  // tiles currently picked up into the word being built.
  const offBoard = new Set(removedTileIds)
  for (const id of currentWord) offBoard.add(id)

  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <Board
          tiles={game.tiles}
          offBoard={offBoard}
          active={canPlay}
          onTileClick={onTileClick}
        />
        <WordEntry
          tiles={game.tiles}
          currentWord={currentWord}
          active={canPlay}
          onRetract={retractTo}
        />
      </div>

      <div className={styles.rightCol}>
        {over ? (
          <div className={styles.gameOver}>
            <span>
              <span className="muted">Game over:</span> {over.status}
            </span>
            {game.solution && (
              <span className={styles.reveal}>
                The words were{' '}
                <strong>{game.solution.join(' · ')}</strong>
              </span>
            )}
            <button type="button" className="secondary" onClick={goToClub}>
              Back to club
            </button>
          </div>
        ) : (
          <>
            {isCompete && (
              <OpponentStrip
                players={members}
                selfId={session.user.id}
                metricFor={(player) => {
                  const ps = playerStates.find((p) => p.user_id === player.user_id)
                  const found = ps?.found_count ?? 0
                  return (
                    <>
                      {found}
                      {ps?.solved ? ' ✓' : ''}
                    </>
                  )
                }}
              />
            )}
            {!self && <p className="muted">Watching — you're not in this game.</p>}
            {self && (
              <button
                type="button"
                className="secondary"
                onClick={() => void revealNext()}
                title="Cheat: peek at the next word (for verifying boards)"
              >
                Reveal next word
              </button>
            )}
          </>
        )}

        <FoundWords
          submissions={submissions}
          players={members}
          showWho={!isCompete}
        />
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/** Terminal verdict + status copy, mode- and (compete) self-aware. */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
}): { outcome: 'won' | 'lost'; verdict: string; status: string } {
  // Manual end (stackdown.end_game) → neutral 'ended'. We reuse the
  // modal's 'won' (green) treatment; the verdict copy makes clear
  // there's no winner.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      status: 'ended',
    }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Stack cleared! 🎉', status: 'cleared' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Stack not cleared.',
      status: timerExpired ? 'out of time' : 'not cleared',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — cleared it first!', status: 'you won' }
      : { outcome: 'lost', verdict: 'Beaten to the clear.', status: 'opponent won' }
  }
  // lost_compete — nobody cleared, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody cleared it.',
    status: timerExpired ? 'out of time' : 'no winner',
  }
}
