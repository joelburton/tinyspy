// cs-unmet

/**
 * Render + behavior tests for wordiply's PlayArea — the composition (the
 * five-line board, the length-only readout, the end-of-game reveal), which
 * `tsc` can't catch (a blank-page runtime error slips past it). Deep game logic
 * lives in pgTAP and the lib and hook suites; here we prove the tree mounts and
 * the rules hold: during play only the per-word LENGTH shows (no score %, no
 * letter count); once ended the score bar and, when asked, the best word.
 *
 * The page is handed the `game_data` blob, which a test builds from the game's
 * facts (`ZTest_makeWordiplyCtx`); only `db` and the edge-function call are
 * mocked.
 */
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { ATTENTION_FADE_MS } from '@/common/board-marks/feedbackTiming'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  ZTest_CONCEDED,
  ZTest_SPENT,
  ZTest_guess,
  ZTest_makeWordiplyCtx,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import type { GSetup } from '../types'
import { db } from '../db'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn().mockResolvedValue({ error: null }) } }))
// Only `runEdgeFn` is stubbed — the create-game path. `runRpc` stays REAL so
// the submit path exercises the envelope it actually receives; the `db.rpc`
// mock above is what feeds it.
vi.mock('@/common/supabase/dbResult', async (orig) => ({
  ...(await orig<typeof import('@/common/supabase/dbResult')>()),
  runEdgeFn: vi.fn(),
}))

const SETUP: GSetup = { dict_band: 5, timer: { kind: 'none' } }
const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }

/** A game on base 'ar', longest possible 'hangars' (7), viewed by me (u1). */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeWordiplyCtx({ setup: SETUP, ...facts })
}

/** A coop game whose five words are spent: a win, every player ranked first. */
function coopEnded(events: ZTest_GameDataFacts['events']): ZTest_GameDataFacts {
  return {
    events,
    // Five words played is no result: nobody ranked, everyone neutral.
    players: [{ ...ME, outcome: 'neutral' }],
    ending: { reason: 'resource_exhausted', detail: 'complete', by: 'u1' },
    outcome: 'neutral',
  }
}

/** A race that ended with nobody scoring, for its reason. */
function raceLost(reason: 'conceded' | 'timeout' | 'resource_exhausted'): ZTest_GameDataFacts {
  return {
    mode: 'compete',
    // Everyone conceding leaves every player conceded; otherwise nobody scored.
    players: reason === 'conceded'
      ? [{ ...ME, ...ZTest_CONCEDED }, { ...MOTH, ...ZTest_CONCEDED }]
      : [{ ...ME, outcome: 'lost' }, { ...MOTH, outcome: 'lost' }],
    ending: { reason, detail: reason, by: null },
    outcome: 'lost',
  }
}

/** A race moth won: their words and mine, both now on show. */
function raceMothWon(events: ZTest_GameDataFacts['events']): ZTest_GameDataFacts {
  return {
    mode: 'compete',
    events,
    players: [{ ...ME, outcome: 'near', finalRanking: 2 }, { ...MOTH, outcome: 'won', finalRanking: 1 }],
    ending: { reason: 'resource_exhausted', detail: 'complete', by: 'u2' },
    outcome: 'won',
  }
}

const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
}

