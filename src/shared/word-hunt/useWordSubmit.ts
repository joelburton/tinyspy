// cs-unmet

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { showFaultModal } from '@/common/faults/faultStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'

/**
 * The shared **type-a-word-and-submit** engine for the two word-list games
 * (boggle + spellingbee). Both ship their full legal word list
 * (required ∪ bonus) to the FE, so both do the *same* thing on submit: validate
 * the typed word against that list, and — if it's good — show instant own-move
 * feedback and fire a trusting-commit RPC in the background. The only per-game
 * bits are the list lookup, the RPC, the reject-reason wording, and the success
 * label; everything structural (dedup, the optimistic in-flight guard, the
 * feedback plumbing, last-word recall) lives here once.
 *
 * Why this exists as one hook: boggle previously hand-rolled an optimistic
 * required-word path with no in-flight guard and no `.catch`, so a fast re-submit
 * of the same word (before the realtime `found_words` row lands) could double-fire
 * `submit_word` and surface a raw unique-violation (code-review §1.4). Concentrating
 * the guard here fixes that class of bug by construction and keeps spellingbee from
 * ever growing it — the same "one correct implementation kills the duplicated bug"
 * move as `usePeerFeedback`.
 *
 * **Optimistic, never blocking.** Because the FE already knows the full legal
 * list, a valid word needs no server round-trip to *confirm* — we show `+points`
 * immediately and commit in the background. So there is no busy/disabled state:
 * the player can keep typing the next word while the last one commits. Dedup
 * spans `foundWords` (the committed rows from realtime) **plus** a synchronous
 * `pendingRef` of words accepted-but-not-yet-landed, which closes the realtime-lag
 * window that would otherwise allow a double count.
 *
 * It owns `word`/`lastWord` state and shows every own-move result into the
 * game's local feedback slot, which the PlayArea makes (`useFeedbackSlot`) and
 * hands in — the slot stays the host's, since a game's End / Concede show into
 * it too. It does NOT own `useCaptureKeys`; that lives inside the shared
 * `<EntryRow>`, which draws the same slot.
 */

/** One entry of a game's shipped legal list. `word` is the canonical lowercase
 *  form (matches the DB rows + boggle's board string); `points` and the flags
 *  come straight off the shipped data, so the FE computes nothing. `isPangram`
 *  is spellingbee-only (boggle has no pangram concept) and drives that game's
 *  own success wording. */
export type WordEntry = {
  word: string
  points: number
  isBonus: boolean
  isPangram?: boolean
}

