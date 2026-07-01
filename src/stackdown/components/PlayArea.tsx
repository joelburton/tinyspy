import { useCallback, useEffect, useRef, useState } from 'react'
import { cls } from '../../common/lib/cls'
import type {
  GenericFeedbackMsg,
  GenericFeedbackTone,
  GamePageCtx,
  TimerMode,
} from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useGlobalKeyHandler } from '../../common/hooks/useGlobalKeyHandler'
import { db } from '../db'
import { exposedIds } from '../lib/board'
import type { StackdownSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { usePeerFeedback } from '../hooks/usePeerFeedback'
import { Board } from './Board'
import { WordEntry, type WordFlash } from './WordEntry'
import { FoundWords } from './FoundWords'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * stackdown's play surface, shared by the coop and compete manifests, on the
 * shared two-column scaffold (docs/design-decisions.md → PlayArea layout):
 *
 *   - **Board column** — the stacked-tile board, a floating nothing (no shuffle
 *     here — the stack IS the puzzle), and a below-board region with the
 *     five-slot `WordEntry` and a fixed-height LOCAL feedback slot. Own-move
 *     results land in that slot as a centered `<GenericFeedbackPill>`; an accepted /
 *     rejected word ALSO flashes its letters green/red in the WordEntry (the ring
 *     is board-adjacent, the pill carries the words that have no ring — misses on
 *     keystrokes, reveals, errors, the terminal verdict).
 *   - **Info column** — the live cleared count, the compete OpponentStrip, the
 *     Reveal-hint / Reveal-word cheats + End/Concede action row (terminal outcome
 *     line at game-over), a help line, the setup disclosure, the words-cleared
 *     reveal (terminal only), and the `FoundWords` submission log filling the
 *     rest.
 *
 * Clicking an exposed tile picks it onto the word; the fifth tile auto-submits
 * via `stackdown.submit_word`. Accepted words remove their tiles (the board
 * updates via the realtime refetch in useGame); invalid attempts are logged and
 * their tiles returned. The word being built is **private** to each player — not
 * broadcast — in both modes. Mode is read from `game.mode`.
 *
 * Coop renders the SHARED stack + log; compete renders the caller's own copy + an
 * OpponentStrip of each player's found-word count (first to clear all six wins).
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  globalFeedback,
  goToClub,
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

  // ─── Local own-move feedback (the below-board pill) ──────────────
  // The player's OWN move results — a rejected word, a keystroke that matched no
  // exposed tile (or too many), a reveal's answer, an RPC error — show as a
  // centered <GenericFeedbackPill> in the below-board slot (docs/design-decisions.md →
  // local feedback area). Sticky: it persists until the player's NEXT action
  // (a tile click, a keystroke) dismisses it. Peer narration goes to the GLOBAL
  // header instead (usePeerFeedback). Word accept/reject additionally flash the
  // WordEntry ring (below), so the pill is for the results that HAVE no ring.
  const [localMsg, setLocalMsg] = useState<GenericFeedbackMsg | null>(null)
  const showLocal = useCallback(
    (text: string, tone: GenericFeedbackTone, dismiss: GenericFeedbackMsg['dismiss'] = { kind: 'sticky' }) => {
      setLocalMsg({ tone, text, variant: 'outline', dismiss })
    },
    [],
  )
  const clearLocal = useCallback(() => setLocalMsg(null), [])

  // Tiles to briefly outline in red — set when a typed letter is ambiguous
  // (more than one exposed tile bears it), cleared after a beat.
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

  // A word flashes in the entry row for a beat, then clears — or sooner,
  // when the player starts a new word (onTileClick clears it). Two sources
  // feed it: the player's OWN just-accepted word (green "good move"), and —
  // in coop — a TEAMMATE's played word (green if valid, red if rejected),
  // driven by usePeerFeedback. WordEntry only shows the flash while the
  // player isn't mid-word, so it never stomps an in-progress spelling.
  const [flash, setFlash] = useState<WordFlash | null>(null)
  const flashWordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showFlash = useCallback((letters: string[], tone: 'good' | 'bad') => {
    setFlash({ letters, tone })
    if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    flashWordTimer.current = setTimeout(() => {
      setFlash(null)
      flashWordTimer.current = null
    }, 1500)
  }, [])
  const clearFlash = useCallback(() => {
    if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    flashWordTimer.current = null
    setFlash(null)
  }, [])
  useEffect(
    () => () => {
      if (flashWordTimer.current) clearTimeout(flashWordTimer.current)
    },
    [],
  )
  // Coop: a teammate's played word → flash it green (valid) / red (invalid).
  const onPeerWord = useCallback(
    (letters: string[], valid: boolean) => showFlash(letters, valid ? 'good' : 'bad'),
    [showFlash],
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
        showLocal(error.message, 'error')
        return
      }
      const res = data as { result: 'accepted' | 'invalid'; word: string }
      if (res.result === 'accepted') {
        // Empty the word and hold its tiles removed optimistically on
        // THIS client so the grid doesn't flash them back on before the
        // valid submission lands via realtime. Teammates just see the
        // tiles leave once, on their own refetch.
        commitWord(tileIds)
        // Flash the just-spelled word green in the entry row (the ring is the
        // own-accepted signal; no pill needed).
        clearLocal()
        showFlash([...res.word.toUpperCase()], 'good')
      } else {
        clearWord() // invalid → the tiles return to the board
        showLocal(`Not a word: ${res.word.toUpperCase()}`, 'error')
      }
    },
    [gameId, clearWord, commitWord, showFlash, showLocal, clearLocal],
  )

  // ─── Reveal next word (a CHEAT — see stackdown.reveal_next_word) ──
  // Peeks at the next solution word the caller still has to clear. Used
  // to verify generated boards are solvable in order; may be removed once
  // boards are trusted. Surfaced in the LOCAL feedback slot (the player's own
  // request, so it's local, not global) — closeable so it lingers while they
  // hunt for the tiles.
  const revealNext = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_word', { target_game: gameId })
    if (error) {
      showLocal(error.message, 'error')
      return
    }
    const word = data as string | null
    showLocal(
      word ? `Next word: ${word.toUpperCase()}` : 'All words cleared',
      'warning', // a reveal is a "help, not good-or-bad" action — amber like the button
      { kind: 'closeable' },
    )
  }, [gameId, showLocal])

  // ─── Reveal hint (the next word's HINT — a nudge, not the word) ──
  // A softer reveal than "Reveal word": shows the curated hint for the
  // next solution word (common.words.hint, a clue that hides the word).
  // The word never reaches the client — reveal_next_hint returns only the
  // hint text. Every stackdown word is in the hint set, so no fallback.
  const revealHint = useCallback(async () => {
    const { data, error } = await db.rpc('reveal_next_hint', { target_game: gameId })
    if (error) {
      showLocal(error.message, 'error')
      return
    }
    const hint = data as string | null
    showLocal(hint ? `Hint: ${hint}` : 'All words cleared', 'warning', { kind: 'closeable' })
  }, [gameId, showLocal])

  // ─── Tile click → extend the word, submit on the fifth ────────
  const onTileClick = useCallback(
    (tileId: number) => {
      if (!canPlay) return
      clearFlash() // starting a new word drops any lingering flash
      clearLocal() // …and the previous move's local pill (the "next move dismisses it" rule)
      const word = appendTile(tileId)
      if (word && word.length === 5) void submit(word)
    },
    [canPlay, appendTile, submit, clearFlash, clearLocal],
  )

  // ─── Physical keyboard ────────────────────────────────────────
  // Backspace returns the most recent tile; a letter key plays the
  // matching tile — but ONLY if exactly one exposed tile bears it (the
  // word is the selection order, so an ambiguous letter can't pick for
  // you). 0 matches is an error ("no such tile on top"); >1 flashes the
  // candidates and asks you to click one. useGlobalKeyHandler reads this
  // closure fresh each render and ignores keys aimed at chat / inputs.
  useGlobalKeyHandler((e) => {
    if (!game || !canPlay) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    // Any handled keystroke is a "next move" — clear the previous local pill.
    // The no-match / ambiguous branches below set a fresh one after this.
    clearLocal()
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
        showLocal(`No “${letter}” tile is on top`, 'error')
      } else {
        // Ambiguous — point out the candidates with a brief red outline.
        flashTiles(matches.map((m) => m.id))
        showLocal(`${matches.length} “${letter}” tiles are on top — click one`, 'warning')
      }
    }
  })

  // ─── End / Concede — an info-column action-row button (both modes) ──
  // Manual end (stackdown.end_game) → a neutral stop. Confirmed; irreversible.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocal(`End game failed: ${error.message}`, 'error')
  }, [gameId, isTerminal, showLocal])

  // ─── Coop: narrate teammates' moves ───────────────────────────
  // The player who DIDN'T make a move otherwise saw nothing but the log
  // quietly growing. Surface each teammate submission as a GLOBAL feedback pill
  // (with their identity disc), and flash their played word (green/red) in the
  // entry row. Called unconditionally before the early returns; the hook no-ops
  // off coop and until loaded.
  usePeerFeedback({
    loading,
    mode: game?.mode,
    selfUserId: session.user.id,
    submissions,
    players: members,
    feedback: globalFeedback,
    onPeerWord,
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

  // The words-cleared count for the info-column state line. Coop is the shared
  // total (every valid submission is visible); compete reads the caller's own
  // public tally (submissions are RLS-scoped to the caller, so its valid count
  // matches, but found_count is the authoritative number).
  const foundCount = isCompete
    ? self?.found_count ?? 0
    : submissions.filter((s) => s.valid).length

  // Cheat tallies for the status line. Counted off the caller's visible
  // submissions — coop = the shared team total, compete = the caller's own
  // (RLS already scopes the list), matching how foundCount reads per mode.
  const hintCount = submissions.filter((s) => s.kind === 'hint').length
  const revealCount = submissions.filter((s) => s.kind === 'reveal').length

  // The submission log. Compete RLS opens every player's submissions once the
  // game is terminal, but the log should keep showing just the caller's own —
  // the same list as during play — so it doesn't swap to an everyone's-words
  // view at game over (mirrors wordle's guess list). Coop is the shared board,
  // so it shows everyone's throughout.
  const logWords = isCompete
    ? submissions.filter((s) => s.user_id === session.user.id)
    : submissions

  // The below-board local pill: the permanent terminal verdict takes precedence
  // over any transient own-move message.
  const localPill: GenericFeedbackMsg | null = over
    ? {
        tone: over.outcome === 'won' ? 'success' : 'error',
        text: over.verdict,
        variant: 'fill', // permanent → lightened-tone fill
        dismiss: { kind: 'sticky' },
      }
    : localMsg

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={cls(shared.boardCol, styles.boardCol)}>
        <Board
          tiles={game.tiles}
          offBoard={offBoard}
          active={canPlay}
          highlight={new Set(flashIds)}
          onTileClick={onTileClick}
        />

        <div className={styles.belowBoard}>
          <WordEntry
            tiles={game.tiles}
            currentWord={currentWord}
            active={canPlay}
            onRetract={retractTo}
            flash={flash}
          />
          {/* Fixed-height LOCAL feedback slot: reserved whether or not a pill
              shows, so the board above never reflows when feedback appears. */}
          <div className={styles.localSlot}>
            {localPill && (
              <div className={shared.localFeedback}>
                <GenericFeedbackPill msg={localPill} onClose={clearLocal} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={shared.infoCol}>
        <div className={shared.actionSlot}>
          {/* InfoCol order is FIXED (docs/design-decisions.md → Info column):
              state → opponent strip → action row → help → setup disclosure → log. */}

          {/* State — words cleared out of six, plus the cheat tallies (hints /
              reveals used). Always shown (even at 0) so using one doesn't shift
              the rows below. */}
          <p className={shared.infoState}>
            <strong>{foundCount}</strong> / 6 words cleared
            <br />
            <strong>{hintCount}</strong> hint{hintCount === 1 ? '' : 's'} ·{' '}
            <strong>{revealCount}</strong> reveal{revealCount === 1 ? '' : 's'} used
          </p>

          {/* Opponent strip (compete) — each player's found-word count, identity
              on a leading disc; a ✓ marks a player who's cleared the board. */}
          {isCompete && (
            <OpponentStrip
              players={members}
              selfId={session.user.id}
              metricLabel="Found"
              metricFor={(player, isSelf) => {
                const ps = playerStates.find((p) => p.user_id === player.user_id)
                const found = isSelf ? self?.found_count ?? 0 : ps?.found_count ?? 0
                return (
                  <>
                    {found}
                    {ps?.solved ? ' ✓' : ''}
                  </>
                )
              }}
            />
          )}

          {/* Action row — Reveal hint / Reveal word cheats + End/Concede during
              play; at terminal the bold outcome line + a compact back-to-club
              button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.outcome === 'won' ? 'won' : 'lost'}`])}>
                {over.status}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : self ? (
            <div className={shared.infoActions}>
              {/* Cheats: both warning-toned (amber) — "help, not good-or-bad".
                  Default labels ("Hint" / "Reveal"); the tooltip carries the
                  full "what it does" copy. */}
              <HintButton
                onClick={() => void revealHint()}
                className={shared.helperButton}
                title="Cheat: show the next word's definition (not the word)"
              />
              <RevealButton
                onClick={() => void revealNext()}
                className={shared.helperButton}
                title="Cheat: peek at the next word (for verifying boards)"
              />
              {isCompete ? (
                <ConcedeGameButton
                  onClick={() => void handleEndGame()}
                  className={shared.helperButton}
                />
              ) : (
                <EndGameButton
                  onClick={() => void handleEndGame()}
                  className={shared.helperButton}
                />
              )}
            </div>
          ) : null}

          {/* Help — only while the player can act on it (never silently swapped). */}
          {!over && self && (
            <p className={shared.infoHelp}>
              Click exposed tiles — or type a letter — to spell a word.{' '}
              <kbd>Backspace</kbd> takes one back.
            </p>
          )}
          {!over && !self && (
            <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
          )}

          {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>30 tiles · 6 words to clear</li>
              <li>Common 5-letter words</li>
              <li>{timerLabel((setup as unknown as StackdownSetup).timer)}</li>
            </ul>
          </details>
        </div>

        {/* Terminal-only reveal of the six solution words — the one info-column
            region allowed to grow at game-over (docs/ui.md → Layout stability). */}
        {over && game.solution && (
          <div className={cls(shared.terminalExtra, styles.reveal)}>
            <span className="muted">The words were</span>{' '}
            <strong>{game.solution.map((w) => w.toUpperCase()).join(' · ')}</strong>
          </div>
        )}

        <FoundWords submissions={logWords} players={members} showWho={!isCompete} />
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

/** One-line timer summary for the setup disclosure (same shape the other migrated
 *  games use). */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

/** Terminal verdict + status copy, mode- and (compete) self-aware. `outcome` +
 *  `verdict` drive the GameOverModal + the permanent below-board pill; `status`
 *  drives the short bold line in the info-column action row. */
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
      status: 'Game ended',
    }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Stack cleared! 🎉', status: 'Cleared!' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Stack not cleared.',
      status: timerExpired ? 'Out of time' : 'Not cleared',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — cleared it first!', status: 'You won!' }
      : { outcome: 'lost', verdict: 'Beaten to the clear.', status: 'Opponent won' }
  }
  // lost_compete — nobody cleared, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody cleared it.',
    status: timerExpired ? 'Out of time' : 'No winner',
  }
}
