// cs-blessed-spellingbee

import { useCallback, useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
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
import { useFoundWordSubmit } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import { answerMessage, answerOf } from '../lib/answer'
import { Board } from './Board'
import { TypedWord } from './TypedWord'
import shared from '@/common/game-page/playArea.module.css'
import surface from '@/shared/found-words/foundWordsPlayArea.module.css'
import bee from '@/shared/bee-games/beeBoard.module.css'
import type { GGameData } from '../types'

/** What `spellingbee.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

/**
 * spellingbee's board column — the honeycomb `<Board>`, a floating Shuffle
 * over its top-right, and the below-board region: the shared `<WordEntryArea>`,
 * whose typed word is drawn through `<TypedWord>` so a letter off the hive dims.
 *
 * It owns the **move**: the word engine (`useFoundWordSubmit`), the
 * `submit_word` commit, what each answer shows, and the hive's answer to a
 * refused word (the shake and the tile marks). It also owns the letter
 * click that appends to the word. See docs/playarea.md.
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

  // The board's seven letters, lower-cased — the typed word's illegal-letter
  // dim, and why a word missed.
  const allowedLetters = useMemo(() => {
    const s = new Set<string>()
    for (const ch of outerLetters) s.add(ch.toLowerCase())
    s.add(centerLetter.toLowerCase())
    return s
  }, [outerLetters, centerLetter])

  // The board's words by word: a typed word is judged and scored against them
  // here, required and bonus alike.
  const wordsByWord = useMemo(
    () => new Map(gd.puzzle.words.map((w) => [w.word, w])),
    [gd.puzzle.words],
  )

  // The letters the refused word used: they wear its answer and shake. Captured
  // here because the entry has already cleared by the time the answer shows.
  const [refused, showRefused] = useMark<{ letters: Set<string>; outcome: Outcome }>(WORD_ANSWER_MS)

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
      // word also answers ON the board: the tiles the word used shake and take
      // the same outcome, so the two cannot disagree.
      onAnswer: (report) => {
        const { outcome, text } = answerMessage(answerOf(report, { letters: allowedLetters, center }))
        localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
        if (report.answer === 'accepted') return
        showRefused({ letters: new Set(report.word.toUpperCase()), outcome })
      },
    })

  // ─── The pending guess ─────────────────────────────────
  // The typed word is the engine's, above; what this column reads off it, and
  // the letter click that adds to it, sit here.

  // The tiles the typed word is using. A Set of its letters is the whole of
  // it: a board letter can be typed more than once and there is nothing to
  // count. Empty once the board is inert, so a word left half-typed when the
  // game ended, or when I conceded, drops its marks.
  const usedLetters = useMemo(
    () => new Set(isInteractive ? word.toUpperCase() : ''),
    [isInteractive, word],
  )

  // A click is my next action, so it dismisses a gesture-cleared result.
  const handleLetterClick = useCallback(
    (letter: string) => {
      localFeedbackSlot.dismiss()
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

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
        usedLetters={usedLetters}
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
            disabled={!isInteractive}
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