/** The board is the first <ol> in the DOM (BoardCol renders before InfoCol). */
function boardRowCount(container: HTMLElement): number {
  const board = container.querySelector('ol')
  return board ? board.querySelectorAll(':scope > li').length : 0
}

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
const edgeFn = runEdgeFn as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what every
 *  call site branches on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown) => ({
  data: {
    type: 'ok', data, outcome: null, severity: null,
    message: null, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would
 *  draw, keyed by action id. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Only the tests whose subject is a keystroke need it — a bare `render` binds
 *  the actions but has nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped, so two keys fired in one tick would land one. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** The running length badge on the active row — the one readout of what has
 *  been typed so far, since the letters themselves are fragmented across spans. */
const typedLength = () =>
  document.querySelector('ol li[class*="active"] span[aria-label$="letters"]')?.textContent ?? ''

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button').state

/** The board row holding this word, whatever marks it is wearing. */
const rowFor = (word: string) =>
  [...document.querySelectorAll('ol > li')].find((li) =>
    (li.textContent ?? '').toLowerCase().includes(word),
  ) as HTMLElement | undefined

/** The lengths on the board's landed lines, in order. Asked of the BOARD, not
 *  the page: the log shows the same words. */
const boardLengths = () =>
  within(document.querySelector('[data-board]') as HTMLElement)
    .queryAllByLabelText(/letters$/)
    .map((el) => el.textContent)

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  edgeFn.mockReset()
})

describe('wordiply PlayArea — layout stability', () => {
  it('always renders exactly 5 guess rows (empty board)', () => {
    const { container } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(boardRowCount(container)).toBe(5)
    // The base is shown plainly (no "Starter" label), in the data's case; CSS
    // draws its capitals.
    expect(screen.getByText('ar', { exact: true })).toBeInTheDocument()
  })

  it('still renders 5 rows with some guesses landed, and a length badge per guess', () => {
    const { container } = render(
      <PlayAreaLoader {...makeCtx({ events: [ZTest_guess(1, 'u1', 'bar'), ZTest_guess(2, 'u1', 'stars')] })} />,
    )
    expect(boardRowCount(container)).toBe(5)
    // The one live readout — each guess's length badge. Queried by its aria
    // label, not bare text: the event log shows the same lengths in its own
    // column, so plain getByText('3') matches twice.
    expect(screen.getByLabelText('3 letters')).toBeInTheDocument() // bar
    expect(screen.getByLabelText('5 letters')).toBeInTheDocument() // stars
  })
})

describe('wordiply PlayArea — length-only during play', () => {
  it('shows guesses n/5 but NO score % or letter count mid-game', () => {
    render(<PlayAreaLoader {...makeCtx({ events: [ZTest_guess(1, 'u1', 'bar')] })} />)
    expect(screen.getByText(/\/ 5 guesses/)).toBeInTheDocument()
    // The score bar's anchor ("best N / possible M") + the reveal are absent.
    expect(screen.queryByText(/possible/i)).toBeNull()
    expect(screen.queryByText(/letters across/i)).toBeNull()
  })

  it('compete OpponentStrip shows Guesses (not a score) mid-game', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [ME, MOTH] })} />)
    expect(screen.getByText('Guesses:')).toBeInTheDocument()
  })
})

