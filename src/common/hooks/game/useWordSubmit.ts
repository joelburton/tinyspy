import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { GenericFeedbackMsg, GenericFeedbackTone } from '../../lib/games'
import { useLocalFeedback } from '../feedback/useLocalFeedback'
import { stickyPill } from '../../lib/game/localPills'

/**
 * The shared **type-a-word-and-submit** engine for the two word-list games
 * (boggle/MothCubes + spellingbee/FreeBee). Both ship their full legal word list
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
 * move as `useGlobalFeedback`.
 *
 * **Optimistic, never blocking.** Because the FE already knows the full legal
 * list, a valid word needs no server round-trip to *confirm* — we show `+points`
 * immediately and commit in the background. So there is no busy/disabled state:
 * the player can keep typing the next word while the last one commits. Dedup
 * spans `foundWords` (the committed rows from realtime) **plus** a synchronous
 * `pendingRef` of words accepted-but-not-yet-landed, which closes the realtime-lag
 * window that would otherwise allow a double count.
 *
 * It owns `word`/`lastWord` state and `useLocalFeedback` (the own-move pill is a
 * submit concern — this hook is its only writer). It does NOT own `useCaptureKeys`;
 * that lives inside the shared `<EntryRow>`. A PlayArea wires the returned
 * `word`/`setWord`/`submit`/`localFeedback`/`clearLocalFeedback` into `<EntryRow>`
 * exactly as before.
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
  /** Committed rows (from `useGame`), the dedup source. Mode-aware: coop dedups
   *  across all players (one shared find list); compete dedups per-player. */
  foundWords: ReadonlyArray<{ word: string; user_id: string }>
  /** O(1) membership over the game's legal list, keyed by lowercase word. Returns
   *  the matched entry (points + flags) or `null` for a non-legal word. */
  lookup: (word: string) => WordEntry | null
  /** The trusting-commit RPC. The hook fires this in the background and only
   *  awaits to surface an error + release the pending word. */
  commit: (entry: WordEntry) => Promise<{ error: { message: string } | null }>
  /** Why did `lookup` miss? Returns just the lowercase *reason* — the hook wraps
   *  it in the shared `WORD — reason` line. Per-game vocabulary: boggle "not on
   *  board" (untraceable) vs "not a word"; spellingbee "bad letters" / "missing
   *  center letter" / "not a word". `word` is the normalized lowercase. */
  explainReject: (word: string) => string
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
  localFeedback: GenericFeedbackMsg | null
  clearLocalFeedback: () => void
  /** Push an own-move message into the same below-board pill, in the shared
   *  outline+sticky style — for the game's *sibling* own-actions that aren't word
   *  submits (e.g. a failed End). Keeps one feedback slot with one look. */
  showFeedback: (tone: GenericFeedbackTone, text: string) => void
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
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: cfg.isTerminal })

  // Latest config + word held in refs so `submit`/`setWord` stay referentially
  // stable across renders while still reading current values. Synced in a passive
  // effect — never written during render (react-hooks/refs forbids that); React
  // flushes passive effects before the next discrete event, so `submit` (fired by
  // Enter/click) always reads the latest typed word. The same-tick double-Enter
  // safety is unchanged: `submit` blanks `wordRef` synchronously (below) before a
  // second call can run.
  const cfgRef = useRef(cfg)
  const wordRef = useRef(word)
  useEffect(() => {
    cfgRef.current = cfg
    wordRef.current = word
  })

  // Words accepted this session but whose `found_words` row may not have arrived
  // via realtime yet — dedup against these too, so a fast re-submit during the
  // propagation lag doesn't double-commit. A word leaves the set only if its
  // commit fails (so a retry is allowed); on success the realtime row supersedes it.
  const pendingRef = useRef<Set<string>>(new Set())

  const showFeedback = useCallback(
    (tone: GenericFeedbackTone, text: string) => showLocalFeedback(stickyPill(tone, text)),
    [showLocalFeedback],
  )

  const submit = useCallback(() => {
    const c = cfgRef.current
    const raw = wordRef.current
    const w = raw.trim().toLowerCase()
    if (w === '' || c.isTerminal) return

    // Consume the input up front: record it for recall, clear the box (so the
    // pill can reclaim the slot) and blank the ref synchronously.
    setLastWord(raw)
    setWordState('')
    wordRef.current = ''

    if (w.length < c.minWordLength) {
      showLocalFeedback(stickyPill('warning', line(w, 'too short')))
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
      showLocalFeedback(stickyPill('warning', line(w, 'already found', entry?.isBonus)))
      return
    }

    if (!entry) {
      showLocalFeedback(stickyPill('error', line(w, c.explainReject(w))))
      return
    }

    // Accept optimistically: reserve the word, show it, commit in the background.
    // Body is universal — `+N`, or `pangram +N` when the entry is a pangram (a
    // spellingbee-only flag; boggle entries never set it). The bonus dot rides
    // right after the word.
    pendingRef.current.add(w)
    const body = `${entry.isPangram ? 'pangram ' : ''}+${entry.points}`
    showLocalFeedback(stickyPill('success', line(w, body, entry.isBonus)))

    const release = (message: string) => {
      pendingRef.current.delete(w) // free it so the player can retry
      showLocalFeedback(stickyPill('error', message))
    }
    c.commit(entry).then(
      ({ error }) => {
        if (error) release(error.message)
      },
      (err: unknown) => release(err instanceof Error ? err.message : 'Submit failed'),
    )
  }, [showLocalFeedback])

  return { word, setWord: setWordState, lastWord, submit, localFeedback, clearLocalFeedback, showFeedback }
}
