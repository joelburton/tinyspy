// cs-unmet

import { useState } from 'react'
import type { GSentWord } from '../types'

/**
 * The longest word the entry takes: 18 letters (Joel, 2026-10-11), over the
 * shared capture's 16 — Wordsy rewards long words, and the rulebook's own
 * examples run to BACCALAUREATES. The server allows 45; the box is the bound.
 */
export const MAX_WORD_LENGTH = 18

/**
 * The word being typed. Nothing reaches the server until ↵ (doc.md → Intro to
 * area): `submit` hands the word to `sendWord`, and empties the entry
 * once the word stands, or once it is refused as no word at all — there is
 * nothing in a non-word worth fixing. A word refused as already played stays,
 * to be changed. The last word that stood is `recall`, which ↑ brings back.
 *
 * `edit` keeps the word within `MAX_WORD_LENGTH`, whichever way a letter
 * arrives — the keys stop at it through the entry's `maxLength`, and a tapped
 * cap goes through here. Lowercase, as the word list is; the entry box draws
 * the capitals.
 */
export function useTypedWord({
  sendWord,
}: {
  // What became of the word (`useSubmitWord`).
  sendWord: (word: string) => Promise<GSentWord>
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
    const result = await sendWord(sent)
    if (result === 'stands') setRecall(sent)
    if (result !== 'kept') setWord('')
  }

  return { word, edit: (next) => setWord(next.slice(0, MAX_WORD_LENGTH)), submit, recall }
}
