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
 * spellingbee's board column — the honeycomb `<Letters>`, a floating Shuffle
 * over its top-right, and the below-board region: the shared `<WordEntryArea>`,
 * whose typed word is drawn through `<TypedWord>` so a letter off the hive dims.
 *
 * It owns the **move**: the word engine (`useFoundWordSubmit`), the
 * `submit_word` commit, what each answer shows, and the hive's answer to a
 * refused word (the shake and the hex marks). It also owns the local
 * outer-letter shuffle — a per-player, view-only rearrange — and the letter
 * click that appends to the word.
 *
 * Everything else comes down: the board's letters, `readOnly`, the lists a
 * word is judged against, and the feedback slot, which is the PlayArea's —
 * its standing conditions and InfoCol's End / Concede show into it too. See
 * docs/playarea.md.
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
  readOnly,
  foundWords,
  requiredWords,
  bonusWords,
  localFeedbackSlot,
}: {
  // ── Mobile-only status block ──
  // The four figures behind the RankBar + Stats unit the info column renders,
  // mirrored above the board on a phone (`<MobileStatusBar>`).
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number
  // The goal rank, when the game has one — marked on the mobile RankBar.
  targetRankIdx: number | null

  // ── Board to render ──
  // The board's outer letters as stored; the shuffle below rearranges a copy.
  outerLetters: string
  centerLetter: string

  // ── The move ──
  gameId: string
  mode: 'coop' | 'compete'
  selfId: string
  // No more words from me: the game is over, or I conceded a race the others
  // play on. The engine refuses, the entry closes and the hive goes inert, all
  // on this one flag (docs/playarea.md).
  readOnly: boolean
  // The committed rows, the engine's dedup source (mode-aware: the team's in
  // coop, mine in compete).
  foundWords: FoundWordRow[]
  // Both shipped lists: a word is judged and scored against them here.
  requiredWords: SpellingbeeGame['requiredWords']
  bonusWords: SpellingbeeGame['bonusWords']
  // PlayArea's below-board slot — every answer shows into it, and the entry
  // row draws it in place of the controls.
  localFeedbackSlot: FeedbackSlot
}) {
  // ─── Committing a guess ────────────────────────────────
  // The shared engine owns the typed word, the dedup and the optimistic commit;
  // this game supplies the lookup, the RPC and what it shows for each answer.

  // The hive's seven letters, lower-cased — the typed word's illegal-letter
  // dim, and why a word missed.
  const allowedLetters = useMemo(() => {
    const s = new Set<string>()
    for (const ch of outerLetters) s.add(ch.toLowerCase())
    s.add(centerLetter.toLowerCase())
    return s
  }, [outerLetters, centerLetter])

  // Both lists ship, so a word is judged and scored here: required ∪ bonus,
  // by word.
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

  // A refused word shakes the WHOLE hive. A bumping nonce, because the hive is
  // always mounted: it keys the hive, so each refusal remounts it and the
  // animation plays again — a CSS animation restarts on a remount, not on a
  // state change under it (`.verdictShake`).
  const [shakeNonce, setShakeNonce] = useState(0)

  // The letters the refused word used, wearing its answer. Captured here
  // because the entry has already cleared by the time the answer shows.
  const [answered, showAnswer] = useMark<{ letters: Set<string>; outcome: Outcome }>(WORD_ANSWER_MS)

  const center = centerLetter.toLowerCase()
  const { word, setWord, lastWord, submit } =
    useFoundWordSubmit({
      mode,
      userId: selfId,
      isTerminal: readOnly,
      minWordLength: 4,
      localFeedbackSlot,
      foundWords,
      lookup: (w) => legalIndex.get(w) ?? null,
      // `null` says the row landed (`commit` in `useFoundWordSubmit`). None of
      // the four ok answers changes what the optimistic pill already says, and
      // the win arrives over realtime like every other terminal.
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
      // word also answers ON the board: the hive shakes, and the hexes the word
      // used take the same outcome, so the two cannot disagree.
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

  // The hexes the typed word is using. A Set of its letters is the whole of
  // it: a hive letter can be typed more than once and there is nothing to
  // count. Empty once the board is read-only, so a word left half-typed when
  // the game ended, or when I conceded, drops its marks.
  const usedLetters = useMemo(
    () => new Set(readOnly ? '' : word.toUpperCase()),
    [readOnly, word],
  )

  // A click is my next action, so it dismisses a gesture-cleared result.
  const handleLetterClick = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss()
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

  // ─── The board's display order ─────────────────────────
  // The shuffle — purely visual, touches nothing else.

  // A counter drives a memo, rather than an order kept in state plus a sync
  // effect. Keyed on the outer-letters STRING, not the game object: a realtime
  // refetch returns a fresh object even when the letters did not change, which
  // would re-shuffle on every submit.
  const [shuffleSeed, setShuffleSeed] = useState(0)
  const outerShuffled = useMemo(() => {
    if (!outerLetters) return []
    void shuffleSeed
    return shuffled(Array.from(outerLetters))
  }, [outerLetters, shuffleSeed])

  // A fresh visual scan of the SAME letters, never a move. The floating button
  // below is this same binding.
  const actShuffle = useBoundAction('act-shuffle', {
    describe: () => 'active',
    run: () => setShuffleSeed((s) => s + 1),
  })

  // ─── Render ────────────────────────────────────────────
  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* Mobile only (`<MobileStatusBar>` is CSS-hidden on desktop): the rank
          ladder and the figures, above the hive. A fixed-height block, already
          subtracted from the hive's `--avail-h`. */}
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
        onLetterClick={readOnly ? undefined : handleLetterClick}
        usedLetters={usedLetters}
        // Passed into Letters so it anchors to the visual hive rather than
        // the column (`.floatingShuffle`).
        floatingControl={
          <ShuffleButton
            action={actShuffle}
            tooltip="Shuffle outer letters"
            className={shared.floatingShuffle}
          />
        }
      />
      {/* The below-board slot: `<WordEntryArea>` draws the controls, or the
          slot's message in their place — the same slot, so nothing reflows. */}
      <div className={surface.belowBoard}>
        <div className={shared.moveAreaOrLocalFeedback}>
          <WordEntryArea
            value={word}
            onChange={setWord}
            onSubmit={submit}
            placeholder="Type or click letters"
            disabled={readOnly}
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
