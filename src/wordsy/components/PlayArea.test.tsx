// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { playSound } from '@/common/sounds/playSound'
import { db } from '../db'
import { DEFAULT_WORDSY_SETUP } from '../lib/setup'
import {
  ZTest_CONCEDED,
  ZTest_makeWordsyCtx,
  ZTest_TWO,
  ZTest_word,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { PlayAreaLoader } from './PlayArea'

/**
 * wordsy's PLAY SURFACE — the mounted tree. The scores, the answers, the
 * endings and `gd` have their own files, and the pgTAP files own the rules;
 * what none of them see is the WIRING: what a key sends, what the entry
 * shows in which state, and the moment the bell marks.
 *
 * The surface is a pure function of the blob the page hands it, so a test
 * builds that blob from the game's facts and mocks nothing but `db`. The
 * table is the planted one (`ZTest_TABLE`), so CAB scores 9.
 */

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/sounds/playSound', () => ({ playSound: vi.fn(() => () => {}), preloadSound: vi.fn() }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope in the shape `runRpc` unwraps. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** `submit_word`'s answer. */
const answer = (result: string, earlier: string | null = null) => okEnvelope({
  result, earlier, timer_started: false, round_ended: false, game_ended: false,
})

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })
async function typeWord(word: string) {
  for (const key of word) await press({ key, code: `Key${key.toUpperCase()}` })
}
const enter = () => press({ key: 'Enter', code: 'Enter' })

/** Three players, so No Flip is in play: me, bea, cade. */
const THREE: ZTest_GameDataFacts['players'] = [
  ...ZTest_TWO,
  { id: 'u3', username: 'cade', color: 'green' },
]

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
  vi.mocked(playSound).mockClear()
})

describe('wordsy PlayArea — the entry', () => {
  it('typing and ↵ submit the word', async () => {
    rpc.mockResolvedValue(answer('submitted'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'cab' }))
  })

  it('shows the typed word\'s score as it is typed', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    expect(screen.getAllByText('cab').length).toBeGreaterThan(0)
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('draws each typed letter by how it scores: on a card, on none, on a rare card', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    // E has no card, L the 3, F the red +1.
    await typeWord('elf')
    const line = screen.getByText('9').parentElement!
    const classOf = (letter: string) => within(line).getByText(letter).className
    expect(classOf('e')).toMatch(/unscored/)
    expect(classOf('l')).toMatch(/scored/)
    expect(classOf('l')).not.toMatch(/bonus_/)
    expect(classOf('f')).toMatch(/bonus_1/)
  })

  it('a word that stands says so, and empties the entry', async () => {
    rpc.mockResolvedValue(answer('submitted'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    expect(await screen.findByText('Your word is in')).toBeInTheDocument()
    expect(screen.queryByText('9')).toBeNull()
  })

  it('a non-word is refused in its words, and the entry emptied', async () => {
    rpc.mockResolvedValue(answer('notAWord'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    expect(await screen.findByText('Not a word at this dictionary')).toBeInTheDocument()
    // The next key dismisses the pill, and the word is gone.
    await press({ key: 'Shift', code: 'ShiftLeft' })
    await waitFor(() => expect(screen.getByText('Type a word')).toBeInTheDocument())
    expect(screen.queryByText('9')).toBeNull()
  })

  it('a new table takes the round\'s answer down', async () => {
    rpc.mockResolvedValue(answer('submitted'))
    const { rerender } = render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    expect(await screen.findByText('Your word is in')).toBeInTheDocument()
    // The same round, rebuilt: the answer stays.
    rerender(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    })} />)
    expect(screen.getByText('Your word is in')).toBeInTheDocument()
    // Round 2 dealt: it goes.
    rerender(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2 }],
      events: [ZTest_word(1, 'u1', 1, 'cab', 9), ZTest_word(2, 'u2', 1, '', 0)],
    })} />)
    await waitFor(() => expect(screen.queryByText('Your word is in')).toBeNull())
  })

  it('a word already played names the earlier one, and stays to be changed', async () => {
    rpc.mockResolvedValue(answer('alreadyPlayed', 'fish'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    expect(await screen.findByText('Already played: FISH')).toBeInTheDocument()
    await press({ key: 'Shift', code: 'ShiftLeft' })
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument())
  })
})

