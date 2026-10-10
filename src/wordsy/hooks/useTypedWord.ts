// cs-unmet

import { useState } from 'react'

/**
 * The word being typed. Nothing reaches the server until ↵ (plans/wordsy.md,
 * decision 17): `submit` hands the word to `sendWord`, and empties the entry
 * only once the word stands — a refused word stays to be fixed. The last word
 * that stood is `recall`, which ↑ brings back.
 *
 * Lowercase, as the word list is; the entry box draws the capitals.
 */
export function useTypedWord({
  sendWord,
}: {
  // Resolves to whether the word now stands (`useSubmitWord`).
  sendWord: (word: string) => Promise<boolean>
}): {
  word: string
  edit: (next: string) => void
  submit: () => Promise<void>
  // The last word that stood, or '' before the first.
  recall: string
} {
  const [word, setWord] = useState('')
  const [recall, setRecall] = useState('')

  async function submit() {
    if (word === '') return
    const sent = word
    if (await sendWord(sent)) {
      setRecall(sent)
      setWord('')
    }
  }

  return { word, edit: setWord, submit, recall }
}
