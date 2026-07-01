import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cls } from '../../common/lib/cls'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import type { GamePageCtx } from '../../common/lib/games'
import type { PsychicnumSetup } from '../lib/setup'
import { GameOverModal } from '../../common/components/GameOverModal'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { ShuffleButton } from '../../common/components/buttons/ShuffleButton'
import { HintButton } from '../../common/components/buttons/HintButton'
import { RevealButton } from '../../common/components/buttons/RevealButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { colorVarFor } from '../../common/lib/memberColor'
import { memberById } from '../../common/lib/peers'
import { endedCopy, type TerminalCopy } from '../../common/lib/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { EntryRow } from '../../common/components/EntryRow'
import { GameTurnLog } from './GameTurnLog'
import { WordBoard } from './WordBoard'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)

/** The computer hides this many secret words; players win by finding all. */
const SECRET_COUNT = 3

/** Local feedback pills are never closeable, so the × is never rendered and this
 *  is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/** Sentence-case a message's first letter. Server errors come back lowercase
 *  (`'setup.guesses is required'`); local feedback should read as a sentence. */
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Fisher–Yates shuffle on a copy. Pure — doesn't mutate input. */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * psychicnum's play surface, shared between coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - Header copy + progress: coop shows the team's "found X of 3";
 *     compete shows the caller's own progress + opponents' budgets.
 *   - GameTurnLog: coop shows everyone's guesses (and hints);
 *     compete is RLS-scoped to the caller.
 *   - Feedback: coop narrates teammates' guesses (green/red) and
 *     hint requests (amber) in the header; compete narrates an
 *     opponent finding a secret in GREEN — never which one. Green
 *     means "they found a word" in BOTH modes, so the player keeps
 *     one color-meaning rather than learning a compete-only one.
 *   - Terminal copy: coop is a team verdict; compete distinguishes
 *     "you won the race" vs "<name> won".
 *
 * Cross-cutting state (members, timer, play_state, paused, chat)
 * lives in `<GamePage>` above this component. PlayArea unmounts
 * on pause — its local state goes with it.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  globalFeedback,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerBudgets, guesses, loading } = useGame(gameId)
  const mode = game?.mode

  // Track the id of the last guess/hint we've already-announced (peer events).
  const lastSeenGuessIdRef = useRef<string | null>(null)
  // Per-opponent secrets-found count we've already announced (compete tension).
  const seenOpponentFoundRef = useRef<Map<string, number>>(new Map())

  // The pending guess, shared by the board tiles and the entry below the board
  // (string so the entry can be empty). PlayArea owns it — and the submit RPC —
  // so a tile click and a keystroke drive the same guess.
  const [pending, setPending] = useState('')
  // The last submitted guess, kept so ArrowUp can recall it into the entry (the
  // universal capture-game last-move history). FE-only — never shared or stored.
  const [lastGuess, setLastGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hinting, setHinting] = useState(false)
  const [revealing, setRevealing] = useState(false)

  // ─── Board shuffle (a fresh visual scan, local only) ────
  // A counter the Shuffle button bumps; the board's display order is derived
  // from it. We key the memo on the words STRING, not `game.words` — useGame
  // returns a fresh array on every realtime refetch, so depending on the array
  // identity would re-shuffle the tiles on every guess. (Same trick spellingbee
  // uses for its letter shuffle.) Reshuffling only reorders the tiles for a
  // fresh look — results/selection are keyed by word, so they're unaffected.
  const [shuffleSeed, setShuffleSeed] = useState(0)
  // '\n' joins/splits the words — it never appears inside a dictionary word.
  const wordsKey = game ? game.words.join('\n') : ''
  const shuffledWords = useMemo(() => {
    if (wordsKey === '') return []
    void shuffleSeed
    return shuffled(wordsKey.split('\n'))
  }, [wordsKey, shuffleSeed])
  const handleShuffle = useCallback(() => setShuffleSeed((s) => s + 1), [])

  // ─── Local feedback flash (own-action) ─────────────────
  // The player's own result, shown as a centered <GenericFeedbackPill> in the entry's
  // already-claimed space (never a new line that would shrink the board —
  // docs/ui.md → Layout stability): "Correct"/"Incorrect" after a guess, or a
  // validation error ("Not on the board"). Local channel: near my eyes, about
  // what I just did (docs/deferred.md → Feedback channels).
  //
  // STICKY, not timed (docs/design-decisions.md → Dismissal modes): an own-move
  // result is important and I may be looking elsewhere on the board, so it
  // persists until my NEXT move dismisses it — a tile click or a keystroke into
  // the EntryBox, both routed through `handleEntryChange` below (which calls the
  // hook's `clear`). `useLocalFeedback(null)` disables the auto-timer.
  const { flash: entryFlash, show: flashEntry, clear: clearFlash } = useLocalFeedback(null)

  // A user-driven entry change — typing a letter, or clicking a board tile — is
  // also the gesture that dismisses a sticky local result, so route both through
  // here: clear the flash, then update the pending guess. (submit_guess sets
  // `pending` to '' directly, NOT through this, so it doesn't clear the flash it
  // is about to show.)
  const handleEntryChange = useCallback(
    (next: string) => {
      clearFlash()
      setPending(next)
    },
    [clearFlash],
  )

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess (green correct / red not) or hint request (amber) is
  // narrated in the header. My own events are excluded — my guesses get the
  // local flash, my hint shows in my own turn log. Compete never reaches here:
  // RLS scopes both guesses AND hints to the caller, and we gate on coop.
  // globalFeedback.show is a prop callback, so no local set-state lives in here.
  useEffect(function announcePeerEvent() {
    if (guesses.length === 0) return
    const latest = guesses[guesses.length - 1]
    // First load / refetch: adopt the latest as seen without replaying it.
    if (lastSeenGuessIdRef.current === null) {
      lastSeenGuessIdRef.current = latest.id
      return
    }
    if (latest.id === lastSeenGuessIdRef.current) return
    lastSeenGuessIdRef.current = latest.id

    if (latest.user_id === session.user.id) return  // mine → local
    if (mode !== 'coop') return
    const member = memberById(players, latest.user_id)
    const name = member?.username ?? 'Someone'
    const dot = colorVarFor(member?.color)

    // Helper actions (hint / reveal) → amber: important, but neither good nor
    // bad. (A reveal logs the answer word, but we narrate it without naming the
    // word — "revealed a word", not which one.)
    if (latest.kind === 'hint' || latest.kind === 'reveal') {
      globalFeedback.show({
        tone: 'warning',
        variant: 'outline',
        dot,
        text: latest.kind === 'hint'
          ? `${name} asked for a hint`
          : `${name} revealed a word`,
        dismiss: { kind: 'timed', ms: 3000 },
      })
      return
    }
    globalFeedback.show({
      tone: latest.was_correct ? 'success' : 'error',
      variant: 'outline',
      dot,
      text: latest.was_correct
        ? `${name} found a secret — ${latest.word.toUpperCase()}!`
        : `${name} guessed ${latest.word.toUpperCase()} — not it`,
      dismiss: { kind: 'timed', ms: 3000 },
    })
  }, [guesses, mode, players, session.user.id, globalFeedback])

  // ─── Compete opponent progress (group feedback) ────────
  // When an opponent's public secrets_found count ticks up, narrate "X guessed a
  // secret word" — the COUNT, never which word (that stays private). GREEN
  // (success), the SAME tone coop uses for a peer's correct guess: green means
  // "they found a word" in both modes, so the player doesn't maintain a
  // compete-only color-meaning. Watches the players rows; the ref seeds silently
  // on first load so history isn't replayed.
  useEffect(function announceOpponentProgress() {
    if (mode !== 'compete') return
    for (const p of playerBudgets) {
      if (p.user_id === session.user.id) continue
      const prev = seenOpponentFoundRef.current.get(p.user_id)
      seenOpponentFoundRef.current.set(p.user_id, p.secrets_found)
      if (prev === undefined) continue  // first sighting — seed, don't announce
      if (p.secrets_found <= prev) continue
      const member = memberById(players, p.user_id)
      const name = member?.username ?? 'Someone'
      globalFeedback.show({
        tone: 'success',
        variant: 'outline',
        dot: colorVarFor(member?.color),
        text: `${name} guessed a secret word`,
        dismiss: { kind: 'timed', ms: 3000 },
      })
    }
  }, [playerBudgets, mode, players, session.user.id, globalFeedback])

  const { showModal, closeModal } = useTerminalModal(isTerminal)

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const selfBudget =
    playerBudgets.find((p) => p.user_id === session.user.id)
      ?.guesses_remaining ?? 0
  const selfSecretsFound =
    playerBudgets.find((p) => p.user_id === session.user.id)?.secrets_found ?? 0

  // Per-status modal + indicator copy. Mode-aware so compete-mode
  // winners get the "you won the race" vs "Bea won the race"
  // distinction, while coop stays the simple team verdict. In compete the
  // winner is the one who completed the set (their secrets_found hit 3).
  const winnerName = (status?.winner_username as string | undefined) ?? 'Someone'
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfWon: game.mode === 'compete' ? selfSecretsFound >= SECRET_COUNT : true,
    winnerName,
  }) : null

  // Guessed words → was-it-a-secret, for the board's permanent green/red.
  // Hint rows are excluded (a hint reveals but doesn't mark a tile). In compete
  // RLS scopes `guesses` to the caller, so this is the viewer's own board.
  const results = new Map(
    guesses.filter((g) => g.kind === 'guess').map((g) => [g.word, g.was_correct]),
  )

  // Progress toward the 3 secrets. Coop = the team's distinct finds (everyone's
  // correct guesses are visible); compete = the caller's own count.
  const teamFound = new Set(
    guesses.filter((g) => g.kind === 'guess' && g.was_correct).map((g) => g.word),
  ).size
  const found = game.mode === 'coop' ? teamFound : selfSecretsFound

  // ─── Info-column readouts (setup choices + live state) ──
  const psychicnumSetup = setup as PsychicnumSetup
  const totalGuesses = psychicnumSetup.guesses
  const guessesUsed = totalGuesses - selfBudget
  const difficultyLabel = DIFFICULTY_LABELS[psychicnumSetup.difficulty - 1] ?? '—'

  // Picking a tile or typing in the form both drive this one pending guess word.
  // (A partially-typed word won't equal any board word, so the board only
  // highlights once a tile is clicked or the full word is typed.)
  const selected = pending === '' ? null : pending
  const canGuess = !over && selfBudget > 0

  // const arrow (not a hoisted `function`) so the `if (!game) return` narrowing
  // above still applies inside — a function declaration is hoisted above it.
  // Every submit clears the entry and shows a flash IN the box (success or
  // error) — so feedback always lands in the entry's already-claimed space,
  // never a new line that would reflow the board.
  const submitGuess = async () => {
    const guess = pending.trim().toLowerCase()
    // Remember the submitted entry so ArrowUp can recall it (covers a rejected
    // guess too — recalling lets the player fix it).
    setLastGuess(pending)
    setPending('')
    // Client-side board-word check for snappy feedback; the server re-validates.
    if (!game.words.includes(guess)) {
      flashEntry('bad', 'Not on the board')
      return
    }
    setSubmitting(true)
    // submit_guess returns 'won' | 'correct' | 'wrong' | 'lost'. 'won'/'correct'
    // both mean the guess hit a secret; the terminal transition we observe via
    // realtime, not the return value.
    const { data, error } = await db.rpc('submit_guess', {
      target_game: gameId,
      guess,
    })
    setSubmitting(false)
    if (error) {
      flashEntry('bad', capitalize(error.message))
      return
    }
    flashEntry(
      data === 'won' || data === 'correct' ? 'good' : 'bad',
      data === 'won' || data === 'correct' ? 'Correct' : 'Incorrect',
    )
  }

  // Hint (a clue) and reveal (the answer word) both land in the turn log via
  // realtime; coop teammates get a header pill. Nothing to do with the return
  // value here — the helper rows arrive over the subscription.
  const getHint = async () => {
    setHinting(true)
    const { error } = await db.rpc('request_hint', { target_game: gameId })
    setHinting(false)
    if (error) flashEntry('bad', capitalize(error.message))
  }

  const getReveal = async () => {
    setRevealing(true)
    const { error } = await db.rpc('request_reveal', { target_game: gameId })
    setRevealing(false)
    if (error) flashEntry('bad', capitalize(error.message))
  }

  // Manual end — the friends agreeing they're done (neutral terminal, nobody
  // wins/loses). Confirmed because it's irreversible.
  const endGame = async () => {
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) flashEntry('bad', capitalize(error.message))
  }

  // The End / Concede button — error-toned (red). Compete uses CONCEDE ("I give
  // up, you win"); solo / coop use the neutral "End" (a mutual "we're done").
  // Two components because they're semantically different actions
  // (docs/design-decisions.md → Action buttons). Shared by the "playing" and the
  // "out of guesses, waiting" action rows below — you can still bow out either way.
  const endButton =
    mode === 'compete' ? (
      <ConcedeGameButton onClick={endGame} className={shared.helperButton} />
    ) : (
      <EndGameButton onClick={endGame} className={shared.helperButton} />
    )

  return (
    <div className={cls(shared.layout, styles.layout)}>
      {/* The board column HUGS the board (styles.boardCol overrides the shared
          flex:1 to flex:0 0 auto): the board grows to fill up to its max tile
          size, the column is only as wide as that, and the board+info pair
          centers. The entry row below stretches to the board width. */}
      <div className={cls(shared.boardCol, styles.boardCol)}>
        <WordBoard
          words={shuffledWords}
          results={results}
          selected={selected}
          onPick={canGuess ? handleEntryChange : undefined}
        />
        {/* Shuffle floats over the board's top-right — it's purely visual (a
            fresh scan of the SAME board), not a turn action, so it lives on the
            board, not in the info-column action row. Always present, even at
            terminal ("could I have found that with a reshuffle?"). */}
        <ShuffleButton
          onShuffle={handleShuffle}
          label="Shuffle the words"
          className={shared.floatingShuffle}
        />
        {/* The belowBoard region (v3): one fixed-height slot below the
            top-anchored board, holding the local feedback area + the guess entry
            (docs/design-decisions.md → BoardCol). It ALWAYS renders (never null),
            so the slot can't collapse and let the flex:1 board grow (docs/ui.md →
            Layout stability). Three states, all in the same place the player's
            eyes already are:
              - terminal → a PERMANENT GenericFeedbackPill (fill, outcome-colored)
                carrying the secret reveal — the terminal state always lands as
                permanent local feedback (design-decisions.md → Feedback);
              - playing + can guess → the GuessForm (entry, or a transient pill
                for the player's own last result);
              - out of guesses but not over (compete, others still playing) → a
                sticky "waiting" pill. */}
        <div className={styles.belowBoard}>
          {over ? (
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={{
                  tone:
                    over.tone === 'won'
                      ? 'success'
                      : over.tone === 'lost'
                        ? 'error'
                        : 'neutral',
                  text: game.secrets
                    ? `The words were ${game.secrets.join(', ').toUpperCase()}`
                    : 'Game over.',
                  variant: 'fill', // permanent → lightened-tone fill
                  dismiss: { kind: 'sticky' }, // never auto- or user-dismissed
                }}
                onClose={noop}
              />
            </div>
          ) : canGuess ? (
            /* The shared <EntryRow> (icon-only Delete + the EntryBox + icon-only
               Submit + the capture keyboard) — same control every EntryBox game
               uses. `bigEntry` bumps the entry font (psychicnum's one short guess
               word reads large). The own-move result pill replaces the controls
               while the entry is empty (typing reclaims it). */
            <EntryRow
              value={pending}
              onChange={handleEntryChange}
              onSubmit={submitGuess}
              placeholder="Click on a tile or type"
              busy={submitting}
              onAnyKey={clearFlash}
              recall={lastGuess}
              className={styles.bigEntry}
              pill={
                entryFlash && pending === ''
                  ? {
                      tone: entryFlash.tone === 'good' ? 'success' : 'error',
                      text: entryFlash.label,
                      variant: 'outline',
                      dismiss: { kind: 'sticky' },
                    }
                  : null
              }
            />
          ) : (
            <div className={shared.localFeedback}>
              <GenericFeedbackPill
                msg={{
                  tone: 'neutral',
                  text: 'Out of guesses — waiting on the rest.',
                  variant: 'outline',
                  dismiss: { kind: 'sticky' },
                }}
                onClose={noop}
              />
            </div>
          )}
        </div>
      </div>
      <div className={shared.infoCol}>
        {/* The non-log info column — four recurring kinds of info, the shared
            named classes (.infoSetup / .infoState / .infoHelp / .infoActions)
            from common/components/PlayArea.module.css so they're consistent
            across games. Which survive into the terminal state differs per kind
            — see below. */}
        <div className={shared.actionSlot}>
          {/* State — shown in both states. */}
          <p className={shared.infoState}>
            <strong>{found}/{SECRET_COUNT}</strong> found ·{' '}
            <strong>{guessesUsed}/{totalGuesses}</strong> guesses used
          </p>
          {game.mode === 'compete' && (
            <OpponentStrip
              players={players}
              selfId={session.user.id}
              metricLabel="Found"
              metricFor={(p) =>
                playerBudgets.find((b) => b.user_id === p.user_id)
                  ?.secrets_found ?? 0
              }
            />
          )}

          {/* The action row has three states. TERMINAL (game over): a bold,
              outcome-colored result line + a compact back-to-club button.
              PLAYING (can guess): Hint / Reveal + End/Concede. WAITING (out of
              guesses but the game's still going — basically terminal for ME):
              reuse the terminal LOOK (a bold status line + the action on the
              right) so the state change reads loudly, not as a silently-swapped
              help line (docs/design-decisions.md → InfoCol help). */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span
                className={cls(shared.outcome, shared[`outcome_${over.tone}`])}
              >
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : canGuess ? (
            <div className={shared.infoActions}>
              {/* Hint = a clue (common.words.hint); Reveal = the answer word.
                  Both log to the turn log, cost nothing — and both are
                  warning-toned (amber) via the semantic button components. */}
              <HintButton
                onClick={getHint}
                disabled={hinting}
                className={shared.helperButton}
              />
              <RevealButton
                onClick={getReveal}
                disabled={revealing}
                className={shared.helperButton}
              />
              {endButton}
            </div>
          ) : (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>
                Waiting for others
              </span>
              {endButton}
            </div>
          )}

          {/* Help — shown ONLY while you can actually act on it (canGuess). It
              never silently swaps text: the "out of guesses, waiting" state is
              carried loudly by the action row above (the terminal look), not by a
              quietly-changed help line (docs/design-decisions.md → InfoCol help).
              Below the action row, per the InfoCol order. */}
          {canGuess && (
            <p className={shared.infoHelp}>
              Click on or type a word and hit submit.
            </p>
          )}

          {/* Setup — shown in BOTH states, behind a disclosure, LAST before the
              turn log (docs/design-decisions.md → InfoCol order). Open, it grows
              (which we normally avoid), but it's closable so it reclaims the
              space — "what did I pick at setup?" without it taking room by
              default. (See docs/ui.md → Layout stability.) */}
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{game.words.length} tiles on the board</li>
              <li>{SECRET_COUNT} secret words</li>
              <li>{difficultyLabel} difficulty</li>
            </ul>
          </details>
        </div>
        <GameTurnLog guesses={guesses} players={players} />
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

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the GameOverModal;
 * `message` + `tone` drive the short, bold, color-coded line in the info column
 * (won = green, lost = red, manual end = neutral).
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  /** Compete: did the caller complete the set? (Coop verdicts ignore it.) */
  selfWon: boolean
  /** Compete: the winner's frozen username (for the "X won" message). */
  winnerName: string
}): TerminalCopy {
  // Manual end ('ended', written by psychicnum.end_game) is the uniform neutral
  // terminal shared with the other games — the shared endedCopy() owns it.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'You found all three!', message: 'You won!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'You lost: out of time' : 'You lost: out of guesses',
      message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won the race!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten to the punch.', message: `${winnerName} won`, tone: 'lost' }
  }
  // lost_compete (all exhausted OR timeout in compete)
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — nobody won.' : 'Out of guesses — nobody won.',
    message: timerExpired ? 'Timer elapsed' : 'Out of guesses',
    tone: 'lost',
  }
}
