// cs-unmet

import { useEffect, useState } from 'react'
import { runEdgeFn } from '../../lib/supabase/dbResult'
import { reportUnhandled } from '../../lib/supabase/dbEnvelope'

/** A word's categorization from `common.words` — band, dialects, slur/crude
 *  levels, slang, wordle-list membership. Present on any in-list word; absent
 *  when `unknown`. Surfaced as the small muted line under a definition. */
export type WordMeta = {
  difficulty: number
  american: boolean
  british: boolean
  canadian: boolean
  australian: boolean
  slur: number
  crude: number
  slang: boolean
  wordle: boolean
}

/**
 * What `common-define` puts in `data` — three results, named, because the view
 * shows three different things and a name is what lets it ask.
 *
 *   `defined`        we have words for it, from the cache or freshly fetched
 *   `no-definition`  in the word list, looked up, nothing found
 *   `not-a-word`     not in `common.words` at all, so never looked up
 *
 * `source` is the one-char provenance code ('s'/'e'/'w'/'m') or null.
 */
export type DefinitionResult =
  | { result: 'defined'; word: string; def: string; source: string | null; cached: boolean; meta: WordMeta }
  | { result: 'no-definition'; word: string; meta: WordMeta }
  | { result: 'not-a-word'; word: string }

type State = {
  result: DefinitionResult | null
  loading: boolean
  error: string | null
}

/** What the effect resolves into — tagged with the word it's for so
 *  the public `loading` flag can be derived rather than set
 *  synchronously in the effect (which would cascade-render). */
type Loaded = {
  forWord: string | null
  result: DefinitionResult | null
  error: string | null
}

/**
 * Declarative read-through lookup against the `common-define` Edge Function
 * (which fronts the `common.words` definition columns → Wiktionary). Pass the
 * word to define, or `null` to sit idle; the hook refetches whenever
 * the word changes and cancels the in-flight result if it changes
 * again first (so chasing cross-refs quickly never flashes a stale
 * definition).
 *
 * Both the click-to-define popover and the "look up any word" dialog
 * drive this the same way — they just set `word`.
 *
 * Note `loading` is derived (word set, but the resolved result is for
 * a different word), not stored — the effect only ever calls setState
 * inside its async callback, never synchronously in its body.
 */
export function useDefinition(word: string | null): State {
  const [loaded, setLoaded] = useState<Loaded>({
    forWord: null,
    result: null,
    error: null,
  })

  useEffect(() => {
    if (!word) return
    let canceled = false

    // No opt-out, and the reason is worth stating because the opposite looked
    // right: a failed lookup is a popover with nothing in it, so a blocking
    // modal seems like too much. But `presentFaults` only ever suppresses a
    // FAULT — `runEdgeFn` sends every other severity to the log — so opting out
    // would silence the two that should be loud (a `BUG:` and a lapsed session)
    // while doing nothing at all for the dictionary being down, which is a
    // `service-error` and was never going to modal.
    void runEdgeFn<DefinitionResult>('common-define', { word })
      .then((res) => {
        if (canceled) return
        if (res.type === 'not-ok') {
          // Every severity lands on the popover's own line, including the two
          // that also raised a modal — the modal is dismissable, and this is
          // the place the answer was supposed to appear.
          setLoaded({ forWord: word, result: null, error: res.message })
        } else if (
          res.type === 'ok'
          && (res.data?.result === 'defined'
            || res.data?.result === 'no-definition'
            || res.data?.result === 'not-a-word')
        ) {
          // All three named, though this hook stores them alike and the view
          // does the asking. Naming them is what makes a FOURTH result reach
          // the scream instead of being stored as something nothing renders.
          setLoaded({ forWord: word, result: res.data, error: null })
        } else {
          reportUnhandled('common-define', res)
        }
      })

    return () => {
      canceled = true
    }
  }, [word])

  // Derive the public state. We're loading whenever a word is set but
  // the resolved result is still for a previous (or no) word.
  const loading = word !== null && loaded.forWord !== word
  if (word === null || loading) {
    return { result: null, loading, error: null }
  }
  return { result: loaded.result, loading: false, error: loaded.error }
}
