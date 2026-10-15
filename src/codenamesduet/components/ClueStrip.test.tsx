// cs-blessed-codenamesduet

/**
 * The clue strip: the clue inputs' tag, the one-digit count, when a clue counts
 * as the AI's, and what the strip shows — the sudden-death notice, and the form
 * clearing once its clue lands.
 *
 * The tag is the two-kinds-of-text-input contract (common/keyboard/doc.md → Whose keystroke is it?):
 * the clue inputs must be `data-game-input` so the global `/ ? ~` shortcuts
 * still fire while you're typing a clue (you can hit `/` to chat without
 * clicking away). This is the counterpart to the chat box being
 * `data-chat-input` (NOT a game input), so `/` types a literal slash there.
 * `isNonGameField`'s LOGIC is covered in `common/keyboard/editableField.test.ts`
 * (the shell actions reach it through `inField: 'game-inputs'`); this pins that
 * the actual clue inputs carry the tag.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { ClueStrip } from './ClueStrip'
import { makeGameData } from '../hooks/useGame'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

/** My partner, named in the waiting and guessing lines. */
const PARTNER = makeGameData(ZTest_makeGameDataRaw(), 'u1').partner
/** The three setup options as the rulebook's game has them: all off. */
const RULEBOOK = { isPassAllowed: true, isStrictWords: false, canDeclineClueGiving: false }
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