describe('wordsy PlayArea — the on-screen keyboard', () => {
  it('tapped caps type the word, and its Enter submits it', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(answer('submitted'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    const keyboard = await screen.findByLabelText('Keyboard')
    for (const ch of 'cab') await user.click(within(keyboard).getByRole('button', { name: ch }))
    expect(screen.getByText('9')).toBeInTheDocument()
    await user.click(within(keyboard).getByRole('button', { name: 'Enter' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'cab' }))
  })

  it('the entry takes eighteen letters, typed or tapped, and no more', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    // Nineteen typed: the keys stop at eighteen.
    await typeWord('baccalaureatesbacca')
    expect(screen.getByTestId('entry-value')).toHaveTextContent(/^baccalaureatesbacc$/i)
    // A tapped cap goes through the same bound.
    const keyboard = await screen.findByLabelText('Keyboard')
    await user.click(within(keyboard).getByRole('button', { name: 'l' }))
    expect(screen.getByTestId('entry-value')).toHaveTextContent(/^baccalaureatesbacc$/i)
  })

  it('its caps are gray once my word is frozen', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    })} />)
    const keyboard = await screen.findByLabelText('Keyboard')
    expect(within(keyboard).getByRole('button', { name: 'c' })).toBeDisabled()
  })
})

describe('wordsy PlayArea — the picked cards', () => {
  /** The board's cards for `letter`, in slot order. */
  const cards = (letter: string) =>
    within(screen.getByTestId('board')).getAllByText(letter).map((el) => el.parentElement!)

  it('a typed letter picks the card it scores on, the best first', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    // One C against two C cards picks the 4, not the 3.
    const [c4, c3] = cards('c')
    expect(c4!.className).toMatch(/picked/)
    expect(c3!.className).not.toMatch(/picked/)
    expect(cards('b')[0]!.className).toMatch(/picked/)
    expect(cards('d')[0]!.className).not.toMatch(/picked/)
  })

  it('a second C picks the second C card, and ⌫ puts it back', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cc')
    expect(cards('c').map((el) => /picked/.test(el.className))).toEqual([true, true])
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(cards('c').map((el) => /picked/.test(el.className))).toEqual([true, false])
  })
})

describe('wordsy PlayArea — the standing word', () => {
  it('a word that can still change reads "Your word"', () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab' }, { ...ZTest_TWO[1]!, word: 'dr', isWordFrozen: true }],
    })} />)
    expect(screen.getByText(/Your word:/)).toBeInTheDocument()
  })

  it('a later submit replaces mine: the entry stays open', async () => {
    rpc.mockResolvedValue(answer('submitted'))
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab' }, { ...ZTest_TWO[1]!, word: 'dr', isWordFrozen: true }],
    })} />)
    await typeWord('elf')
    await enter()
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'elf' }))
  })

  it('once frozen the entry takes nothing, and the word reads "Your word is in"', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    })} />)
    expect(screen.getByText(/Your word is in:/)).toBeInTheDocument()
    await typeWord('elf')
    await enter()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('blocked by No Flip, as the server says, the line says so and ↵ sends nothing', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2, noFlipHolder: 'u1' }],
      players: [{ ...THREE[0]!, isBlockedByNoFlip: true }, THREE[1]!, THREE[2]!],
    })} />)
    expect(screen.getByText('You hold No Flip — wait for someone else to submit')).toBeInTheDocument()
    await typeWord('cab')
    await enter()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('wordsy PlayArea — the round\'s marks', () => {
  const board = () => screen.getByTestId('board')

  /** Round 1 with its clock started by `fastestId`, whose word is frozen. */
  const clockStartedBy = (fastestId: string): ZTest_GameDataFacts => ({
    rounds: [{ num: 1, fastest: fastestId, isTimerRunning: true }],
    players: ZTest_TWO.map((p) => p.id === fastestId ? { ...p, word: 'cab', isWordFrozen: true } : p),
  })

  /** Round 1 revealed, waiting for everyone to press Start. */
  const REVEALED: ZTest_GameDataFacts = {
    rounds: [{ num: 1, ended: true, fastest: 'u2' }],
    events: [ZTest_word(1, 'u2', 1, 'cab', 9), ZTest_word(2, 'u1', 1, '', 0)],
  }

  /** …and round 2 dealt. */
  const DEALT: ZTest_GameDataFacts = { ...REVEALED, rounds: [...REVEALED.rounds!, { num: 2 }] }

  it('a rival\'s first word: the caution frame and the timer sound, not on mount', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx()} />)
    expect(board().className).not.toMatch(/clockStartFlash/)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx(clockStartedBy('u2'))} />)
    expect(board().className).toMatch(/clockStartFlash/)
    expect(board().className).not.toMatch(/yourTurnFlash/)
    expect(playSound).toHaveBeenCalledWith('timer')
  })

  it('never for the player whose word started it — whose board dims instead', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx()} />)
    expect(board().className).not.toMatch(/dimNotYourTurn/)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx(clockStartedBy('u1'))} />)
    expect(board().className).not.toMatch(/clockStartFlash/)
    expect(playSound).not.toHaveBeenCalledWith('timer')
    expect(board().className).toMatch(/dimNotYourTurn/)
  })

  it('a word that can still change leaves the board undimmed', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      ...clockStartedBy('u2'),
      players: [{ ...ZTest_TWO[0]!, word: 'elf' }, { ...ZTest_TWO[1]!, word: 'cab', isWordFrozen: true }],
    })} />)
    expect(board().className).not.toMatch(/dimNotYourTurn/)
  })

  it('the reveal\'s scoresheet rings no bell', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx(clockStartedBy('u1'))} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx(REVEALED)} />)
    expect(playSound).not.toHaveBeenCalledWith('bell')
  })

  it('the next round\'s table: the yellow frame and the bell, for everyone', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx(REVEALED)} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx(DEALT)} />)
    expect(board().className).toMatch(/yourTurnFlash/)
    expect(playSound).toHaveBeenCalledWith('bell')
  })

  it('opening a game in a later round marks nothing', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(DEALT)} />)
    expect(board().className).not.toMatch(/yourTurnFlash/)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('a Restart, which drops the round number, is not a new table', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx(DEALT)} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx()} />)
    expect(board().className).not.toMatch(/yourTurnFlash/)
    expect(playSound).not.toHaveBeenCalled()
  })
})

