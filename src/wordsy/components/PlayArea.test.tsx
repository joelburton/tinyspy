// cs-unmet

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
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

  it('a non-word is refused in its words, and the typed word kept to fix', async () => {
    rpc.mockResolvedValue(answer('notAWord'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('cab')
    await enter()
    expect(await screen.findByText('Not a word at this dictionary')).toBeInTheDocument()
    // The next key dismisses the pill, and the word is still there.
    await press({ key: 'Shift', code: 'ShiftLeft' })
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument())
  })

  it('a word already played names the earlier one', async () => {
    rpc.mockResolvedValue(answer('alreadyPlayed', 'fish'))
    render(<WithKeys {...ZTest_makeWordsyCtx()} />)
    await typeWord('fishes')
    await enter()
    expect(await screen.findByText('Already played: FISH')).toBeInTheDocument()
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

describe('wordsy PlayArea — the clock starting on me', () => {
  const board = () => screen.getByTestId('board')

  it('flashes the board when a rival\'s first word starts the clock, and not on mount', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx()} />)
    expect(board().className).not.toMatch(/yourTurnFlash/)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [ZTest_TWO[0]!, { ...ZTest_TWO[1]!, word: 'cab', isWordFrozen: true }],
    })} />)
    expect(board().className).toMatch(/yourTurnFlash/)
  })

  it('never for the player whose word started it', () => {
    const { rerender } = render(<PlayAreaLoader {...ZTest_makeWordsyCtx()} />)
    rerender(<PlayAreaLoader {...ZTest_makeWordsyCtx({
      rounds: [{ num: 1, fastest: 'u1', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'cab', isWordFrozen: true }, ZTest_TWO[1]!],
    })} />)
    expect(board().className).not.toMatch(/yourTurnFlash/)
  })
})

describe('wordsy PlayArea — the log', () => {
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
