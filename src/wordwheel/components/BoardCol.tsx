// cs-met-wordwheel

import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useFoundWordSubmit, type LegalWord } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import type { FoundWordRow, WordwheelGame } from '../hooks/useGame'
import { answerMessage, answerOf } from '../lib/answer'
import { ShuffleButton } from '@/common/buttons/ShuffleButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { trimClaims, type Claim } from '../lib/spend'
import { wordFitsWheel } from '../lib/tiles'
import { Wheel } from './Wheel'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'

/** What `wordwheel.submit_word` puts in `data`. All four mean the row landed:
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
 * wordwheel's board column — the `<Wheel>`, a floating Shuffle over its
 * top-right, and the below-board region: the shared `<WordEntryArea>`, whose
 * typed word is drawn through `<TypedWord>` so a letter the wheel's tiles
 * cannot cover dims.
 *
 * It owns the **move**: the word engine (`useFoundWordSubmit`), the
 * `submit_word` commit, what each answer shows, and the wheel's answer to a
 * refused word (the tiles it used shake and take the answer). It also owns the
 * local outer-letter shuffle — a per-player, view-only rearrange — and the
 * letter click that appends to the word and claims the tile it landed on.
 *
 * Everything else comes down: the wheel's letters, `readOnly`, the lists a
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
  // play on. The engine refuses, the entry closes and the wheel goes inert, all
  // on this one flag (docs/playarea.md).
  readOnly: boolean
  // The committed rows, the engine's dedup source (mode-aware: the team's in
  // coop, mine in compete).
  foundWords: FoundWordRow[]
  // Both shipped lists: a word is judged and scored against them here.
  requiredWords: WordwheelGame['requiredWords']
  bonusWords: WordwheelGame['bonusWords']
  // PlayArea's below-board slot — every answer shows into it, and the entry
  // row draws it in place of the controls.
  localFeedbackSlot: FeedbackSlot
}) {
  // ─── Committing a guess ────────────────────────────────
  // The shared engine owns the typed word, the dedup and the optimistic commit;
  // this game supplies the lookup, the RPC and what it shows for each answer.

  // The wheel's tile counts, lower-cased — the typed word's dim and the submit
  // gate. The wheel is a MULTISET — a letter may sit on two tiles — so a word
  // may use a letter as many times as it has tiles: a COUNT, not membership.
  const letterCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of outerLetters + centerLetter) {
      const lower = ch.toLowerCase()
      m.set(lower, (m.get(lower) ?? 0) + 1)
    }
    return m
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

  // A refused word's tiles shake and wear its answer for a beat — as many of
  // each letter as the word used, since a letter can sit on two tiles and only
  // the ones the word would have spent should answer (the Wheel picks them).
  const [refused, showRefused] = useMark<{ counts: Map<string, number>; outcome: Outcome }>(WORD_ANSWER_MS)

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
      // word also answers ON the board: the tiles it used shake and take the
      // same outcome, so the two cannot disagree.
      onAnswer: (report) => {
        const { outcome, text } = answerMessage(answerOf(report, center))
        localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
        if (report.answer === 'accepted') return
        const counts = new Map<string, number>()
        for (const ch of report.word.toLowerCase()) counts.set(ch, (counts.get(ch) ?? 0) + 1)
        showRefused({ counts, outcome })
      },
    })

  // ─── The pending guess ─────────────────────────────────
  // The typed word is the engine's, above; what this column reads off it, and
  // the letter click that adds to it, sit here.

  // WHICH tile each use of a letter spends. A click claims the tile it landed
  // on; everything else falls to the render order (`lib/spend.ts`).
  const [claims, setClaims] = useState<Claim[]>([])

  // A click is my next action, so it dismisses a gesture-cleared result.
  const handleLetterClick = useCallback(
    (letter: string, ordinal: number) => {
      localFeedbackSlot.dismiss()
      setClaims((c) => [...c, { letter, ordinal }])
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

  // Every OTHER way the word changes — a keystroke, a Backspace, the recall,
  // the box clearing on submit — can only take claims away, never make one:
  // the player named no tile. Trimming against the new word is the whole of
  // it, and an empty box drops the lot.
  const handleChange = useCallback(
    (next: SetStateAction<string>) => {
      setClaims((c) => trimClaims(c, typeof next === 'string' ? next : next(word)))
      setWord(next)
    },
    [setWord, word],
  )

  // Per-letter counts of the typed word, lower-cased: each use SPENDS one tile
  // of its letter, and `lib/spend.ts` says which. Empty once the board is
  // read-only, so a word left half-typed when the game ended, or when I
  // conceded, drops its marks.
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (readOnly) return m
    for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [readOnly, word])

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
          ladder and the figures, above the wheel. A fixed-height block, already
          subtracted from the wheel's `--avail-h`. */}
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
      <Wheel
        refused={refused}
        outerLetters={outerShuffled}
        centerLetter={centerLetter}
        onLetterClick={readOnly ? undefined : handleLetterClick}
        claims={claims}
        typedCounts={typedCounts}
        // Passed into Wheel so it anchors to the visual wheel rather than the
        // column (`.floatingShuffle`).
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
            onChange={handleChange}
            onSubmit={submit}
            placeholder="Type or click letters"
            disabled={readOnly}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            // Submit and Enter are inert while the word cannot be spelled from
            // the wheel's tiles — the same characters `<TypedWord>` dims. A word
            // that fits but misses the center, or is not in the list, still
            // submits and gets its answer.
            submitDisabled={!wordFitsWheel(word, letterCounts)}
            localFeedbackSlot={localFeedbackSlot}
          >
            <TypedWord word={word} letterCounts={letterCounts} />
          </WordEntryArea>
        </div>
      </div>
    </div>
  )
}
