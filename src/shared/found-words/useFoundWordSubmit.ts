// cs-met-found-words

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { showFaultModal } from '@/common/faults/faultStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'

/**
 * The shared **type-a-word-and-submit** engine, for a game that ships its legal
 * list to the client.
 *
 * What it models is narrower than hunting words: **a typed word, a shipped
 * legal list to look it up in, and a growing set of found words to dedup
 * against.** A game with the list in hand does the same thing on every submit —
 * validate the typed word against it, and, if it's good, show instant own-move
 * feedback and fire a trusting-commit RPC in the background. The per-game bits
 * are the list lookup, the RPC, the reject-reason wording and the success
 * label; everything structural (dedup, the optimistic in-flight guard, the
 * feedback plumbing, last-word recall) lives here once. Wordiply is the caller
 * with no `found_words` table at all — its guesses are the found set — which is
 * the reason the model above is written in terms of the two lists rather than
 * the schema.
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
 * `<WordEntryArea>`, which draws the same slot.
 */

/** One entry of a game's shipped legal list. `word` is the canonical lowercase
 *  form (matches the DB rows + boggle's board string); `points` and the flags
 *  come straight off the shipped data, so the FE computes nothing. `isPangram`
 *  is optional: only some games in the family have the concept, and it drives
 *  the success wording where they do. */
export type LegalWord = {
  word: string
  points: number
  isBonus: boolean
  isPangram?: boolean
}

/** What the engine decided about a submitted word — the closed set every
 *  caller's answer table is keyed by, so a game cannot miss one. A game that
 *  speaks a wider vocabulary than this maps into its own (wordiply's
 *  `answerFor` splits `not_legal` in two). */
export type WordSubmitAnswer = 'accepted' | 'too_short' | 'not_legal' | 'already_found'

/** Everything the engine cannot know: the game's board rules, its RPC, its
 *  words for what happened, and the slot to say them in. */
export type FoundWordSubmitConfig = {
  mode: 'coop' | 'compete'
  userId: string
  // True once the game is over — submit becomes a no-op.
  isTerminal: boolean
  minWordLength: number
  // The game's below-board slot: every result this hook produces is shown here.
  localFeedbackSlot: FeedbackSlot
  // Committed rows (from `useGame`), the dedup source. Mode-aware: coop dedups
  // across all players (one shared find list); compete dedups per-player.
  foundWords: ReadonlyArray<{ word: string; user_id: string }>
  // O(1) membership over the game's legal list, keyed by lowercase word. Returns
  // the matched entry (points + flags) or `null` for a non-legal word.
  lookup: (word: string) => LegalWord | null
  // The trusting-commit RPC, fired in the background. **`null` means the word
  // LANDED; a `NotOkEnvelope` means it did not** — the game reads its own
  // answers (`pangram` in one, `dealt` in another, which a shared hook could
  // not) and hands back only whether the optimistic pill is still true.
  commit: (entry: LegalWord) => Promise<NotOkEnvelope | null>
  // Why did `lookup` miss? Returns just the lowercase *reason* — the hook wraps
  // it in the shared `WORD — reason` line, so the answer is a fragment and not a
  // sentence. The wording is the game's: one board's misses divide differently
  // from another's. `word` is the normalized lowercase.
  explainReject: (word: string) => string
  // Optional: also RECORD the rejection, don't just show it. Omitted, a rejected
  // word never leaves the client. Supplied, the rejection is a TURN — it goes in
  // the shared log and can cost the caller their go, which is why wordiply
  // passes it (docs/games/wordiply.md).
  //
  // Fire-and-forget: the pill already says the same thing, so a failed write
  // must not change what the player sees. **NOT called for an already-found
  // word** — that row is in the log by definition, and re-logging it is exactly
  // what the reminder exists to prevent.
  recordReject?: (
    word: string,
    reason: Exclude<WordSubmitAnswer, 'accepted' | 'already_found'>,
  ) => void

  // What the engine decided, for a surface that shows it somewhere other than
  // the pill. Presentational and nothing else — it writes nothing anywhere, and
  // unlike `recordReject` it fires for EVERY answer including the already-found
  // one, because a board showing an answer has to show that one too.
  onAnswer?: (word: string, answer: WordSubmitAnswer) => void

  // What each answer MEANS in this game, as an outcome. Required, no default,
  // and `accepted` goes through it too, so the engine never names a word of its
  // own. Takes the word as well because one `not_legal` may cover several
  // things and only some of them are a rule broken. **Whatever it returns is
  // what the pill says.** See doc.md for why this is the game's judgment.
  outcomeFor: (word: string, answer: WordSubmitAnswer) => Outcome
  // Optional: say nothing when a word is ACCEPTED. Omitted, the accepted word
  // shows as a result — `CAT +3`, the one place the player learns it landed.
  // Supplied, the board already shows the word the moment it lands, so a result
  // would say it twice and only the rejections show.
  hideAccepted?: boolean
}

/** The typed word, and the ways a game touches it. */
export type FoundWordSubmitApi = {
  word: string
  // The raw state setter — accepts a value or an updater, so a game can append
  // a clicked letter (`setWord((w) => w + 'A')`) as well as replace.
  setWord: Dispatch<SetStateAction<string>>
  // The last word submitted (accepted or rejected), for `<WordEntryArea recall>` —
  // ArrowUp brings it back to fix a typo. Keeps the RAW text, not the
  // normalized lookup key, so recall shows what was typed.
  lastWord: string
  // Fire a submit of the current `word`.
  submit: () => void
}

/**
 * A word as it appears anywhere in feedback: caps, with a trailing ` •` bonus
 * dot when it's a bonus find. Exported because the own-move `line()` below is
 * not the only place a found word is named — a game narrating a PEER's find
 * (`{name} found {WORD}`) must show the same dot, and the two would drift the
 * first time either was edited.
 */
export const wordWithBonusDot = (word: string, isBonus = false): string =>
  `${word.toUpperCase()}${isBonus ? ' •' : ''}`

/**
 * The one own-move line format, so every game in the family reads identically:
 * `WORD — body`, always leading with the word in caps. A **bonus**
 * find gets the ` •` dot right after the word (not at the end of the line):
 *   accept       → `GOOD — +2`      (bonus: `GOOD • — +2`)
 *   pangram      → `ABCDEFG — pangram +17`
 *   too short    → `AB — too short`
 *   already found→ `CAT — already found`
 *   reject       → `ZZZ — not on board`   (the reason comes from explainReject)
 */
const line = (word: string, body: string, isBonus = false): string =>
  `${wordWithBonusDot(word, isBonus)} — ${body}`

export function useFoundWordSubmit(cfg: FoundWordSubmitConfig): FoundWordSubmitApi {
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
    // Body is universal — `+N`, or `pangram +N` when the entry is a pangram
    // (optional: only some games in the family have the concept). The bonus dot
    // rides right after the word.
    pendingRef.current.add(w)
    c.onAnswer?.(w, 'accepted')
    const body = `${entry.isPangram ? 'pangram ' : ''}+${entry.points}`
    if (!c.hideAccepted)
      slot.show(
        FeedbackMessage.result(c.outcomeFor(w, 'accepted'), line(w, body, entry.isBonus)),
      )

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
