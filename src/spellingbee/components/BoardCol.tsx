// cs-met-spellingbee

import { useCallback, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import type { Outcome } from '@/common/outcomes/outcomes'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useFoundWordSubmit, type LegalWord } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import type { FoundWordRow, SpellingbeeGame } from '../hooks/useGame'
import { answerMessage, answerOf } from '../lib/answer'
import { Letters } from './Letters'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'

/** What `spellingbee.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

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
 * spellingbee's board column — the honeycomb `<Letters>`, a floating Shuffle over its
 * top-right, and the below-board slot (the shared `<WordEntryArea>` — the typed-word input
 * + capture keyboard, whose `<WordEntryInput>` renders the per-character illegal-letter dim
 * via `<TypedWord>`).
 *
 * It owns the **move**: the word-entry engine (`useFoundWordSubmit` — the typed
 * word, the dedup, the `submit_word` commit), what each answer shows, and the
 * hive's answer to a refused word (the shake and the hex marks). It also owns
 * the **local outer-letter shuffle** (a per-player view-only rearrange — never
 * persisted or shared) and a click on a letter appending to the word. The local
 * feedback slot every answer shows into stays the PlayArea's — its standing
 * conditions and InfoCol's End / Concede show into it too — and comes down as a
 * prop. See docs/playarea.md.
 */