describe('wordsy PlayArea — the header\'s line', () => {
  /** The page with a spy on its header slot, so a rerender can be watched. */
  function narrated(facts: ZTest_GameDataFacts) {
    const globalFeedbackSlot = createFeedbackSlot('global')
    const shown = vi.spyOn(globalFeedbackSlot, 'show')
    return { ctx: ZTest_makeWordsyCtx(facts, { globalFeedbackSlot }), shown }
  }

  it('a rival\'s word starting the clock is said once, naming them', () => {
    const { ctx, shown } = narrated({})
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    const next = ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [ZTest_TWO[0]!, { ...ZTest_TWO[1]!, word: 'cab', isWordFrozen: true }],
    }, { globalFeedbackSlot: ctx.globalFeedbackSlot })
    rerender(<PlayAreaLoader {...next} />)
    rerender(<PlayAreaLoader {...next} />)
    expect(shown).toHaveBeenCalledTimes(1)
    const feedbackMsg = shown.mock.calls[0]![0]
    expect(feedbackMsg.kind).toBe('peer')
    expect(feedbackMsg.actor?.username).toBe('bea')
    expect(feedbackMsg.text).toBe('submitted — 30 seconds')
  })

  it('names the setup\'s seconds', () => {
    const setup = { ...DEFAULT_WORDSY_SETUP, timer_seconds: 45 }
    const { ctx, shown } = narrated({ setup })
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      setup,
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [ZTest_TWO[0]!, { ...ZTest_TWO[1]!, word: 'cab', isWordFrozen: true }],
    }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    expect(shown.mock.calls[0]![0].text).toBe('submitted — 45 seconds')
  })

  it('my own first word is not narrated', () => {
    const { ctx, shown } = narrated({})
    const { rerender } = render(<PlayAreaLoader {...ctx} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    }, { globalFeedbackSlot: ctx.globalFeedbackSlot })} />)
    expect(shown).not.toHaveBeenCalled()
  })
})

describe('wordsy PlayArea — the strip', () => {
  it('reads each total, "in" while that player\'s word stands', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      players: [{ ...ZTest_TWO[0]!, total: 24, word: 'cab' }, { ...ZTest_TWO[1]!, total: 31 }],
    })} />)
    expect(screen.getByText('24 in')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('reads how a player came out once they are out of play', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      players: [
        { ...ZTest_TWO[0]!, total: 46, finalRanking: 1, outcome: 'won' },
        { ...ZTest_TWO[1]!, total: 31, finalRanking: 2, outcome: 'near' },
      ],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
      outcome: 'won',
    })} />)
    expect(screen.getByText('46 (won)')).toBeInTheDocument()
    expect(screen.getByText('31 (2nd)')).toBeInTheDocument()
  })

  it('a conceder reads so while the others play on', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      players: [ZTest_TWO[0]!, { ...ZTest_TWO[1]!, total: 12, ...ZTest_CONCEDED }],
    })} />)
    expect(screen.getByText('12 (conceded)')).toBeInTheDocument()
  })
})