export type WordSubmitConfig = {
  mode: 'coop' | 'compete'
  userId: string
  /** True once the game is over — submit becomes a no-op. */
  isTerminal: boolean
  minWordLength: number
  /** The game's below-board slot: every result this hook produces is shown here. */
  localFeedbackSlot: FeedbackSlot
  /** Committed rows (from `useGame`), the dedup source. Mode-aware: coop dedups
   *  across all players (one shared find list); compete dedups per-player. */
  foundWords: ReadonlyArray<{ word: string; user_id: string }>
  /** O(1) membership over the game's legal list, keyed by lowercase word. Returns
   *  the matched entry (points + flags) or `null` for a non-legal word. */
  lookup: (word: string) => WordEntry | null
  /**
   * The trusting-commit RPC, fired in the background.
   *
   * **`null` means the word LANDED; a `NotOkEnvelope` means it did not.** The game owns
   * the branch chain over its own answers (they are per-game — `pangram` in one,
   * `dealt` in another — so a shared hook could not read them), and hands back
   * only the fact this hook is entitled to: whether the optimistic pill it just
   * showed is still true.
   *
   * Every refusal the four games can give is a REFUSAL — a race or a fault —
   * because none of them records the word. That is what lets one envelope carry
   * the whole answer here.
   */
  commit: (entry: WordEntry) => Promise<NotOkEnvelope | null>
  /** Why did `lookup` miss? Returns just the lowercase *reason* — the hook wraps
   *  it in the shared `WORD — reason` line. Per-game vocabulary: boggle "not on
   *  board" (untraceable) vs "not a word"; spellingbee "bad letters" / "missing
   *  center letter" / "not a word". `word` is the normalized lowercase. */
  explainReject: (word: string) => string
  /**
   * Optional: also RECORD the rejection, don't just show it.
   *
   * Omitted (spellingbee / wordwheel / boggle) → a rejected word never leaves
   * the client, which is right for a parallel word-search: "whose non-word was
   * that" is a question nobody asks, and the log would be noise.
   *
   * Supplied (wordiply) → the rejection is a TURN. It goes in the shared log so
   * peers can see what's already been tried, and — for a structural reject —
   * so it can cost the caller their go. See docs/games/wordiply.md.
   *
   * Fire-and-forget: the pill is already on screen and says the same thing, so
   * a failed write must not change what the player sees. NOT called for an
   * already-found word — that row is in the log by definition, and re-logging
   * it is exactly what the reminder exists to prevent.
   */
  recordReject?: (word: string, reason: 'too_short' | 'not_legal') => void

  /**
   * What the engine decided, for a surface that shows it somewhere other than
   * the pill — wordiply marks the guess row the word was typed into.
   *
   * Presentational and nothing else: unlike `recordReject` it fires for EVERY
   * answer including the already-found one, because a board showing an answer
   * has to show that one too; and it writes nothing anywhere, so a game is free
   * to color a reason differently from the pill (wordiply's dictionary miss is
   * a `warning` there and a `lost` in the pill, which is a disagreement worth
   * fixing but not this callback's business).
   */
  onAnswer?: (
    word: string,
    answer: 'accepted' | 'too_short' | 'not_legal' | 'already_found',
  ) => void

  /**
   * What each refusal MEANS in this game, as an outcome. Required, and there is
   * deliberately no default: what a refusal is worth is the game's judgment, not
   * this engine's.
   *
   * The two readings in the roster are opposite and both right. boggle,
   * spellingbee and wordwheel treat a word the list does not know as a wrong
   * move — `lost`. wordiply encourages long, strange guesses, so the same event
   * is a `warning` there: making a bad word feel like an error would be mean in
   * a game that wants you to try one.
   *
   * It takes the word as well as the answer because a game's single `not_legal`
   * may cover several things: wordiply's list misses both "not a word" and "does
   * not contain the stem", and only the second is a rule broken.
   *
   * Whatever it returns is what the PILL says — so a game showing the answer
   * anywhere else reads this same function for those surfaces too, and the two
   * cannot drift.
   */
  outcomeFor: (word: string, answer: 'too_short' | 'already_found' | 'not_legal') => Outcome
  /**
   * Optional: say nothing when a word is ACCEPTED.
   *
   * Omitted (spellingbee / wordwheel / boggle) → the accepted word shows as a
   * result, `CAT +3`, the one place the player learns it landed.
   *
   * Supplied (wordiply) → the board row already shows the word and its
   * length the moment it is accepted, so a result would say it twice; only
   * the rejections show.
   */
  hideAccepted?: boolean
}

export type WordSubmitApi = {
  word: string
  /** The raw state setter — accepts a value or an updater, so a game can append
   *  a clicked letter (`setWord((w) => w + 'A')`) as well as replace. */
  setWord: Dispatch<SetStateAction<string>>
  /** The last word submitted (accepted or rejected), for `<EntryRow recall>` —
   *  ArrowUp brings it back to fix a typo. */
  lastWord: string
  /** Fire a submit of the current `word`. */
  submit: () => void
}

/**
 * A word as it appears anywhere in feedback: caps, with a trailing ` •` bonus
 * dot when it's a bonus find. Single-sources that convention so it can't drift
 * between the local own-move `line()` (below) and the per-game peer-narration
 * pills (spellingbee/boggle coop headers), which also lead with `{name} found
 * {WORD}` and must show the same dot.
 */
export const wordWithBonusDot = (word: string, isBonus = false): string =>
  `${word.toUpperCase()}${isBonus ? ' •' : ''}`

/**
 * The one own-move line format, shared by both games so their feedback reads
 * identically: `WORD — body`, always leading with the word in caps. A **bonus**
 * find gets the ` •` dot right after the word (not at the end of the line):
 *   accept       → `GOOD — +2`      (bonus: `GOOD • — +2`)
 *   pangram      → `ABCDEFG — pangram +17`
 *   too short    → `AB — too short`
 *   already found→ `CAT — already found`
 *   reject       → `ZZZ — not on board`   (the reason comes from explainReject)
 */
const line = (word: string, body: string, isBonus = false): string =>
  `${wordWithBonusDot(word, isBonus)} — ${body}`