describe('wordiply PlayArea — the end-of-game reveal', () => {
  /** A coop game ended on 'bar' and 'stars': longest 5 of 7 → 71%, 8 letters. */
  const ended = () => makeCtx(coopEnded([ZTest_guess(1, 'u1', 'bar'), ZTest_guess(2, 'u1', 'stars')]))

  it('KEEPS the keyboard once ended, disabled rather than removed', () => {
    // Unmounting it would drop about 12.4rem of column on the frame a player
    // starts reading their verdict. BOTH halves are pinned: on screen, and its
    // caps refusing input — asserting only the first would pass with the
    // disabling dropped entirely.
    render(<PlayAreaLoader {...ended()} />)
    const keyboard = screen.getByLabelText('Keyboard')
    expect(keyboard).toBeInTheDocument()
    for (const cap of within(keyboard).getAllByRole('button')) {
      expect(cap).toBeDisabled()
    }
  })

  it('scores the game WITHOUT naming the best word', () => {
    // The two readouts say how well you did, and the word itself waits to be
    // asked for, so a table can keep guessing at it.
    render(<PlayAreaLoader {...ended()} />)
    expect(screen.getByText('71%')).toBeInTheDocument()
    expect(screen.getByText(/possible 7/)).toBeInTheDocument()
    expect(screen.queryByText(/Best possible word/)).not.toBeInTheDocument()
    expect(screen.queryByText('HANGARS')).not.toBeInTheDocument()
  })

  it('coop\'s five words spent reads Ended with the length score, as no result', () => {
    render(<PlayAreaLoader {...ended()} />)
    expect(screen.getByText('Ended: 71%')).toBeInTheDocument()
    expect(screen.getByText('Ended (71%)')).toBeInTheDocument()
    expect(document.querySelector('[class*="endingFrame_neutral"]')).not.toBeNull()
  })

  it('Reveal names the longest possible word, click-to-define, with no RPC', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ended()} />)

    await user.click(screen.getByRole('button', { name: 'Reveal best solution' }))
    expect(screen.getByText(/Best possible word/)).toBeInTheDocument()
    // Click-to-define, selected by `data-word` — the handle every definable
    // word carries.
    expect(document.querySelector('[data-word="hangars"]')).toHaveTextContent('HANGARS')
    // Local state: nothing was written.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides it again', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...ended()} />)

    await user.click(screen.getByRole('button', { name: 'Reveal best solution' }))
    await user.click(screen.getByRole('button', { name: 'Hide best solution' }))
    expect(screen.queryByText(/Best possible word/)).not.toBeInTheDocument()
  })

  it('a race once ended shows the rivals\' words but keeps my board to my own', () => {
    // I (u1) played 'bar'; moth (u2) played 'stars' + 'cart'.
    render(
      <PlayAreaLoader
        {...makeCtx(raceMothWon([
          ZTest_guess(1, 'u1', 'bar'),
          ZTest_guess(2, 'u2', 'stars'),
          ZTest_guess(3, 'u2', 'cart'),
        ]))}
      />,
    )
    // DimmedBaseWord fragments each word across spans, so read the section's
    // textContent — in the data's case, since CSS draws the capitals.
    const section = screen.getByRole('heading', { name: /Opponents’ words/i }).closest('section')!
    expect(section.textContent).toContain('moth')
    expect(section.textContent).toContain('stars')
    expect(section.textContent).toContain('cart')
    // My own word is on my board, not in the reveal.
    expect(section.textContent).not.toContain('bar')
    expect(boardLengths()).toEqual(['3'])
  })
})

/**
 * The race's endings, each with its own words. The scores in them are the
 * builder's, written with the ending.
 */