describe('wordsy PlayArea — the log', () => {
  it('draws a word plain, in bold', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2 }],
      events: [ZTest_word(1, 'u1', 1, 'elf', 9), ZTest_word(2, 'u2', 1, '', 0)],
    })} />)
    const word = within(screen.getByRole('table')).getByText('elf')
    expect(word.tagName).toBe('STRONG')
    expect(word.children).toHaveLength(0)
  })

  it('a row per word, "no word" for a player with none, and #N opens that round', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2 }],
      events: [ZTest_word(1, 'u1', 1, 'cab', 9, 2), ZTest_word(2, 'u2', 1, '', 0)],
    })} />)
    const log = screen.getByRole('table')
    expect(within(log).getByText('no word')).toBeInTheDocument()
    expect(within(log).getByText('+2')).toBeInTheDocument()
    await user.click(log.querySelector('[data-history-handle]')!)
    expect(await screen.findByText('Round 1 of 7')).toBeInTheDocument()
  })
})

describe('wordsy PlayArea — through the dispatcher', () => {
  it('⌥⌫ asks to concede; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...ZTest_makeWordsyCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('… and Stop the game calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...ZTest_makeWordsyCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    await screen.findByText('Concede, or stop the game?')
    // The dialog's own Stop is the last one on the page.
    const stops = screen.getAllByRole('button', { name: /Stop/ })
    await user.click(stops[stops.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })
})

describe('wordsy PlayArea — coop', () => {
  beforeEach(() => rpc.mockReset())

  it('shows the solo card beside the round, the dark border on the band, and no penalties', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({ mode: 'coop', team: { band: 2, nPenalties: 1 } })} />)
    const card = screen.getByTestId('solo-card')
    expect(within(card).getByTestId('band-2').className).toMatch(/current/)
    expect(within(card).getByTestId('band-1').className).not.toMatch(/current/)
    // A penalty is the game's scoresheet's to show, not the next word's.
    expect(within(card).queryByText('−2')).toBeNull()
    // Over the table, beside the round.
    expect(card.parentElement).toContainElement(screen.getByTestId('round-label'))
    // No strip: every player would show the team's one total.
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('counts the penalties in the state line', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({ mode: 'coop', team: { total: 40, nPenalties: 2 } })} />)
    // The count sits in its own <strong>, so the line's own text is matched.
    expect(screen.getAllByText(/penalties/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/penalty\b/)).toBeNull()
  })

  it('under turns the entry is the writer\'s alone, and the line says whose', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({ mode: 'coop', turns: { holder: 'u2' } })} />)
    expect(screen.getAllByText(/Waiting for/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('board').className).toMatch(/dimNotYourTurn/)
    await typeWord('elf')
    await enter()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the writer types, and ↵ sends the team\'s word', async () => {
    rpc.mockResolvedValue(okEnvelope({
      result: 'submitted', earlier: null, timer_started: false, round_ended: true, game_ended: false,
    }))
    render(<WithKeys {...ZTest_makeWordsyCtx({ mode: 'coop', turns: { holder: 'u1' } })} />)
    expect(screen.getAllByText('Your turn').length).toBeGreaterThan(0)
    await typeWord('elf')
    await enter()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_word: 'elf' }))
  })

  it('the ending names the title and the total, and the game\'s sheet the penalties', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      mode: 'coop',
      team: { total: 107, nBonuses: 4, band: 1, nPenalties: 2, title: 'Wordsmith' },
      rounds: [{ num: 1, ended: true }, { num: 2, ended: true }, { num: 3, ended: true }],
      events: [
        ZTest_word(1, 'u1', 1, 'fbcdq', 23, 4, { beatClock: true, band: 1 }),
        ZTest_word(2, 'u1', 2, 'elf', 9, 0, { beatClock: true, band: 3, penalty: true }),
        ZTest_word(3, 'u1', 3, 'bob', 5, 0, { beatClock: false, band: 3, penalty: true }),
      ],
      players: [
        { ...ZTest_TWO[0]!, finalRanking: 1, outcome: 'won' }, { ...ZTest_TWO[1]!, finalRanking: 1, outcome: 'won' },
      ],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: 'u1' },
      outcome: 'won',
    })} />)
    expect(screen.getByText('Won (Wordsmith)')).toBeInTheDocument()
    const sheet = screen.getByTestId('game-scoresheet')
    expect(within(sheet).getByText('Wordsmith')).toBeInTheDocument()
    expect(within(sheet).getByText('−4')).toBeInTheDocument()
    expect(within(sheet).getAllByTestId('beat-clock')).toHaveLength(2)
    // A red dot beside the band of each round that took a penalty: rounds 2 and 3.
    const rows = within(sheet).getAllByRole('row').slice(1, 4)
    expect(rows.map((r) => within(r).queryByTestId('penalty-dot') !== null)).toEqual([false, true, true])
    // Under the rows, a dot a penalty and the word.
    const penalties = within(sheet).getByText(/penalties/)
    expect(penalties.textContent!.trim()).toBe('penalties')
    expect(within(penalties).getAllByTestId('penalty-dot')).toHaveLength(2)
    // Coop's headings say what their columns mean: the clock, the band, the
    // bonus, the total.
    expect(within(sheet).getAllByRole('columnheader').map((h) => h.dataset.tooltip).filter(Boolean)).toEqual([
      'Beat the clock: the word was in before time ran out',
      'The timer\'s band when the word was scored; a red dot is a penalty',
      'Bonus: beat the clock with 15 or more',
      'The round\'s total',
    ])
  })

  it('says one penalty in the singular', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      mode: 'coop',
      team: { total: 98, nBonuses: 0, band: 2, nPenalties: 1, title: 'Wordprentice' },
      rounds: [{ num: 1, ended: true }],
      events: [ZTest_word(1, 'u1', 1, 'elf', 9, 0, { beatClock: true, band: 3, penalty: true })],
      players: [
        { ...ZTest_TWO[0]!, finalRanking: 1, outcome: 'won' }, { ...ZTest_TWO[1]!, finalRanking: 1, outcome: 'won' },
      ],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: 'u1' },
      outcome: 'won',
    })} />)
    const penalty = within(screen.getByTestId('game-scoresheet')).getByText(/penalty/)
    expect(penalty.textContent!.trim()).toBe('penalty')
    expect(within(penalty).getAllByTestId('penalty-dot')).toHaveLength(1)
  })
})

