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
 * top-right, and the below-board slot (the shared `<WordEntryArea>` — the typed-word input
 * + capture keyboard, whose `<WordEntryInput>` renders the per-character illegal-letter dim
 * via `<TypedWord>`).
 *
 * It owns the **move**: the word-entry engine (`useFoundWordSubmit` — the typed
 * word, the dedup, the `submit_word` commit), what each answer shows, and the
 * wheel's answer to a refused word (the tiles it used shake and take the
 * answer). It also owns the **local outer-letter shuffle** (a per-player
 * view-only rearrange — never persisted or shared) and a click on a letter
 * appending to the word. The local feedback slot every answer shows into stays
 * the PlayArea's — its standing conditions and InfoCol's End / Concede show into
 * it too — and comes down as a prop. See docs/playarea.md.
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
  /** No more words from me: the game is over, or I conceded a race the others
   *  play on. The board-only "visible but inert" flag (docs/playarea.md) — the
   *  engine refuses, the entry closes and the wheel goes inert, all on this one
   *  answer. */
  readOnly: boolean
  /** The committed rows, the engine's dedup source (mode-aware: the team's in
   *  coop, mine in compete). */
  foundWords: FoundWordRow[]
  /** Both shipped lists: a word is judged and scored against them here. */
  requiredWords: WordwheelGame['requiredWords']
  bonusWords: WordwheelGame['bonusWords']
  /** PlayArea's below-board slot — every answer shows into it, the entry row
   *  draws its top in place of the controls, and a letter click is the player's
   *  next action, so it dismisses a gesture-cleared result. */
  localFeedbackSlot: FeedbackSlot
}) {
  // ─── Committing a guess ────────────────────────────────
  // The shared engine owns the typed word, the dedup and the optimistic commit;
  // this game supplies the lookup, the RPC and what it shows for each answer.
  // First, because the engine owns the pending word the sections below read.

  // The wheel's tile counts — the illegal-letter dim and tile spending. The
  // wheel is a MULTISET — the same letter may sit on two tiles — so the
  // "can I type this letter?" question is a per-letter tile COUNT, not set
  // membership: a word may use a letter as many times as it has tiles.
  const letterCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const ch of outerLetters + centerLetter) {
      const lower = ch.toLowerCase()
      m.set(lower, (m.get(lower) ?? 0) + 1)
    }
    return m
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
      // Every answer shows in the pill, in `lib/answer.ts`'s words. Any answer
      // but an accept is also a move that didn't win: the tiles the word used
      // shake and take the same outcome, so the two cannot disagree.
      // The actor's alone: a peer is never told about somebody else's miss.
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
  // on; everything else falls to the render order (see lib/spend.ts). The claims
  // live here because this column owns both halves of a change — the click that
  // makes one and the typing that can take it away.
  const [claims, setClaims] = useState<Claim[]>([])

  const handleLetterClick = useCallback(
    (letter: string, ordinal: number) => {
      localFeedbackSlot.dismiss()
      setClaims((c) => [...c, { letter, ordinal }])
      setWord((prev) => prev + letter.toUpperCase())
    },
    [localFeedbackSlot, setWord],
  )

  // Every OTHER way the word changes — a keystroke, a Backspace, the ArrowUp
  // recall, the box clearing on submit — can only take claims away, never make
  // one: the player named no tile. Trimming against the new word is the whole of
  // it, and an empty box drops the lot.
  const handleChange = useCallback(
    (next: SetStateAction<string>) => {
      setClaims((c) => trimClaims(c, typeof next === 'string' ? next : next(word)))
      setWord(next)
    },
    [setWord, word],
  )

  // Per-letter counts of the typed word (lower-cased). Each tile is SPENT per
  // use, so the wheel dims one same-letter tile per occurrence typed (the
  // center first — see Wheel's spend order). None once the board is read-only:
  // a word left half-typed when the game ended, or when I conceded, is no
  // longer a move, so its marks go with it.
  const typedCounts = useMemo(() => {
    const m = new Map<string, number>()
    if (readOnly) return m
    for (const ch of word.toLowerCase()) m.set(ch, (m.get(ch) ?? 0) + 1)
    return m
  }, [readOnly, word])

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
          the rank bar + stat grid, above the board. A small BLOCK rather than the
          bar's one-line default, so PlayArea.module.css raises
          `--mobile-status-height` AND takes it out of `--avail-h` — the wheel
          sizes itself from that number, so leaving it alone would size a board
          that no longer fits (the hard no-scroll invariant). */}
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
        // Shuffle floats over the wheel's top-right — a fresh visual scan of the
        // SAME board, not a turn action. Always clickable, even when locked (a
        // harmless rearrange). Passed into Wheel so it anchors to the visual
        // wheel, not the column.
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
            onChange={handleChange}
            onSubmit={submit}
            placeholder="Type or click letters"
            disabled={readOnly}
            onAnyKey={localFeedbackSlot.dismiss}
            charFor={asciiLetters('upper')}
            recall={lastWord}
            // Veto submit when the typed word can't be spelled from the wheel's
            // tiles (an off-wheel letter, or a letter used more times than it has
            // tiles — the same characters <TypedWord> dims). Editing stays live;
            // only Submit + Enter are inert, so "FOOD" on a wheel without F/O
            // can't submit and read as "not a word". A word that DOES fit but is
            // missing the center / isn't in the list stays submittable — that
            // reject carries a genuinely useful reason.
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