export function useWordSubmit(cfg: WordSubmitConfig): WordSubmitApi {
  const [word, setWordState] = useState('')
  const [lastWord, setLastWord] = useState('')

  // Latest config held in a ref so `submit` can stay a STABLE callback (no
  // deps) without listing every cfg field. Synced in a passive effect — never
  // written during render (react-hooks/refs forbids that). A one-render lag
  // here is harmless: the only race-sensitive cfg use is the `foundWords` dedup,
  // which `pendingRef` already closes synchronously.
  const cfgRef = useRef(cfg)
  useEffect(function syncConfigRef() {
    cfgRef.current = cfg
  })

  // The typed word ALSO shadowed in a ref, so stable `submit` reads the latest
  // value. Unlike `cfgRef` this ref is kept in sync **synchronously** — written
  // inside `setWord` (an event-handler call, NOT render, so it's lint-legal) so it
  // never lags a keystroke. This is what makes **tap-to-submit** correct: a player
  // builds a word by tapping (board tiles in boggle, hive letters in spellingbee —
  // each an `onChange`/`setWord`), then taps the Submit button. A passive-effect
  // sync updates only after paint, so a fast Submit tap in the commit→paint gap
  // would read a one-tap-stale word ("tapped 3 tiles, submitted 2 letters"); a
  // synchronous write closes that window, and the ref keeps `submit` stable.
  const wordRef = useRef(word)

  // Words accepted this session but whose `found_words` row may not have arrived
  // via realtime yet — dedup against these too, so a fast re-submit during the
  // propagation lag doesn't double-commit. A word leaves the set only if its
  // commit fails (so a retry is allowed); on success the realtime row supersedes it.
  const pendingRef = useRef<Set<string>>(new Set())

  // The exposed setter updates the ref eagerly (event time, not render) so
  // `wordRef` and the `word` state move together. The updater form resolves
  // against the ref's current value, which the induction above keeps === state.
  const setWord = useCallback<Dispatch<SetStateAction<string>>>((v) => {
    wordRef.current = typeof v === 'function' ? v(wordRef.current) : v
    setWordState(v)
  }, [])

  const submit = useCallback(() => {
    const c = cfgRef.current
    const slot = c.localFeedbackSlot
    const raw = wordRef.current
    const w = raw.trim().toLowerCase()
    if (w === '' || c.isTerminal) return

    // Consume the input up front: record it for recall, clear the box (so the pill
    // can reclaim the slot), and blank the ref synchronously — a same-tick second
    // submit then sees an empty word and bails before it can double-fire.
    setLastWord(raw)
    setWordState('')
    wordRef.current = ''

    if (w.length < c.minWordLength) {
      slot.show(FeedbackMessage.result(c.outcomeFor(w, 'too_short'), line(w, 'too short')))
      c.onAnswer?.(w, 'too_short')
      c.recordReject?.(w, 'too_short')
      return
    }

    // Look the word up FIRST so the bonus dot can ride any WORD-prefixed line —
    // including the already-found one (a duplicate is, by definition, a legal word
    // that was accepted before, so its `isBonus` is known).
    const entry = c.lookup(w)

    const alreadyFound =
      pendingRef.current.has(w) ||
      c.foundWords.some(
        (f) => f.word === w && (c.mode === 'coop' || f.user_id === c.userId),
      )
    if (alreadyFound) {
      slot.show(
        FeedbackMessage.result(
          c.outcomeFor(w, 'already_found'),
          line(w, 'already found', entry?.isBonus),
        ),
      )
      c.onAnswer?.(w, 'already_found')
      return
    }

    if (!entry) {
      slot.show(
        FeedbackMessage.result(c.outcomeFor(w, 'not_legal'), line(w, c.explainReject(w))),
      )
      c.onAnswer?.(w, 'not_legal')
      // One reason for both misses the lookup can't tell apart (not in the
      // list vs doesn't fit the board); the SERVER re-derives which, since it
      // owns the structural rules and this hook doesn't know them.
      c.recordReject?.(w, 'not_legal')
      return
    }

    // Accept optimistically: reserve the word, show it, commit in the background.
    // Body is universal — `+N`, or `pangram +N` when the entry is a pangram (a
    // spellingbee-only flag; boggle entries never set it). The bonus dot rides
    // right after the word.
    pendingRef.current.add(w)
    c.onAnswer?.(w, 'accepted')
    const body = `${entry.isPangram ? 'pangram ' : ''}+${entry.points}`
    if (!c.hideAccepted) slot.show(FeedbackMessage.result('won', line(w, body, entry.isBonus)))

    // The commit lost: free the word so it can be retried, and put the
    // server's own sentence up — a notOk, which ranks over the optimistic "+N"
    // and needs its × (docs/ui.md → Feedback pill). A fault's modal is raised
    // centrally by `runRpc` rather than by anything here.
    c.commit(entry).then(
      (failure) => {
        if (failure === null) return // it landed; the optimistic pill stands
        pendingRef.current.delete(w) // free it so the player can retry
        // The SERVER's sentence, verbatim — never re-wrapped in `line()`. The
        // duplicate's message is already the whole line (`CAT — already
        // found`), composed server-side precisely so the two routes to that
        // rejection read identically; wrapping it again would double the word.
        slot.show(FeedbackMessage.notOk(failure))
      },
      // `runRpc` resolves for every answer it can classify, so a REJECTION here
      // is ours — a commit that threw rather than answering.
      () => showFaultModal({ text: 'BUG: a word commit threw instead of answering' }),
    )
  }, [])

  return { word, setWord, lastWord, submit }
}