describe('wordsy PlayArea — the scoresheets', () => {
  beforeEach(() => rpc.mockReset())

  const BETWEEN: ZTest_GameDataFacts = {
    rounds: [{ num: 1, ended: true, fastest: 'u1' }],
    events: [ZTest_word(1, 'u1', 1, 'elf', 9, 2), ZTest_word(2, 'u2', 1, 'bob', 5)],
  }

  it('puts the round\'s scoresheet in the board\'s place between rounds', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    expect(screen.queryByTestId('board')).toBeNull()
    const sheet = screen.getByTestId('round-scoresheet')
    expect(within(sheet).getByText('9')).toBeInTheDocument()
    expect(within(sheet).getByText('★')).toBeInTheDocument()
    // ELF: 9, and the Fastest's 2, under =.
    expect(within(sheet).getByText('11')).toBeInTheDocument()
  })

  it('each named heading says what its column means', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    const sheet = screen.getByTestId('round-scoresheet')
    const said = within(sheet).getAllByRole('columnheader')
      .filter((h) => h.dataset.tooltip !== undefined)
      .map((h) => [h.dataset.tooltip, h.dataset.tooltipOn])
    expect(said).toEqual([
      ['Beat the Fastest: scored higher than the Fastest\'s word', 'readout'],
      ['Fastest\'s bonus: the Fastest tied or beat three opponents, or all of them if fewer', 'readout'],
      ['The round\'s total', 'readout'],
    ])
  })

  it('has no + column in compete: its bonuses are the two before =', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    const sheet = screen.getByTestId('round-scoresheet')
    const headings = within(sheet).getAllByRole('columnheader')
    expect(headings.map((h) => h.textContent)).not.toContain('+')
    // A heading for every cell of a row.
    expect(within(within(sheet).getAllByRole('row')[1]!).getAllByRole('cell')).toHaveLength(headings.length)
  })

  it('heads the bonus columns beat-the-Fastest then the Fastest\'s, and fills them so', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    const sheet = screen.getByTestId('round-scoresheet')
    const [beatHead, fastestHead] = within(sheet).getAllByRole('columnheader').slice(3, 5)
    expect(beatHead!.querySelector('.lucide-user')).not.toBeNull()
    expect(beatHead!.querySelector('.lucide-hourglass')).not.toBeNull()
    expect(fastestHead!.querySelector('.lucide-hourglass')).not.toBeNull()
    expect(fastestHead!.querySelector('.lucide-users')).not.toBeNull()
    // Me, the Fastest: a dash under beat, +2 under the Fastest's.
    const mine = within(sheet).getAllByRole('row')[1]!
    expect(within(mine).getAllByRole('cell').slice(3, 5).map((c) => c.textContent)).toEqual(['–', '+2'])
  })

  it('Start round 2 calls start_round', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ready' }))
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('start_round', { p_game_id: 'g1' }))
  })

  it('the sheet\'s button has focus as the sheet appears, so ↵ presses it', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ready' }))
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    expect(screen.getByRole('button', { name: 'Start round 2' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('start_round', { p_game_id: 'g1' }))
  })

  it('… and "Show final scores" the same, when the game ends in front of me', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx({ rounds: [{ num: 7, fastest: 'u1' }] })} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 7, ended: true, fastest: 'u1' }],
      events: [ZTest_word(1, 'u1', 7, 'elf', 9, 2), ZTest_word(2, 'u2', 7, 'bob', 5)],
      players: [
        { ...ZTest_TWO[0]!, finalRanking: 1, outcome: 'won' }, { ...ZTest_TWO[1]!, finalRanking: 2, outcome: 'near' },
      ],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
      outcome: 'won',
    })} />)
    expect(screen.getByRole('button', { name: 'Show final scores' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('game-scoresheet')).toBeInTheDocument()
  })

  it('reads Waiting for others, disabled, once I have pressed', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      ...BETWEEN,
      players: [{ ...ZTest_TWO[0]!, isReadyForNextRound: true }, ZTest_TWO[1]!],
    })} />)
    expect(screen.getByRole('button', { name: 'Waiting for others' })).toBeDisabled()
  })

  it('names the round over the table, a past one while it is open', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2 }],
      events: BETWEEN.events,
    })} />)
    expect(screen.getByTestId('round-label')).toHaveTextContent('Round 2 of 7')
    await user.click(screen.getAllByText('#1')[0]!)
    expect(screen.getByTestId('round-label')).toHaveTextContent('Round 1 of 7')
  })

  it('a past round opened from the log shows its board over the scoresheet', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    await user.click(screen.getAllByText('#1')[0]!)
    expect(screen.getByTestId('board')).toBeInTheDocument()
  })

  it('a game ending in front of me shows the last round\'s sheet, then the game\'s on Show final scores', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx({ rounds: [{ num: 1, fastest: 'u1' }] })} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      ...BETWEEN,
      players: [{ ...ZTest_TWO[0]!, finalRanking: 1, total: 11 }, { ...ZTest_TWO[1]!, finalRanking: 2, total: 5 }],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
    })} />)
    expect(screen.getByTestId('round-scoresheet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show final scores' }))
    expect(screen.getByTestId('game-scoresheet')).toBeInTheDocument()
  })

  it('opening a game already over goes straight to the game\'s scoresheet', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      ...BETWEEN,
      players: [{ ...ZTest_TWO[0]!, finalRanking: 1, total: 11 }, { ...ZTest_TWO[1]!, finalRanking: 2, total: 5 }],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
    })} />)
    expect(screen.queryByTestId('board')).toBeNull()
    expect(screen.queryByTestId('round-scoresheet')).toBeNull()
    expect(screen.getByTestId('game-scoresheet')).toBeInTheDocument()
  })

  it('a Stop mid-round has no last round\'s sheet: straight to the game\'s', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx({ rounds: [{ num: 2, fastest: 'u1' }] })} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 2, fastest: 'u1' }],
      players: [{ ...ZTest_TWO[0]!, outcome: 'neutral' }, { ...ZTest_TWO[1]!, outcome: 'neutral' }],
      ending: { reason: 'stopped', detail: 'stopped', by: 'u2' },
      outcome: 'neutral',
    })} />)
    expect(screen.queryByTestId('round-scoresheet')).toBeNull()
    expect(screen.getByTestId('game-scoresheet')).toBeInTheDocument()
  })
})