describe('wordiply PlayArea — the race\'s verdicts', () => {
  it('all conceded says so', () => {
    render(<PlayAreaLoader {...makeCtx(raceLost('conceded'))} />)
    expect(screen.getAllByText('Conceded').length).toBeGreaterThan(0)
  })

  it('a nobody-scored timeout says no words were found', () => {
    render(<PlayAreaLoader {...makeCtx(raceLost('timeout'))} />)
    expect(screen.getByText('Lost: no words found')).toBeInTheDocument()
  })

  it('every guess spent with nobody scoring says no words were found', () => {
    render(<PlayAreaLoader {...makeCtx(raceLost('resource_exhausted'))} />)
    expect(screen.getByText('Lost: no words found')).toBeInTheDocument()
  })

  it('a Stop stays neutral', () => {
    // A Stop writes every player neutral.
    render(<PlayAreaLoader {...makeCtx({
      mode: 'compete',
      players: [{ ...ME, outcome: 'neutral' }, { ...MOTH, outcome: 'neutral' }],
      ...STOPPED,
    })} />)
    expect(screen.getByText('Stopped — no winner')).toBeInTheDocument()
  })

  it('a place below first says what lost it', () => {
    render(<PlayAreaLoader {...makeCtx(raceMothWon([
      ZTest_guess(1, 'u1', 'bar'),
      ZTest_guess(2, 'u2', 'stars'),
    ]))} />)
    // moth's longest is 5 letters to my 3: a shorter word.
    expect(screen.getByText('2nd: shorter word')).toBeInTheDocument()
    expect(screen.getByText('2nd (shorter word)')).toBeInTheDocument()
  })

  // The confetti is MY win, read off my own outcome, at the moment it lands —
  // a page mounted into a game already won does not throw it.
  it('celebrates the race I won, at the moment it ends, and the verdict is mine', () => {
    const race: ZTest_GameDataFacts = { mode: 'compete', events: [ZTest_guess(1, 'u1', 'stars')], players: [ME, MOTH] }
    const { rerender } = render(<PlayAreaLoader {...makeCtx(race)} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <PlayAreaLoader
        {...makeCtx({
          ...race,
          players: [{ ...ME, outcome: 'won', finalRanking: 1 }, { ...MOTH, outcome: 'near', finalRanking: 2 }],
          ending: { reason: 'resource_exhausted', detail: 'complete', by: 'u1' },
          outcome: 'won',
        })}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'You win! 🎉' })).toBeInTheDocument()
    expect(screen.getAllByText('Won').length).toBeGreaterThan(0)
    expect(screen.getByText('71% (won)')).toBeInTheDocument()
  })

  it('coop\'s five words played throw no confetti: it is no result', () => {
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ events: [ZTest_guess(1, 'u1', 'stars')] })} />)
    rerender(<PlayAreaLoader {...makeCtx(coopEnded([ZTest_guess(1, 'u1', 'stars')]))} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('wordiply PlayArea — the turn arriving', () => {
  it('flashes the board when the move becomes mine, and not on mount', () => {
    const board = () => document.querySelector('[data-board]')!
    const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], turnHolderId: 'u2' })} />)
    // An EVENT, so never on mount: opening a game on your own turn is not
    // being handed it.
    expect(board().className).not.toMatch(/yourTurnFlash/)
    rerender(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], turnHolderId: 'u1' })} />)
    expect(board().className).toMatch(/yourTurnFlash/)
  })
})

describe('wordiply PlayArea — a racer out while the race goes on', () => {
  it('a conceder sees their concession, with Stop for all and no Concede', () => {
    // Conceding is closed to a player already out; stopping the game for all is
    // open to anyone in it, so the row's flag is Stop.
    render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />,
    )
    expect(screen.getByText('Conceded (game continues)')).toBeInTheDocument()
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
  })

  it('a racer who is out can still go back to the club, and sees Reveal grayed', () => {
    render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_SPENT }, MOTH] })} />,
    )
    expect(document.querySelector('button[data-action="act-back-to-club"]')).not.toBeNull()
    // The best word waits for the race's end, so a racer still racing keeps it.
    expect(document.querySelector('button[data-action="act-reveal"]')).toBeDisabled()
  })

  it('a racer whose five are spent is told they are waiting', () => {
    render(
      <PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_SPENT }, MOTH] })} />,
    )
    expect(screen.getByText('Finished: waiting on the rest')).toBeInTheDocument()
    expect(screen.getByText('Finished (waiting on the rest)')).toBeInTheDocument()
  })
})

/**
 * The event log — wordiply's answer to "who guessed what?", and the surface that
 * makes recording rejects worth doing. What matters is the SPLIT: rejects belong
 * in the log and nowhere else, so a rejected word must never reach the board,
 * the guesses-used count, or any score.
 */
