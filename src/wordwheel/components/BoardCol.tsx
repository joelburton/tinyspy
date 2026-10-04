// cs-blessed-wordwheel

import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useFoundWordSubmit } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import { answerMessage, answerOf } from '../lib/answer'
import { WordEntryArea } from '@/common/word-entry/WordEntryArea'
import { asciiLetters } from '@/common/keyboard/useCaptureKeys'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { trimClaims, type Claim } from '../lib/spend'
import { wordFitsWheel } from '../lib/tiles'
import { Board } from './Board'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'
import type { GGameData } from '../types'

/** What `wordwheel.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

/**
 * wordwheel's board column — the `<Board>`, a floating Shuffle over its
 * top-right, and the below-board region: the shared `<WordEntryArea>`, whose
 * typed word is drawn through `<TypedWord>` so a letter the wheel cannot spell
 * dims.
 *
 * It owns the **move**: the word engine (`useFoundWordSubmit`), the
 * `submit_word` commit, what each answer shows, and the wheel's answer to a
 * refused word (the shake and the tile marks). It also owns the letter click
 * that appends to the word, and the tile-spend bookkeeping a wheel needs and a
 * hive does not: a letter may sit on two tiles, so each use of a letter spends
 * ONE tile, and a click says which (`lib/spend.ts`). See docs/playarea.md.
 */
export function BoardCol({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  // PlayArea's below-board slot — every answer shows into it, and the entry
  // row draws it in place of the controls.
  localFeedbackSlot: FeedbackSlot
}) {
  // The board is mine to touch: the board and the entry take letters, and the
  // engine commits a word. False once the game is over, or I conceded a race
  // the others play on.
  const isInteractive = gd.me.onTurn

  const { centerLetter, outerLetters } = gd.puzzle

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

  // The board's words by word: a typed word is judged and scored against them
  // here, required and bonus alike.
  const wordsByWord = useMemo(
    () => new Map(gd.puzzle.words.map((w) => [w.word, w])),
    [gd.puzzle.words],
  )

  // A refused word's tiles shake and wear its answer for a beat — as many of
  // each letter as the word used, since a letter can sit on two tiles and only
  // the ones the word would have spent should answer. Its clicks ride along so
  // a clicked twin answers rather than its sibling (the Board picks them).
  const [refused, showRefused] =
    useMark<{ counts: Map<string, number>; claims: Claim[]; outcome: Outcome }>(WORD_ANSWER_MS)

  // WHICH tile each use of a letter spends. A click claims the tile it landed
  // on; everything else falls to the render order (`lib/spend.ts`).
  const [claims, setClaims] = useState<Claim[]>([])

  const center = centerLetter.toLowerCase()
  const { word, setWord, lastWord, submit } =
    useFoundWordSubmit({
      isMyTurn: isInteractive,
      minWordLength: 4,
      localFeedbackSlot,
      foundWords: gd.foundWords,
      lookup: (w) => wordsByWord.get(w) ?? null,
      // `null` says the row landed (`commit` in `useFoundWordSubmit`). None of
      // the four ok answers changes what the optimistic pill already says, and
      // the win arrives with the next blob like every other ending.
      commit: async (e) => {
        const res = await runRpc<SubmittedWord>(
          db.rpc('submit_word', {
            p_game_id: gd.id,
            p_word: e.word,
            p_points: e.points,
            p_is_pangram: e.pangram,
            p_is_bonus: e.bonus,
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
        // The word's clicks, kept for the refusal below before the box's are dropped.
        const wordClaims = claims
        // The engine has already emptied the box, without going through
        // `handleChange`, so the last word's clicks are dropped here.
        setClaims([])
        const { outcome, text } = answerMessage(answerOf(report, center))
        localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
        if (report.answer === 'accepted') return
        const counts = new Map<string, number>()
        for (const ch of report.word.toLowerCase()) counts.set(ch, (counts.get(ch) ?? 0) + 1)
        showRefused({ counts, claims: wordClaims, outcome })
      },
    })

  // ─── The pending guess ─────────────────────────────────
  // The typed word is the engine's, above; what this column reads off it, and
  // the letter click that adds to it, sit here.

  // A click is my next action, so it dismisses a gesture-cleared result.
  const handleLetterClick = useCallback(
    (letter: string, ordinal: number) => {
      localFeedbackSlot.dismiss()
      setClaims((c) => [...c, { letter, ordinal }])
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

  // A letter typed or Backspaced at the END of the word only takes claims away,
  // never makes one: the player named no tile. Anything else — the recall, the
  // clear — is a different word, and none of its letters was picked off the
  // board. A submit clears the box without coming through here, so `onAnswer`
  // drops the claims instead.
  const handleChange = useCallback(
    (next: SetStateAction<string>) => {
      const value = typeof next === 'string' ? next : next(word)
      const isEdit =
        (value.length === word.length + 1 && value.startsWith(word)) ||
        value === word.slice(0, -1)
      setClaims((c) => (isEdit ? trimClaims(c, value) : []))
      setWord(next)
    },
    [setWord, word],
  )

  // Per-letter counts of the typed word, lower-cased: each use SPENDS one tile
  // of its letter, and `lib/spend.ts` says which. Empty once the board is
  // inert, so a word left half-typed when the game ended, or when I conceded,
  // drops its marks.
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (!isInteractive) return m
    for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [isInteractive, word])

  // ─── Render ────────────────────────────────────────────
  const readout = gd.stateLineData
  return (
    <div className={cls(shared.boardCol, bee.boardCol)}>
      {/* Mobile only (`<MobileStatusBar>` is CSS-hidden on desktop): the rank
          ladder and the figures, above the board. A fixed-height block, already
          subtracted from the board's `--avail-h`. */}
      <MobileStatusBar>
        <div className={bee.mobileStatus}>
          <RankBar score={readout.foundWordsScore} total={readout.reqdWordsScore} targetIdx={readout.targetRankIdx} />
          <Stats
            foundWordsScore={readout.foundWordsScore}
            requiredWordsScore={readout.reqdWordsScore}
            foundWordsCount={readout.nFoundWords}
            requiredWordsCount={readout.nReqdWords}
          />
        </div>
      </MobileStatusBar>
      <Board
        refused={refused}
        outerLetters={outerLetters}
        centerLetter={centerLetter}
        isInteractive={isInteractive}
        onLetterClick={handleLetterClick}
        claims={claims}
        typedCounts={typedCounts}
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
            disabled={!isInteractive}
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
