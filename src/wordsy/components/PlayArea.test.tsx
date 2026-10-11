// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { playSound } from '@/common/sounds/playSound'
import { db } from '../db'
import {
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

  it('its caps are gray once my word is frozen', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    })} />)
    const keyboard = await screen.findByLabelText('Keyboard')
    expect(within(keyboard).getByRole('button', { name: 'c' })).toBeDisabled()
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

  it('holding No Flip before anyone has submitted says so, and ↵ sends nothing', async () => {
    render(<WithKeys {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2, noFlipHolder: 'u1' }],
      players: THREE,
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

  it('Start round 2 calls start_round', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ready' }))
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx(BETWEEN)} />)
    await user.click(screen.getByRole('button', { name: 'Start round 2' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('start_round', { p_game_id: 'g1' }))
  })

  it('reads Waiting for others, disabled, once I have pressed', () => {
    render(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      ...BETWEEN,
      players: [{ ...ZTest_TWO[0]!, isReadyForNextRound: true }, ZTest_TWO[1]!],
    })} />)
    expect(screen.getByRole('button', { name: 'Waiting for others' })).toBeDisabled()
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
})