describe('wordiply PlayArea — event log', () => {
  it('shows accepted and rejected guesses together, with the reason', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          events: [
            ZTest_guess(1, 'u1', 'cart'),
            ZTest_guess(2, 'u1', 'arqqq', 'not_a_word'),
            ZTest_guess(3, 'u1', 'zzzz', 'missing_base'),
          ],
        })}
      />,
    )
    expect(screen.getByText('CART')).toBeInTheDocument()
    expect(screen.getByText('ARQQQ')).toBeInTheDocument()
    expect(screen.getByText('not a word')).toBeInTheDocument()
    expect(screen.getByText('no base')).toBeInTheDocument()
  })

  it('keeps rejected guesses OUT of the guesses-used count', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          events: [
            ZTest_guess(1, 'u1', 'cart'),
            ZTest_guess(2, 'u1', 'arqqq', 'not_a_word'),
            ZTest_guess(3, 'u1', 'arwww', 'not_a_word'),
          ],
        })}
      />,
    )
    // One accepted guess of five — the two rejects cost no budget.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/\/ 5 guesses/)).toBeInTheDocument()
  })

  it('offers the whose-guesses picker', () => {
    render(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], events: [ZTest_guess(1, 'u1', 'cart')] })} />)
    expect(screen.getByRole('button', { name: /whose guesses/i })).toBeInTheDocument()
  })

  it("opening a REJECT's #N shows the board without it — the one thing this viewer is for", async () => {
    const user = userEvent.setup()
    render(
      <PlayAreaLoader
        {...makeCtx({
          // CART landed, ARQQQ was refused, MARTS landed after it.
          events: [
            ZTest_guess(1, 'u1', 'cart'),
            ZTest_guess(2, 'u1', 'arqqq', 'not_a_word'),
            ZTest_guess(3, 'u1', 'marts'),
          ],
        })}
      />,
    )

    // Live: CART (4) and MARTS (5) are both down.
    expect(boardLengths()).toEqual(['4', '5'])

    // The reject is row 2 of the log — the number counts the rows on show.
    await user.click(screen.getByText('#2'))

    // The board is the moment ARQQQ was tried: CART down, MARTS not yet.
    expect(boardLengths()).toEqual(['4'])
    // …and the banner names what that row was.
    expect(screen.getByText('ARQQQ — not a word')).toBeInTheDocument()
  })

  it("once a race has ended, a rival's #N replays THEIR board and the banner names them", async () => {
    const user = userEvent.setup()
    render(
      <PlayAreaLoader
        {...makeCtx({
          ...raceLost('resource_exhausted'),
          // Two parallel boards: mine holds CART, moth's holds STARS then HANGARS.
          events: [
            ZTest_guess(1, 'u1', 'cart'),
            ZTest_guess(2, 'u2', 'stars'),
            ZTest_guess(3, 'u2', 'hangars'),
          ],
        })}
      />,
    )

    // Live, the board is MINE — compete is parallel boards.
    expect(boardLengths()).toEqual(['4'])

    // Switch the log to moth.
    await user.click(screen.getByRole('button', { name: /whose guesses/i }))
    await user.click(screen.getByRole('button', { name: 'moth' }))

    // moth's second row — #2 under this filter, and a row I never wrote.
    await user.click(screen.getByText('#2'))

    // The board is moth's, folded from moth's own rows rather than mine.
    expect(boardLengths()).toEqual(['5', '7'])
    // The banner says whose, then what. Read as one string because the actor
    // and the label are siblings in one line.
    const banner = document.querySelector('[data-history-banner]') as HTMLElement
    expect(banner.textContent).toContain('moth')
    expect(banner.textContent).toContain('HANGARS — 7 letters')
  })
})

/**
 * WHO the answer is for, which is the one thing the mark's two beats encode.
 * A teammate's word lands on a row nobody was watching, so it is announced —
 * the attention flash points at the row, and the outcome's color goes on only
 * once that flash has faded. My own word needs no pointing at: I am looking at
 * the row I typed into, so it wears the answer from the first frame.
 */