describe('codenamesduet ClueStrip — input tagging', () => {
  it('marks both clue inputs (# and word) data-game-input', () => {
    const { container } = render(
      <ClueStrip
        gameId="g1"
        strip="myClue"
        currentClue={null}
        partner={PARTNER}
        {...RULEBOOK}
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

// A longer number overflows `submit_clue`'s int and would come back as a fault.
describe('codenamesduet ClueStrip — the count', () => {
  it('takes one digit, and nothing else', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ClueStrip
        gameId="g1"
        strip="myClue"
        currentClue={null}
        partner={PARTNER}
        {...RULEBOOK}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
      />,
    )
    const count = container.querySelector('input[placeholder="#"]') as HTMLInputElement
    await user.type(count, 'x12')
    expect(count.value).toBe('1')
  })
})

/**
 * A clue is logged as the AI's only when it is submitted EXACTLY as the AI
 * suggested it — word and count unedited. Editing either makes it the giver's
 * own, and a clue with no suggestion behind it never is.
 */
describe('codenamesduet ClueStrip — a clue from the AI', () => {
  async function renderAsGiver() {
    const { container } = render(
      <ClueStrip
        gameId="g1"
        strip="myClue"
        currentClue={null}
        partner={PARTNER}
        {...RULEBOOK}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
      />,
    )
    const [count, word] = Array.from(container.querySelectorAll('input'))
    return { container, count: count!, word: word! }
  }

  async function askTheAi(container: HTMLElement, word: HTMLInputElement) {
    fireEvent.click(container.querySelector('button[data-action="act-suggest-clue"]')!)
    await waitFor(() => expect(word).toHaveValue('wave'))
  }

  /** What the form sent `submit_clue` as `p_clue_from_ai`. */
  async function submitted(container: HTMLElement) {
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('submit_clue', expect.anything()))
    return (vi.mocked(db.rpc).mock.calls.at(-1)![1] as { p_clue_from_ai: boolean }).p_clue_from_ai
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

describe('codenamesduet ClueStrip — what it shows', () => {
  const draw = (over: Partial<ComponentProps<typeof ClueStrip>> = {}) =>
    render(
      <ClueStrip
        gameId="g1"
        strip="myClue"
        currentClue={null}
        partner={PARTNER}
        {...RULEBOOK}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
        {...over}
      />,
    ).container

  // Sudden death wins over every other state: no clue form, no Pass — the
  // strip says what the phase is instead.
  it('is the sudden-death notice in sudden death', () => {
    const container = draw({ strip: 'suddenDeath' })
    expect(container).toHaveTextContent('Sudden death.')
    expect(container.querySelector('form')).toBeNull()
  })

  it('clears the clue form once the clue lands', async () => {
    const container = draw()
    const [count, word] = Array.from(container.querySelectorAll('input'))
    fireEvent.change(count!, { target: { value: '2' } })
    fireEvent.change(word!, { target: { value: 'WAVE' } })
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(word).toHaveValue(''))
    expect(count).toHaveValue('')
  })
})

describe('codenamesduet ClueStrip — the setup options', () => {
  const draw = (over: Partial<ComponentProps<typeof ClueStrip>> = {}) =>
    render(
      <ClueStrip
        gameId="g1"
        strip="myClue"
        currentClue={null}
        partner={PARTNER}
        {...RULEBOOK}
        localFeedbackSlot={createFeedbackSlot('local')}
        onSuggestionChange={vi.fn()}
        {...over}
      />,
    ).container
  const wordInput = (container: HTMLElement) =>
    container.querySelector('input[placeholder="word"]') as HTMLInputElement

  beforeEach(() => vi.mocked(db.rpc).mockClear())

  it('with strict words, the word field keeps only letters', async () => {
    const user = userEvent.setup()
    const container = draw({ isStrictWords: true })
    await user.type(wordInput(container), 'Ice-cream 2')
    expect(wordInput(container).value).toBe('icecream')
  })

  it('without, it keeps what is typed, lowercase', async () => {
    const user = userEvent.setup()
    const container = draw()
    await user.type(wordInput(container), 'Ice-cream 2')
    expect(wordInput(container).value).toBe('ice-cream 2')
  })

  it('with strict words, an AI suggestion is cut to its letters too', async () => {
    vi.mocked(runEdgeFn).mockResolvedValueOnce({
      type: 'ok',
      data: { result: 'suggested', suggestion: { clue: 'ice cream', count: 2, reasoning: 'r' } },
    } as Awaited<ReturnType<typeof runEdgeFn>>)
    const container = draw({ isStrictWords: true })
    fireEvent.click(container.querySelector('button[data-action="act-suggest-clue"]')!)
    await waitFor(() => expect(wordInput(container)).toHaveValue('icecream'))
  })

  it('the AI button says what it does in its tooltip', () => {
    expect(draw().querySelector('button[data-action="act-suggest-clue"]'))
      .toHaveAttribute('data-tooltip', 'Suggest a clue')
  })

  it('offers Decline, red and icon-only, only when the setup allows it', () => {
    expect(draw().querySelector('[data-action="act-decline-clue-giving"]')).toBeNull()
    const decline = draw({ canDeclineClueGiving: true })
      .querySelector('button[data-action="act-decline-clue-giving"]')!
    expect(decline).toHaveAttribute('data-tooltip', 'Decline to give clues for rest of game')
    expect(decline).toHaveTextContent('')
  })

  it('Decline asks first — no turn spent, no more clues — and Cancel sends nothing', async () => {
    const user = userEvent.setup()
    const container = draw({ canDeclineClueGiving: true })
    render(<ConfirmationHost/>)
    await user.click(container.querySelector('button[data-action="act-decline-clue-giving"]')!)
    expect(screen.getByText(
      "This doesn't cost you a turn, but you can't give a clue for the rest of the game.",
    )).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(db.rpc).not.toHaveBeenCalledWith('decline_clue_giving', expect.anything())
  })

  it('Decline, confirmed, calls decline_clue_giving', async () => {
    const user = userEvent.setup()
    vi.mocked(runRpc).mockResolvedValueOnce({ type: 'ok', data: { result: 'declined' } } as
      Awaited<ReturnType<typeof runRpc>>)
    const container = draw({ canDeclineClueGiving: true })
    render(<ConfirmationHost/>)
    await user.click(container.querySelector('button[data-action="act-decline-clue-giving"]')!)
    // The question's answer, not the clue form's own Decline beside it.
    const answer = screen.getAllByRole('button', { name: 'Decline clues' })
      .find((b) => !b.hasAttribute('data-action'))!
    await user.click(answer)
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith('decline_clue_giving', { p_game_id: 'g1' }))
  })

  it('grays Pass, saying why, until the server allows it', () => {
    const myGuess = {
      strip: 'myGuess' as const,
      currentClue: { word: 'wave', count: 2, fromAi: false, by: PARTNER },
    }
    const pass = (container: HTMLElement) =>
      container.querySelector('button[data-action="act-end-turn"]') as HTMLButtonElement
    const grayed = pass(draw({ ...myGuess, isPassAllowed: false }))
    expect(grayed).toBeDisabled()
    expect(grayed).toHaveAttribute('data-tooltip', 'Guess at least one word first')
    expect(pass(draw({ ...myGuess, isPassAllowed: true }))).toBeEnabled()
  })
})
