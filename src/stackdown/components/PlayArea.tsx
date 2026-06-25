import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { db } from '../db'
import { exposedIds } from '../lib/board'
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
 * invalid attempts are logged and their tiles returned. The word being
 * built is **private** to each player — not broadcast — in both modes.
 *
 * Coop renders the SHARED stack + log (everyone's, 6 words to clear
 * together — but each player builds their own word, only the completed
 * submissions are shared). Compete renders the caller's own copy + an
 * OpponentStrip of each player's found-word count; first to clear all
 * six wins.
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
    commitWord,
    loading,
  } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)
  const [submitting, setSubmitting] = useState(false)
  // Tiles to briefly outline in red — set when a typed letter is
  // ambiguous (more than one exposed tile bears it), cleared after a beat.
  const [flashIds, setFlashIds] = useState<readonly number[]>([])
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTiles = useCallback((ids: number[]) => {
    setFlashIds(ids)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      setFlashIds([])
      flashTimer.current = null
    }, 900)
  }, [])
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    [],
  )
  // A just-accepted word flashes green in the entry row for a beat
  // (positive "good move" feedback), then clears — or sooner, when the
  // player starts a new word (onTileClick clears it).
  const [goodWord, setGoodWord] = useState<number[] | null>(null)
  const goodTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashGoodWord = useCallback((tileIds: number[]) => {
    setGoodWord(tileIds)
    if (goodTimer.current) clearTimeout(goodTimer.current)
    goodTimer.current = setTimeout(() => {
      setGoodWord(null)
      goodTimer.current = null
    }, 1000)
  }, [])
  const clearGoodWord = useCallback(() => {
    if (goodTimer.current) clearTimeout(goodTimer.current)
    goodTimer.current = null
    setGoodWord(null)
  }, [])
  useEffect(
    () => () => {
      if (goodTimer.current) clearTimeout(goodTimer.current)
    },
    [],
  )

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  const mySolved = self?.solved ?? false
  const canPlay =
    !!self && !isTerminal && !submitting && !(isCompete && mySolved)

  // ─── Submit a completed (5-tile) word ─────────────────────────
  // Each player builds their own word locally (selections aren't shared
  // any more), so whoever lays the fifth tile submits their own word —
  // there's no shared word to double-submit.
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
        // Empty the word and hold its tiles removed optimistically on
        // THIS client so the grid doesn't flash them back on before the
        // valid submission lands via realtime. Teammates just see the
        // tiles leave once, on their own refetch.
        commitWord(tileIds)
        // Flash the just-spelled word green in the entry row.
        flashGoodWord(tileIds)
      } else {
        clearWord() // invalid → the tiles return to the board
        feedback.show({ tone: 'error', text: `Not a word: ${res.word.toUpperCase()}`, dismiss: { kind: 'timed', ms: 1500 } })
      }
    },
    [gameId, feedback, clearWord, commitWord, flashGoodWord],
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
      text: word ? `Next word: ${word.toUpperCase()}` : 'All words cleared',
      dismiss: { kind: 'closeable' },
    })
  }, [gameId, feedback])

  // ─── Reveal hint (the next word's HINT — a nudge, not the word) ──
  // A softer reveal than "Reveal word": shows the curated hint for the
  // next solution word (common.words.hint, a clue that hides the word).
  // The word never reaches the client — reveal_next_hint returns only the
  // hint text. Every StackDown word is in the hint set, so no fallback.
  const revealHint = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_hint', { target_game: gameId })
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'timed', ms: 1500 } })
      return
    }
    const hint = data as string | null
    feedback.show({
      tone: 'info',
      text: hint ? `Hint: ${hint}` : 'All words cleared',
      dismiss: { kind: 'closeable' },
    })
  }, [gameId, feedback])

  // ─── Tile click → extend the word, submit on the fifth ────────
  const onTileClick = useCallback(
    (tileId: number) => {
      if (!canPlay) return
      clearGoodWord() // starting a new word drops the green flash
      const word = appendTile(tileId)
      if (word && word.length === 5) void submit(word)
    },
    [canPlay, appendTile, submit, clearGoodWord],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Backspace returns the most recent tile; a letter key plays the
  // matching tile — but ONLY if exactly one exposed tile bears it (the
  // word is the selection order, so an ambiguous letter can't pick for
  // you). 0 or >1 matches just flash feedback. useGlobalKeyHandler reads
  // this closure fresh each render and ignores keys aimed at chat / inputs.
  useGlobalKeyHandler((e) => {
    if (!game || !canPlay) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (currentWord.length > 0) retractTo(currentWord.length - 1)
      return
    }
    if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
      const letter = e.key.toUpperCase()
      // Exposed tiles still on the board (offBoard already excludes the
      // tiles picked into the word + the words removed so far).
      const off = new Set(removedTileIds)
      for (const id of currentWord) off.add(id)
      const exposed = exposedIds(game.tiles, off)
      const matches = game.tiles.filter(
        (t) => exposed.has(t.id) && t.letter === letter,
      )
      if (matches.length === 1) {
        onTileClick(matches[0].id)
      } else if (matches.length === 0) {
        feedback.show({
          tone: 'info',
          text: `No “${letter}” tile is on top`,
          dismiss: { kind: 'timed', ms: 1200 },
        })
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles(matches.map((m) => m.id))
        feedback.show({
          tone: 'info',
          text: `${matches.length} “${letter}” tiles are on top — click one`,
          dismiss: { kind: 'timed', ms: 1500 },
        })
      }
    }
  })

  // ─── End-game menu item (both modes) ──────────────────────────
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  // While playing, hide tiles spent on accepted words plus the tiles
  // currently picked up into the word being built. Once the game is over,
  // show the ORIGINAL board (a won game has cleared every tile, so it'd
  // otherwise be blank) for review — the tiles are inert since canPlay is
  // false.
  const offBoard = new Set<number>()
  if (!isTerminal) {
    for (const id of removedTileIds) offBoard.add(id)
    for (const id of currentWord) offBoard.add(id)
  }

  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  // The submission log. Compete RLS opens every player's submissions once
  // the game is terminal, but the log should keep showing just the caller's
  // own — the same list as during play — so it doesn't swap to an
  // everyone's-words view at game over (mirrors wordle's guess list). Coop
  // is the shared board, so it shows everyone's throughout.
  const logWords = isCompete
    ? submissions.filter((s) => s.user_id === session.user.id)
    : submissions

  return (
    <div className={styles.layout}>
      <div className={styles.boardArea}>
        <Board
          tiles={game.tiles}
          offBoard={offBoard}
          active={canPlay}
          highlight={new Set(flashIds)}
          onTileClick={onTileClick}
        />
        <WordEntry
          tiles={game.tiles}
          currentWord={currentWord}
          active={canPlay}
          onRetract={retractTo}
          goodWordTiles={goodWord}
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
                <strong>
                  {game.solution.map((w) => w.toUpperCase()).join(' · ')}
                </strong>
              </span>
            )}
            <BackToClubButton onClick={goToClub} />
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
              <div className={styles.cheats}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void revealHint()}
                  title="Cheat: show the next word's definition (not the word)"
                >
                  Reveal hint
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void revealNext()}
                  title="Cheat: peek at the next word (for verifying boards)"
                >
                  Reveal word
                </button>
              </div>
            )}
          </>
        )}

        <FoundWords
          submissions={logWords}
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