describe('wordiply PlayArea — whose word is announced', () => {
  it("announces a teammate's word: the flash first, then the answer's color", () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH] })} />)

      // moth's word arrives with the next blob, onto the shared coop board.
      act(() =>
        rerender(<PlayAreaLoader {...makeCtx({ players: [ME, MOTH], events: [ZTest_guess(1, 'u2', 'stars')] })} />),
      )

      const row = rowFor('stars') as HTMLElement
      expect(row.className).toMatch(/attentionFlash/)
      expect(row.className).not.toMatch(/answered/)

      // Once the flash has faded, the answer — never under a flash still on
      // top of it.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
      expect((rowFor('stars') as HTMLElement).className).toMatch(/answered/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers my own word without announcing it', async () => {
    vi.useFakeTimers()
    try {
      rpc.mockResolvedValue(okEnvelope({ result: 'accepted' }))
      render(<WithKeys {...makeCtx()} />)
      await press({ key: 'b' })
      await press({ key: 'a' })
      await press({ key: 'r' })
      await press({ key: 'Enter', code: 'Enter' })
      // Let the answer arrive: the mock resolves in microtasks, not on a timer,
      // so no fake time passes here — which is the whole point of the assertion
      // below.
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      // The held row wears the answer from the FIRST frame, with no flash ever
      // pointing at a row the player is already looking at.
      const row = rowFor('bar') as HTMLElement
      expect(row.className).toMatch(/answered/)
      expect(row.className).not.toMatch(/attentionFlash/)
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * The entry, from the keyboard down. wordiply has no <input>: letters land in
 * the active row through the capture-entry actions (`useCaptureKeys`), and the
 * two history arrows come from `useArrowHistory`. Every press here goes through
 * the app-root dispatcher, so what is asserted is the wiring the key list
 * advertises rather than a handler called by hand.
 */
describe('wordiply PlayArea — the entry keys', () => {
  it('letters type into the active row and ⌫ takes the last one back', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(typedLength()).toBe('')

    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    expect(typedLength()).toBe('3')

    await press({ key: 'Backspace', code: 'Backspace' })
    expect(typedLength()).toBe('2')
  })

  it('Enter submits a legal guess through submit_guess', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted' }))
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_word: 'bar' }),
    )
    // The entry is consumed by the submit, so the row is empty again.
    expect(typedLength()).toBe('')
  })

  it('a word the list lacks is recorded as a reject', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'rejected', reason: 'not_a_word' }))
    render(<WithKeys {...makeCtx()} />)
    await press({ key: 'a' })
    await press({ key: 'r' })
    await press({ key: 'q' })
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_word: 'arq', p_fe_legal: false }),
    )
  })

  it('Enter with nothing typed is disabled, and ⌫ too', async () => {
    render(<WithKeys {...makeCtx()} />)
    expect(stateOf('act-submit')).toBe('disabled')
    expect(stateOf('act-delete-last')).toBe('disabled')
    await press({ key: 'Enter', code: 'Enter' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('↑ recalls the last entry and ↓ clears it', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted' }))
    render(<WithKeys {...makeCtx()} />)
    // Nothing submitted yet: recall has nothing to bring back, and says so.
    expect(stateOf('act-recall-last')).toBe('disabled')

    await press({ key: 'b' })
    await press({ key: 'a' })
    await press({ key: 'r' })
    await press({ key: 'Enter', code: 'Enter' })
    expect(typedLength()).toBe('')

    await press({ key: 'ArrowUp', code: 'ArrowUp' })
    expect(typedLength()).toBe('3')
    await press({ key: 'ArrowDown', code: 'ArrowDown' })
    expect(typedLength()).toBe('')
  })

  // `disabled`, not `hidden`: typing IS one of this game's keys, and Help
  // teaches a game's keys rather than mirroring what is pressable this instant,
  // so the row stays in the list after the game ends. What it cannot do is act.
  it('a finished game takes no letters, and still lists the key', async () => {
    render(<WithKeys {...makeCtx(STOPPED)} />)
    expect(stateOf('act-type-letter')).toBe('disabled')
    await press({ key: 'b' })
    expect(typedLength()).toBe('')
  })
})

/**
 * The commands — `+`, `⌥⌫` and Restart — through the dispatcher, with the real
 * confirmation host mounted where a question is expected. A question that
 * appears with no host is answered no, so the host is what lets these prove the
 * question was asked rather than skipped.
 */
describe('wordiply PlayArea — new game, stop, concede and restart', () => {
  const created = { type: 'ok', data: { result: 'created', id: 'fresh-game-id' } }

  it('+ once ended starts the follow-up game with no question', async () => {
    edgeFn.mockResolvedValue(created)
    const ctx = makeCtx(STOPPED)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the edge function firing proves none was asked.
    await waitFor(() =>
      expect(edgeFn).toHaveBeenCalledWith('wordiply-build-board', {
        target_club: 'testclub',
        setup: SETUP,
        player_user_ids: ['u1'],
        mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('fresh-game-id'))
  })

  it('+ mid-game asks first, and cancel starts nothing', async () => {
    const user = userEvent.setup()
    edgeFn.mockResolvedValue(created)
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: '+' })
    expect(await screen.findByText('Start a new game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    await waitFor(() => expect(screen.queryByText('Start a new game?')).not.toBeInTheDocument())
    expect(edgeFn).not.toHaveBeenCalled()
  })

  it('⌥⌫ in coop asks Stop game’s question; yes calls stop_game', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'ended' }))
    render(
      <>
        <WithKeys {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Stop this game?')).toBeInTheDocument()
    // The trigger and the modal's confirm share the name; the confirm is the
    // one the dialog adds, so it's last in the DOM.
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: [ME, MOTH] })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('Restart mid-game asks, and goes straight through once ended', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'replayed' }))
    const live = makeCtx()
    const { unmount } = render(
      <>
        <PlayAreaLoader {...live} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(live).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
    unmount()

    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    // No host this time: the RPC firing proves no question was asked.
    await user.click(document.querySelector('button[data-action="act-restart"]')!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
  })
})

