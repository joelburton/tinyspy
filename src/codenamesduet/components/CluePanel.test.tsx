// cs-met-codenamesduet

/**
 * Regression guard for the two-kinds-of-text-input contract
 * (docs/keyboard-shortcuts.md): codenamesduet's clue inputs must be tagged
 * `data-game-input` so the global `/ ? ~` shortcuts still fire while you're
 * typing a clue (you can hit `/` to chat without clicking away). This is the
 * counterpart to the chat box being `data-chat-input` (NOT a game input), so
 * `/` types a literal slash there. `isNonGameField`'s LOGIC is covered in
 * `common/keyboard/editableField.test.ts` (the shell actions reach it through
 * `inField: 'game-inputs'`); this pins that the actual clue inputs carry the tag.
 */
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { db } from '../db'
import { CluePanel } from './CluePanel'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
// The two envelope readers the form calls: the AI answers with one suggestion,
// and a submitted clue lands. `db.rpc` is still called with the arguments, which
// is what these cases read.
vi.mock('@/common/supabase/dbResult', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(async () => ({
    type: 'ok',
    data: { result: 'suggested', suggestion: { clue: 'wave', count: 2, reasoning: 'r' } },
  })),
  runRpc: vi.fn(async () => ({ type: 'ok', data: { result: 'clued' } })),
}))

describe('codenamesduet CluePanel — input tagging', () => {
  it('marks both clue inputs (# and word) data-game-input', () => {
    const { container } = render(
      <CluePanel
        gameId="g1"
        isClueGiver
        isGuessPhase={false}
        currentClue={null}
        inSuddenDeath={false}
        peer={undefined}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
      />,
    )
    const inputs = container.querySelectorAll('input')
    // The clue-giver's clue phase shows exactly the count + word fields.
    expect(inputs).toHaveLength(2)
    inputs.forEach((input) => expect(input).toHaveAttribute('data-game-input'))
  })
})

/**
 * A clue is logged as the AI's only when it is submitted EXACTLY as the AI
 * suggested it — word and count unedited. Editing either makes it the giver's
 * own, and a clue with no suggestion behind it never is.
 */
describe('codenamesduet CluePanel — a clue from the AI', () => {
  async function renderAsGiver() {
    const { container } = render(
      <CluePanel
        gameId="g1"
        isClueGiver
        isGuessPhase={false}
        currentClue={null}
        inSuddenDeath={false}
        peer={undefined}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
      />,
    )
    const [count, word] = Array.from(container.querySelectorAll('input'))
    return { container, count: count!, word: word! }
  }

  async function askTheAi(container: HTMLElement, word: HTMLInputElement) {
    fireEvent.click(container.querySelector('button[data-action="act-suggest-clue"]')!)
    await waitFor(() => expect(word).toHaveValue('WAVE'))
  }

  /** What the form sent `submit_clue` as `clue_from_ai`. */
  async function submitted(container: HTMLElement) {
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('submit_clue', expect.anything()))
    return (vi.mocked(db.rpc).mock.calls.at(-1)![1] as { clue_from_ai: boolean }).clue_from_ai
  }

  beforeEach(() => vi.mocked(db.rpc).mockClear())

  it('is the AI’s when submitted as suggested', async () => {
    const { container, word } = await renderAsGiver()
    await askTheAi(container, word)
    expect(await submitted(container)).toBe(true)
  })

  it('is the giver’s own once the word is edited', async () => {
    const { container, word } = await renderAsGiver()
    await askTheAi(container, word)
    fireEvent.change(word, { target: { value: 'OCEAN' } })
    expect(await submitted(container)).toBe(false)
  })

  it('is the giver’s own once the count is edited', async () => {
    const { container, count, word } = await renderAsGiver()
    await askTheAi(container, word)
    fireEvent.change(count, { target: { value: '3' } })
    expect(await submitted(container)).toBe(false)
  })

  it('is the giver’s own with no suggestion behind it', async () => {
    const { container, count, word } = await renderAsGiver()
    fireEvent.change(count, { target: { value: '2' } })
    fireEvent.change(word, { target: { value: 'WAVE' } })
    expect(await submitted(container)).toBe(false)
  })
})
