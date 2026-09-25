// cs-blessed-found-words

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { showFaultModal } from '@/common/faults/faultStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'

/**
 * The shared **type-a-word-and-submit** engine, for a game that ships its legal
 * list to the client.
 *
 * What it models is narrower than hunting words: **a typed word, a shipped
 * legal list to look it up in, and a growing set of found words to dedup
 * against.** A game with the list in hand does the same thing on every submit —
 * validate the typed word against it, and, if it's good, answer at once and
 * fire a trusting-commit RPC in the background. The per-game bits are the list
 * lookup, the RPC, and everything the player is told; everything structural
 * (dedup, the optimistic in-flight guard, last-word recall) lives here once.
 * Wordiply is the caller
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
 * **It says nothing of its own.** Each answer goes to the game's `onAnswer`,
 * and the game turns it into words and an outcome in its `lib/answer.ts` —
 * the games word the same answer differently, and some have answers (a
 * pangram) the others lack. The one thing shown here is the server's `not-ok`
 * when a commit does not land: that is the server's sentence, and every game
 * in the family shows it the same way.
 *
 * It owns `word`/`lastWord` state. It does NOT own `useCaptureKeys`; that lives
 * inside the shared `<WordEntryArea>`.
 */

/** One entry of a game's shipped legal list. `word` is the canonical lowercase
 *  form (matches the DB rows + boggle's board string); `points` and the flags
 *  come straight off the shipped data, so the FE computes nothing. `isPangram`
 *  is optional: only some games in the family have the concept. */
export type LegalWord = {
  word: string
  points: number
  isBonus: boolean
  isPangram?: boolean
}

/** What the engine decided about a submitted word. A game maps these into its
 *  own answers, which are usually more: spellingbee splits `not_legal` three
 *  ways, by why the word missed. */
export type WordSubmitAnswer = 'accepted' | 'too_short' | 'not_legal' | 'already_found'

/** One answer as `onAnswer` receives it: what was decided, the word (normalized
 *  lowercase), and its legal-list entry where there is one. An already-found
 *  word normally has an entry — it was legal when it was found — so a game can
 *  still dot a bonus word. */
export type WordSubmitReport =
  | { answer: 'accepted'; word: string; entry: LegalWord }
  | { answer: 'already_found'; word: string; entry: LegalWord | null }
  | { answer: 'too_short'; word: string }
  | { answer: 'not_legal'; word: string }

/** Everything the engine cannot know: the game's board rules, its RPC, and what
 *  it says about each answer. */
export type FoundWordSubmitConfig = {
  mode: 'coop' | 'compete'
  userId: string
  // The move is mine (the page's `isMyTurn`) — otherwise submit is a no-op:
  // the game is over, I am out of it, or it is a teammate's turn.
  isMyTurn: boolean
  minWordLength: number
  // The game's below-board slot, for the server's `not-ok` when a commit does
  // not land. Everything else the game shows there itself, from `onAnswer`.
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
  // Every answer, as it is decided — the game says what it means (its
  // `lib/answer.ts`) and shows it. Fires for EVERY answer, already-found
  // included, and before the commit for an accepted word.
  onAnswer: (report: WordSubmitReport) => void
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
 * dot when it's a bonus find. Shared because the family names a found word in
 * several places — each game's own-move lines and its peers' finds — and the
 * dot has to look the same in all of them.
 */
export const wordWithBonusDot = (word: string, isBonus = false): string =>
  `${word.toUpperCase()}${isBonus ? ' •' : ''}`

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
    const raw = wordRef.current
    const w = raw.trim().toLowerCase()
    if (w === '' || !c.isMyTurn) return

    // Consume the input up front: record it for recall, clear the box (so the pill
    // can reclaim the slot), and blank the ref synchronously — a same-tick second
    // submit then sees an empty word and bails before it can double-fire.
    setLastWord(raw)
    setWordState('')
    wordRef.current = ''

    if (w.length < c.minWordLength) {
      c.onAnswer({ answer: 'too_short', word: w })
      c.recordReject?.(w, 'too_short')
      return
    }

    // Look the word up FIRST so an already-found answer carries its entry too —
    // a duplicate is, by definition, a legal word that was accepted before.
    const entry = c.lookup(w)

    const alreadyFound =
      pendingRef.current.has(w) ||
      c.foundWords.some(
        (f) => f.word === w && (c.mode === 'coop' || f.user_id === c.userId),
      )
    if (alreadyFound) {
      c.onAnswer({ answer: 'already_found', word: w, entry })
      return
    }

    if (!entry) {
      c.onAnswer({ answer: 'not_legal', word: w })
      // One reason for both misses the lookup can't tell apart (not in the
      // list vs doesn't fit the board); the SERVER re-derives which, since it
      // owns the structural rules and this hook doesn't know them.
      c.recordReject?.(w, 'not_legal')
      return
    }

    // Accept optimistically: reserve the word, answer, commit in the background.
    pendingRef.current.add(w)
    c.onAnswer({ answer: 'accepted', word: w, entry })

    // The commit lost: free the word so it can be retried, and put the
    // server's own sentence up — a notOk, which ranks over the optimistic
    // answer and needs its × (docs/ui.md → Feedback pill). A fault's modal is
    // raised centrally by `runRpc` rather than by anything here.
    c.commit(entry).then(
      (failure) => {
        if (failure === null) return // it landed; the optimistic answer stands
        pendingRef.current.delete(w) // free it so the player can retry
        // The server's sentence, verbatim. The duplicate's is already the
        // whole line (`CAT — already found`), composed server-side to read
        // like the game's own already-found answer.
        c.localFeedbackSlot.show(FeedbackMessage.notOk(failure))
      },
      // `runRpc` resolves for every answer it can classify, so a REJECTION here
      // is ours — a commit that threw rather than answering.
      () => showFaultModal({ text: 'BUG: a word commit threw instead of answering' }),
    )
  }, [])

  return { word, setWord, lastWord, submit }
}