describe('wordiply PlayArea — the menu', () => {
  it('lists Help, Reveal, New game, the exit and Back to club', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    const rows = menuItems(ctx)
    for (const id of ['act-help', 'act-reveal', 'act-new-game', 'act-restart', 'act-stop-game', 'act-back-to-club']) {
      expect(rows.get(id), id).toBeDefined()
      expect(rows.get(id)!.hidden, id).toBe(false)
    }
    // Both exits are placed; a coop game's Concede hides itself.
    expect(rows.get('act-concede')?.hidden).toBe(true)
    // Reveal is inert mid-game, and keeps its words rather than falling back to
    // the registry's bare "Reveal".
    expect(rows.get('act-reveal')?.disabled).toBe(true)
    expect(rows.get('act-reveal')?.label).toBe('Reveal best solution')
  })

  it('a race lists Concede as the exit, not Stop game', () => {
    const ctx = makeCtx({ mode: 'compete', players: [ME, MOTH] })
    render(<PlayAreaLoader {...ctx} />)
    expect(menuItems(ctx).get('act-concede')?.hidden).toBe(false)
    expect(menuItems(ctx).get('act-stop-game')?.hidden).toBe(true)
  })

  it('while I play the row is the exit and Back to club; Reveal has no button', () => {
    render(<PlayAreaLoader {...makeCtx()} />)
    expect(document.querySelector('button[data-action="act-reveal"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
    expect(document.querySelector('button[data-action="act-back-to-club"]')).not.toBeNull()
  })

  it('once ended, the row reads Reveal, Restart, New game, then Back to club', () => {
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    const ids = [...document.querySelectorAll('button[data-action]')]
      .map((b) => b.getAttribute('data-action'))
      .filter((id) => ['act-reveal', 'act-restart', 'act-new-game', 'act-back-to-club'].includes(id!))
    expect(ids).toEqual(['act-reveal', 'act-restart', 'act-new-game', 'act-back-to-club'])
  })

  it('New game has no button mid-game, and one once ended', () => {
    const { unmount } = render(<PlayAreaLoader {...makeCtx()} />)
    expect(document.querySelector('button[data-action="act-new-game"]')).toBeNull()
    unmount()
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    expect(document.querySelector('button[data-action="act-new-game"]')).not.toBeNull()
  })
})