export function BoardCol({
  // ── Mobile-only status block (above the board) ──
  foundWordsScore,
  requiredWordsScore,
  targetRankIdx,
  foundWordsCount,
  requiredWordsCount,
  // ── Board to render ──
  outerLetters,
  centerLetter,
  // ── The move ──
  gameId,
  mode,
  selfId,
  myConceded,
  foundWords,
  requiredWords,
  bonusWords,
  localFeedbackSlot,
  isTerminal,
}: {
  // ── Mobile-only status block ──
  /** The four figures behind the RankBar + Stats unit — the SAME components the
   *  info column renders, mirrored above the board below the `--mobile`
   *  breakpoint (where the info column is off-canvas in the InfoSheet). Hidden by
   *  CSS on desktop; see `<MobileStatusBar>`. */
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number
  /** The goal rank, when the game has one — marked on the mobile RankBar
   *  exactly as on the info column's copy (which is off-canvas on a phone,
   *  so this is the only place the goal shows there). */
  targetRankIdx: number | null

  // ── Board to render ──
  /** The board's outer letters (a string) — the local shuffle rearranges this. */
  outerLetters: string
  centerLetter: string

  // ── The move ──
  gameId: string
  mode: 'coop' | 'compete'
  selfId: string
  /** I conceded a race — the engine takes no more words from me. */
  myConceded: boolean
  /** The committed rows, the engine's dedup source (mode-aware: the team's in
   *  coop, mine in compete). */
  foundWords: FoundWordRow[]
  /** Both shipped lists: a word is judged and scored against them here. */
  requiredWords: SpellingbeeGame['requiredWords']
  bonusWords: SpellingbeeGame['bonusWords']
  /** PlayArea's below-board slot — every answer shows into it, the entry row
   *  draws its top in place of the controls, and a letter click is the player's
   *  next action, so it dismisses a gesture-cleared result. */
  localFeedbackSlot: FeedbackSlot
  /** The game is over for everyone. */
  isTerminal: boolean
}) {
  // ─── Committing a guess ────────────────────────────────
  // The shared engine owns the typed word, the dedup and the optimistic commit;
  // this game supplies the lookup, the RPC and what it shows for each answer.
  // First, because the engine owns the pending word the sections below read.

  // No more words from me: the game is over, or I conceded a race the others
  // play on. The engine and the entry read this one answer, so a conceder's
  // keys cannot fill a word the engine will refuse.
  const entryClosed = isTerminal || myConceded

  // The hive's seven letters, lower-cased — the typed word's illegal-letter dim,
  // and why a word missed.
  const allowedLetters = useMemo(() => {
    const s = new Set<string>()
    for (const ch of outerLetters) s.add(ch.toLowerCase())
    s.add(centerLetter.toLowerCase())
    return s
  }, [outerLetters, centerLetter])

  // Both word lists ship to the FE, so a guess is validated + scored locally —
  // index required ∪ bonus by word.
  const legalIndex = useMemo(() => {
    const m = new Map<string, LegalWord>()
    for (const r of requiredWords) {
      m.set(r.word, { word: r.word, points: r.points, isBonus: false, isPangram: r.is_pangram })
    }
    for (const b of bonusWords) {
      m.set(b.word, { word: b.word, points: b.points, isBonus: true, isPangram: b.is_pangram })
    }
    return m
  }, [requiredWords, bonusWords])

  // A refused word shakes the hive — the head-shake "no" every board gives a
  // move that wasn't a winning one. A bumping nonce, because it is the WHOLE
  // board that shakes and a board is always mounted: the nonce keys the hive so
  // each refusal remounts it and the animation plays again (a CSS animation
  // restarts on a remount, not on a state change under it).
  const [shakeNonce, setShakeNonce] = useState(0)

  /** The letters the refused word used, wearing its answer. The word itself is
   *  gone by then — the entry clears on submit — so they are captured here. */
  const [answered, showAnswer] = useMark<{ letters: Set<string>; outcome: Outcome }>(WORD_ANSWER_MS)

  const center = centerLetter.toLowerCase()
  const { word, setWord, lastWord, submit } =
    useFoundWordSubmit({
      mode,
      userId: selfId,
      isTerminal: entryClosed,
      minWordLength: 4,
      localFeedbackSlot,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      // Four ok answers, all meaning the row landed: three classifications the
      // FE's own flags come back as, plus `won` — this word crossed the target
      // rank and ended the game. None of them changes what the optimistic pill
      // already says; the terminal flip arrives over realtime. Every refusal
      // means the word was NOT recorded, so each releases it.
      commit: async (e) => {
        const res = await runRpc<SubmittedWord>(
          db.rpc('submit_word', {
            target_game: gameId,
            word: e.word,
            points: e.points,
            is_pangram: e.isPangram ?? false,
            is_bonus: e.isBonus,
          }),
        )
        if (res.type === 'not-ok') {
          return res
        } else if (res.type === 'ok' && res.data?.result === 'accepted') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'bonus') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'pangram') {
          return null
        } else if (res.type === 'ok' && res.data?.result === 'won') {
          return null
        } else {
          reportUnhandled('submit_word', res)
          return null
        }
      },
      // Every answer shows in the pill, in `lib/answer.ts`'s words. A refused
      // word also answers ON the board: the hive shakes its head, and the hexes
      // the word used take that answer's fill and white ink — the same outcome
      // as the pill, so the two cannot disagree. The actor's alone, and no
      // attention flash with it — you know what you just typed, and a peer is
      // never told about somebody else's miss.
      onAnswer: (report) => {
        const { outcome, text } = answerMessage(answerOf(report, { letters: allowedLetters, center }))
        localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
        if (report.answer === 'accepted') return
        setShakeNonce((n) => n + 1)
        showAnswer({ letters: new Set(report.word.toUpperCase()), outcome })
      },
    })

  // ─── The pending guess ─────────────────────────────────
  // The typed word is the engine's, above; what this column reads off it, and
  // the letter click that adds to it, sit here.

  // The hexes the typed word is using. A Set of its letters is the whole of it:
  // a hive letter can be typed more than once and there is nothing to count.
  const usedLetters = useMemo(() => new Set(word.toUpperCase()), [word])

  const handleLetterClick = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss()
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

  // ─── The board's display order ─────────────────────────
  // The shuffle — purely visual, touches nothing else.

  // Local visual shuffle of the outer letters — a `shuffleSeed` counter drives a memo
  // (avoids storing the order in state + a sync effect). Keyed on the outer-letters
  // STRING (not the game object — a realtime refetch returns a fresh object even when
  // the letters didn't change, which would re-shuffle on every submit).
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const outerShuffled = useMemo(() => {
    if (!outerLetters) return []
    void shuffleSeed
    return shuffled(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])

  // ⌥Z shuffles — a fresh visual scan of the SAME letters, never a move. Bound
  // HERE rather than in the PlayArea because this column owns the display order,
  // and plainly active: shuffling writes nothing and reaches nobody else, so the
  // post-game fidget is deliberate — the round pill below is this same binding.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: () => setShuffleSeed((s) => s + 1),
  })

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the rank ladder + score/words, above the hive. A fixed-height block —
          the hive's `--avail-h` already has it subtracted, so the board shrinks
          by exactly this much and the page still doesn't scroll. */}
      <MobileStatusBar>
        <div className={bee.mobileStatus}>
          <RankBar score={foundWordsScore} total={requiredWordsScore} targetIdx={targetRankIdx} />
          <Stats
            foundWordsScore={foundWordsScore}
            requiredWordsScore={requiredWordsScore}
            foundWordsCount={foundWordsCount}
            requiredWordsCount={requiredWordsCount}
          />
        </div>
      </MobileStatusBar>
      <Letters
        shakeNonce={shakeNonce}
        answered={answered?.value ?? null}
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={handleLetterClick}
        usedLetters={usedLetters}
        // Shuffle floats over the hive's top-right — a fresh visual scan of the
        // SAME board, not a turn action. Always clickable, even when locked (a
        // harmless rearrange). Passed into Letters so it anchors to the visual
        // hive, not the column.
        floatingControl={
          <ShuffleButton
            action={actShuffle}
            tooltip="Shuffle outer letters"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot — the shared <WordEntryArea> (icon-only Delete + the WordEntryInput
          + icon-only Submit + the capture keyboard).
          The WordEntryInput renders the per-character illegal-letter dim via <TypedWord>.
          While the slot holds a message, WordEntryArea draws it in place of the
          controls (same slot, no reflow) — the verdict, "you're out", a word
          result, whichever ranks highest. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={word}
            onChange={setWord}
            onSubmit={submit}
            placeholder="Type or click letters"
            disabled={entryClosed}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={word} allowedLetters={allowedLetters} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
