// cs-unmet

/**
 * Render + behavior tests for stackdown's PlayArea: the concede flow beside
 * coop's Stop, the hint ladder, the turn-history viewer, the game menu, the
 * ending's solution reveal, the board's keys and a teammate's word on the board.
 *
 * The surface is a pure function of the `game_data` blob the page hands it, so
 * a test builds that blob from the game's facts (`ZTest_makeStackdownCtx`) and
 * nothing is mocked but `db`; the board, the entry row, the opponent strip and
 * the log all render real. A move that lands is shown by handing the page the
 * next blob, the way the page re-reads it.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useActionDispatcher } from '@/common/actions/useActionDispatcher'
import { getActions } from '@/common/actions/actionsStore'
import { ConfirmationHost } from '@/common/floating-panels/ConfirmationHost'
import { menuRow, type MenuSection } from '@/common/menu/menuModel'
import { ATTENTION_FADE_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { db } from '../db'
import {
  ZTest_CONCEDED,
  ZTest_hint,
  ZTest_makeStackdownCtx,
  ZTest_word,
  type ZTest_GameDataFacts,
  type ZTest_PlayerFacts,
} from '../lib/gameData.fixture'
import type { GTile } from '../types'
import { PlayAreaLoader } from './PlayArea'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
vi.mock('@/common/supabase/db', () => ({ db: { rpc: vi.fn() } }))

const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

const ME: ZTest_PlayerFacts = { id: 'u1', username: 'me', color: 'red' }
const MOTH: ZTest_PlayerFacts = { id: 'u2', username: 'moth', color: 'blue' }
const TWO = [ME, MOTH]

/** Tiles in a row on one layer, each lettered and numbered from 1. */
function makeRow(letters: string, z = 0): GTile[] {
  return [...letters].map((letter, i) => ({ id: String(i + 1), letter, x: i * 2, y: 0, z }))
}

/** A play surface's context: a solo coop game in play on setup.psql's stack,
 *  built from the facts the way the builder would build it. */
function makeCtx(facts: ZTest_GameDataFacts = {}): PlayAreaLoaderProps {
  return ZTest_makeStackdownCtx(facts)
}

/** A game that has ended with nobody winning: a Stop. */
const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
  outcome: 'neutral',
  players: [{ ...ME, outcome: 'neutral' }],
}
/** A solo coop game the clock beat. */
const SOLO_LOST: ZTest_GameDataFacts = {
  ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
  outcome: 'lost',
  players: [{ ...ME, outcome: 'lost' }],
}

/** What PlayArea handed `menu.setGameSections`, as the ROWS the menu would draw
 *  — a row is an action now, so its words, glyph and availability come from
 *  the action rather than from the list. */
function menuItems(ctx: PlayAreaLoaderProps) {
  const setSections = ctx.menu.setGameSections as unknown as ReturnType<typeof vi.fn>
  const sections = (setSections.mock.calls.at(-1)?.[0] ?? []) as MenuSection[]
  return new Map(sections.flatMap((s) => s.items).map(menuRow).map((r) => [r.id, r]))
}

/** PlayArea under the app-root key dispatcher, which App.tsx mounts for real.
 *  Any test that TYPES needs it: the board's tile keys are actions, and a
 *  bare `render` binds them with nothing feeding them keys. */
function WithKeys(props: React.ComponentProps<typeof PlayAreaLoader>) {
  useActionDispatcher()
  return <PlayAreaLoader {...props} />
}

/** A keystroke at the page, the way a player types with nothing focused.
 *  Awaited, because an action's run is single-flight: a second press before the
 *  first has settled is dropped. */
const press = (init: KeyboardEventInit) =>
  act(async () => {
    fireEvent.keyDown(document.body, init)
  })

/** Type each letter as its own keystroke. */
async function typeLetters(letters: string) {
  for (const key of letters) await press({ key })
}

/** An `ok` envelope in the shape `runRpc` unwraps — `data.result` is what the
 *  call sites branch on, so a stub without it is an answer they scream at. */
const okEnvelope = (data: unknown, outcome: string | null = null, message: string | null = null) => ({
  data: {
    type: 'ok', data, outcome, severity: null,
    message, field: null, meta: null, dbcode: null, detail: null,
  },
  error: null,
})

/** What an action says about itself right now. */
const stateOf = (id: string) => getActions().find((b) => b.id === id)?.describe('button').state

/** The five word slots, as the letters they hold. */
const wordSlots = () => screen.getByLabelText('Current word').textContent ?? ''

/** The board's tile bearing this letter — the slot row's letters are inside
 *  `Current word`, so a tile is the one outside it. */
const tileFor = (letter: string) =>
  screen.queryAllByText(letter)
    .map((el) => el.parentElement as HTMLElement)
    .find((el) => !el.closest('[aria-label="Current word"]'))

/** The "#N" handle in the log row holding `cell` — by its marker, never by its
 *  wording. */
const handleIn = (cell: HTMLElement) =>
  within(cell.closest('tr')!).getByText(/^#\d+$/)

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null, data: null })
})

describe('stackdown PlayArea — concede', () => {
  it('compete shows Concede and calls stackdown.concede on click', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx({ mode: 'compete', players: TWO })} />
        <ConfirmationHost />
      </>,
    )
    // The trigger and the modal's confirm share the name "Concede"; the confirm
    // is the one the dialog adds, so it's last in the DOM.
    await user.click(screen.getByRole('button', { name: /concede/i }))
    const confirms = await screen.findAllByRole('button', { name: /concede/i })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('coop shows Stop (not Concede) and calls stop_game', async () => {
    const user = userEvent.setup()
    render(
      <>
        <PlayAreaLoader {...makeCtx()} />
        <ConfirmationHost />
      </>,
    )
    expect(screen.queryByRole('button', { name: /concede/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop game' }))
    const confirms = await screen.findAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('marks a conceded opponent "out" in the strip (mid-game)', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [ME, { ...MOTH, ...ZTest_CONCEDED }] })} />)
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it('shows the "You conceded" look after I concede', () => {
    render(<PlayAreaLoader {...makeCtx({ mode: 'compete', players: [{ ...ME, ...ZTest_CONCEDED }, MOTH] })} />)
    expect(screen.getByText('You conceded')).toBeInTheDocument()
    // The one flag: conceding is spent, and stopping the game for all is open to
    // anyone in it, so Stop takes Concede's place.
    expect(document.querySelector('button[data-action="act-concede"]')).toBeNull()
    expect(document.querySelector('button[data-action="act-stop-game"]')).not.toBeNull()
  })
})

describe('stackdown PlayArea — hint', () => {
  it('surfaces the clue when the next word has a hint', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx()} />)
    rpc.mockResolvedValueOnce(okEnvelope({ result: 'hint', hint: 'a fruit' }, 'warning'))
    await user.click(screen.getByRole('button', { name: 'Hint for next word' }))
    expect(rpc).toHaveBeenCalledWith('reveal_next_hint', { p_game_id: 'g1' })
    expect(await screen.findByText('Hint: a fruit')).toBeInTheDocument()
  })

  it("a not-ok answer shows the server's sentence, not a hint line", async () => {
    // There is no "no hint for this word" answer — a hintless word is a fault
    // the server shouts about — so what a player can actually meet here is the
    // game ending mid-request.
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx()} />)
    rpc.mockResolvedValueOnce({
      data: {
        type: 'not-ok', data: null, outcome: null, severity: 'race',
        message: 'Game over', field: null, meta: null, dbcode: 'PN486', detail: null,
      },
      error: null,
    })
    await user.click(screen.getByRole('button', { name: 'Hint for next word' }))
    expect(await screen.findByText('Game over')).toBeInTheDocument()
    expect(screen.queryByText(/^Hint:/)).not.toBeInTheDocument()
  })
})

/**
 * Turn-history viewer (docs/playarea.md). Clicking a log row replays that
 * turn's board; a keystroke / click returns to live. These prove the
 * cross-column seam is wired right — the replay itself is unit-tested in
 * lib/history.test.ts. Eight uniquely-lettered tiles so a single cleared tile
 * can be probed by its letter (L is in the cleared word CLEAR, not in the
 * remaining M/O/T).
 */
describe('stackdown PlayArea — turn-history viewer', () => {
  // moth cleared CLEAR, then I asked for a hint.
  const facts: ZTest_GameDataFacts = {
    tiles: makeRow('CLEARMOT'),
    players: TWO,
    events: [
      ZTest_word(2, 'u2', 'clear', ['1', '2', '3', '4', '5'], true),
      ZTest_hint(3, 'u1', 'a fruit'),
    ],
  }

  // The keystroke half needs the dispatcher: exiting the viewer is the hook's
  // own action, and the board's tile keys go DISABLED while a turn is open so
  // the press falls through to it.
  it('clicking a word row replays that turn; a keystroke returns to live', async () => {
    const user = userEvent.setup()
    render(<WithKeys {...makeCtx(facts)} />)

    // Live: CLEAR's tiles are off the board (L is one of them).
    expect(screen.queryByText('L')).not.toBeInTheDocument()

    await user.click(handleIn(screen.getByText('CLEAR')))

    // Viewing it: the banner says what it did, and CLEAR's tiles are back on
    // the board (nothing was cleared before it).
    expect(screen.getByText('Cleared CLEAR')).toBeInTheDocument()
    expect(screen.getByText('L')).toBeInTheDocument()

    // Any key returns to live — the banner clears and the tiles leave again.
    await user.keyboard('x')
    expect(screen.queryByText('Cleared CLEAR')).not.toBeInTheDocument()
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })

  it('viewing a later (hint) turn shows the board AS OF that turn — earlier word already cleared', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(facts)} />)

    await user.click(handleIn(screen.getByText('Hint: a fruit')))

    // The hint's description now also appears in the banner (log row + banner).
    expect(screen.getAllByText('Hint: a fruit')).toHaveLength(2)
    // A hint cleared nothing, and CLEAR (before it) had — so the board then
    // still has CLEAR's tiles OFF (strictly-before boundary).
    expect(screen.queryByText('L')).not.toBeInTheDocument()
  })
})

describe('stackdown PlayArea — the game menu names the cheat glyphs', () => {
  // Both cheats are ICON-ONLY buttons in the info column, so the menu row is the
  // only place their lightbulb and bare eye get named (docs/ui.md → the menu is
  // the legend) — a row without its glyph would teach nothing.
  it('offers Hint + Spoiler rows carrying their glyphs, wired to the same RPCs', async () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.label).toBe('Hint for next word')
    expect(items.get('act-hint')?.icon).toBeTruthy()
    expect(items.get('act-spoiler')?.label).toBe('Cheat for next word')
    expect(items.get('act-spoiler')?.icon).toBeTruthy()

    items.get('act-hint')?.run()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reveal_next_hint', { p_game_id: 'g1' }))
    items.get('act-spoiler')?.run()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('reveal_next_word', { p_game_id: 'g1' }))
  })

  it('grays the pair once the game has ended — disabled, never dropped, so the glyph still reads', () => {
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)
    const items = menuItems(ctx)
    expect(items.get('act-hint')?.disabled).toBe(true)
    expect(items.get('act-spoiler')?.disabled).toBe(true)
  })
})

/**
 * The ending's solution reveal — the six words, and the fact that seeing them
 * is a LOCAL, reversible choice (useSolutionReveal). Nothing autoreveals to a
 * player who did not clear the stack: `replay_board` runs this very stack back
 * with the same solution, so an answer left in front of them would make Restart
 * theater. The player who DID clear it starts looking at the words.
 */
describe('stackdown PlayArea — the solution reveal', () => {
  it('hides the words at an ending NOBODY cleared', () => {
    render(<PlayAreaLoader {...makeCtx(STOPPED)} />)
    expect(screen.queryByText(/EAGLE/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
  })

  it('a coop WIN shows them unasked — the stack was cleared, so you saw all six', () => {
    render(
      <PlayAreaLoader
        {...makeCtx({
          ending: { reason: 'reached_goal', detail: 'cleared', by: 'u1', winner: null },
          outcome: 'won',
          players: [{ ...ME, outcome: 'won', finalRanking: 1, solvedAt: '2026-09-03T00:00:00Z' }],
        })}
      />,
    )
    expect(screen.getByText(/EAGLE/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution already shown' })).toBeDisabled()
  })

  it('Reveal shows them for me alone — no RPC, nothing written', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getByText(/EAGLE/)).toBeInTheDocument()
    // The absent RPC is the assertion: no peer's board opened.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('the same button hides them again, restoring the column as the game ended', async () => {
    const user = userEvent.setup()
    render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    await user.click(screen.getByRole('button', { name: 'Hide solution' }))
    expect(screen.queryByText(/EAGLE/)).not.toBeInTheDocument()
  })

  it('the menu twin is the same toggle and flips its label along with it', async () => {
    const ctx = makeCtx(SOLO_LOST)
    render(<PlayAreaLoader {...ctx} />)

    expect(menuItems(ctx).get('act-reveal')?.label).toBe('Reveal solution')
    act(() => menuItems(ctx).get('act-reveal')!.run())
    expect(screen.getByText(/EAGLE/)).toBeInTheDocument()
    await waitFor(() => expect(menuItems(ctx).get('act-reveal')?.label).toBe('Hide solution'))
  })

  it('the menu twin is inert before the game is over for everyone', () => {
    const ctx = makeCtx()
    render(<PlayAreaLoader {...ctx} />)
    // Nothing to show: the words aren't in the blob until the game ends, so a
    // player who dropped out can't spoil a race still running.
    expect(menuItems(ctx).get('act-reveal')?.disabled).toBe(true)
  })

  it('a Restart puts the words away again', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PlayAreaLoader {...makeCtx(SOLO_LOST)} />)

    await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
    expect(screen.getByText(/EAGLE/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('replay_board', { p_game_id: 'g1' }))
    // The same stack and the same six words — and nothing on the server
    // remembers the reveal, so the re-hide is local and explicit.
    rerender(<PlayAreaLoader {...makeCtx()} />)
    expect(screen.queryByText(/EAGLE/)).not.toBeInTheDocument()
  })
})

/** The board's three keys, through the dispatcher, on five exposed,
 *  uniquely-lettered tiles, so a letter names exactly one. */
describe('stackdown PlayArea — the board keys', () => {
  const FIVE: ZTest_GameDataFacts = { tiles: makeRow('CLEAR') }

  it('a letter picks the exposed tile bearing it, and the word grows', async () => {
    render(<WithKeys {...makeCtx(FIVE)} />)
    expect(wordSlots()).toBe('')
    await press({ key: 'a' })
    expect(wordSlots()).toBe('A')
  })

  // Two exposed tiles bear the letter, so the board cannot pick for you. It
  // rings the candidates — the rings ARE the question.
  it('rings both candidates when a letter is ambiguous, and picks neither', async () => {
    render(<WithKeys {...makeCtx({ tiles: makeRow('RR') })} />)
    await press({ key: 'r' })
    expect(wordSlots()).toBe('')
    expect(document.querySelectorAll('[data-tile][class*="flash"]').length).toBe(2)
  })

  it('a letter no exposed tile bears is refused in the pill', async () => {
    render(<WithKeys {...makeCtx(FIVE)} />)
    await press({ key: 'z' })
    expect(wordSlots()).toBe('')
    expect(screen.getByText('No “Z” tile is on top')).toBeInTheDocument()
  })

  it('⌫ returns the last tile, and is gray with nothing picked up', async () => {
    render(<WithKeys {...makeCtx(FIVE)} />)
    expect(stateOf('act-delete-last')).toBe('disabled')

    await typeLetters('cl')
    expect(stateOf('act-delete-last')).toBe('active')
    await press({ key: 'Backspace', code: 'Backspace' })
    expect(wordSlots()).toBe('C')
  })

  it('Enter submits five tiles, and is gray with fewer', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted', word: 'clear' }, 'won'))
    render(<WithKeys {...makeCtx(FIVE)} />)
    await typeLetters('cl')
    expect(stateOf('act-submit')).toBe('disabled')
    await press({ key: 'Enter', code: 'Enter' })
    expect(rpc).not.toHaveBeenCalled()

    await typeLetters('ear')
    expect(stateOf('act-submit')).toBe('active')
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('submit_word', { p_game_id: 'g1', p_tile_ids: [1, 2, 3, 4, 5] }),
    )
  })

  it('takes no pick while the word is with the server', async () => {
    // An answer that never comes: the word stays in flight.
    rpc.mockReturnValue(new Promise(() => {}))
    render(<WithKeys {...makeCtx({ tiles: makeRow('CLEARM') })} />)
    await typeLetters('clear')
    await press({ key: 'Enter', code: 'Enter' })
    expect(stateOf('act-pick-tile')).toBe('disabled')
    await press({ key: 'm' })
    expect(wordSlots()).toBe('CLEAR')
  })

  it('an accepted word leaves the board before the next blob arrives', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'accepted', word: 'clear' }, 'won'))
    render(<WithKeys {...makeCtx({ tiles: makeRow('CLEARM') })} />)
    await typeLetters('clear')
    await press({ key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(wordSlots()).toBe('CLEAR'))
    // The slots flash the word; the board holds its tiles off while the blob
    // that has them cleared is on its way.
    expect(tileFor('L')).toBeUndefined()
    expect(tileFor('M')).toBeDefined()
  })

  it('a refused word answers in the slots, holds its tiles off the board, then sends them home flashing', async () => {
    vi.useFakeTimers()
    try {
      // NOT A WORD: an `ok` whose data says `invalid`, with the outcome and the
      // sentence on the envelope — no tile moved, so nothing was cleared.
      rpc.mockResolvedValue(okEnvelope({ result: 'invalid', word: 'clear' }, 'lost', 'Not a word: CLEAR'))
      render(<WithKeys {...makeCtx(FIVE)} />)
      await typeLetters('clear')
      await press({ key: 'Enter', code: 'Enter' })
      // Let the answer arrive: the mock resolves in microtasks, not on a timer.
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      // The answer, where the eye already is: the slots wear the refusal and
      // shake. The word is still in them — its tiles are NOT back on the board.
      const slotC = within(screen.getByLabelText('Current word')).getByText('C')
      expect(slotC.className).toMatch(/verdictLost/)
      expect(slotC.className).toMatch(/verdictShake/)
      expect(tileFor('C')).toBeUndefined()

      // Held for the whole answer beat, and not a moment less.
      act(() => vi.advanceTimersByTime(WORD_ANSWER_MS - 1))
      expect(tileFor('C')).toBeUndefined()
      act(() => vi.advanceTimersByTime(1))

      // The word is cleared, and the tiles land back on the board wearing the
      // attention flash — the eye follows them home — with the slots' verdict
      // gone.
      expect(wordSlots()).toBe('')
      expect(tileFor('C')!.className).toMatch(/attentionFlash/)
      expect(screen.getByLabelText('Current word').innerHTML).not.toMatch(/verdictLost/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a word a teammate\'s clear took a tile from is gone', async () => {
    const { rerender } = render(<WithKeys {...makeCtx({ tiles: makeRow('CLEARM'), players: TWO })} />)
    await typeLetters('cm')
    expect(wordSlots()).toBe('CM')

    // moth's CLEAR lands, and with it the C I was building with.
    rerender(
      <WithKeys
        {...makeCtx({
          tiles: makeRow('CLEARM'),
          players: TWO,
          events: [ZTest_word(1, 'u2', 'clear', ['1', '2', '3', '4', '5'], true)],
        })}
      />,
    )
    expect(wordSlots()).toBe('')
  })

  it('the result clears on any key, even one nothing binds', async () => {
    render(<WithKeys {...makeCtx(FIVE)} />)
    await press({ key: 'z' })
    expect(screen.getByText('No “Z” tile is on top')).toBeInTheDocument()

    // F9 is nobody's key. The dismiss watcher still runs on it — it claims
    // nothing, so it is consulted on every keystroke there is.
    await press({ key: 'F9', code: 'F9' })
    expect(screen.queryByText('No “Z” tile is on top')).not.toBeInTheDocument()
  })
})

/**
 * The commands through the dispatcher — `+` and `⌥⌫` — with the real
 * confirmation host mounted where a question is expected. A question asked
 * with no host is answered no, so the host is what lets these prove a question
 * was asked rather than skipped.
 */
describe('stackdown PlayArea — + and ⌥⌫ through the dispatcher', () => {
  it('+ once ended claims the next board with no question', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'create_game'
        ? Promise.resolve(okEnvelope({ result: 'created', id: 'next-game-id' }))
        : Promise.resolve({ error: null, data: null }),
    )
    const ctx = makeCtx(SOLO_LOST)
    render(<WithKeys {...ctx} />)
    await press({ key: '+' })
    // No <ConfirmationHost/> is mounted, so a question would have been answered
    // "no" — the RPC firing proves none was asked.
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('create_game', {
        p_club_handle: 'testclub',
        p_setup: { band: 1, timer: { kind: 'none' } },
        p_player_user_ids: ['u1'],
        p_mode: 'coop',
      }),
    )
    await waitFor(() => expect(ctx.goToFollowUpGame).toHaveBeenCalledWith('next-game-id'))
  })

  it('+ mid-game asks first, and cancel claims nothing', async () => {
    const user = userEvent.setup()
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
    expect(rpc).not.toHaveBeenCalled()
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
    const confirms = screen.getAllByRole('button', { name: 'Stop game' })
    await user.click(confirms[confirms.length - 1]!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('stop_game', { p_game_id: 'g1' }))
  })

  it('⌥⌫ in compete asks Concede’s question; yes calls concede', async () => {
    const user = userEvent.setup()
    rpc.mockResolvedValue(okEnvelope({ result: 'conceded' }))
    render(
      <>
        <WithKeys {...makeCtx({ mode: 'compete', players: TWO })} />
        <ConfirmationHost />
      </>,
    )
    await press({ key: 'Backspace', code: 'Backspace', altKey: true })
    expect(await screen.findByText('Concede, or stop the game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Concede' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('concede', { p_game_id: 'g1' }))
  })

  it('Restart mid-game asks before wiping the stack', async () => {
    const user = userEvent.setup()
    const ctx = makeCtx()
    render(
      <>
        <PlayAreaLoader {...ctx} />
        <ConfirmationHost />
      </>,
    )
    act(() => menuItems(ctx).get('act-restart')!.run())
    expect(await screen.findByText('Restart this game?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep playing' }))
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * A teammate's accepted word, end to end on the board: their tiles take the
 * attention flash, then the answer's color, and only then do they go.
 *
 * Fake timers, because the whole sequence is three beats on two clocks.
 */
describe('stackdown PlayArea — a teammate’s word on the board', () => {
  /** Five tiles in a row on the upper layer, with one buried under the first of
   *  them: clearing the five is what makes the sixth reachable. */
  const stacked: GTile[] = [...makeRow('CLEAR', 1), { id: '6', letter: 'Z', x: 0, y: 0, z: 0 }]
  const peerWord = ZTest_word(1, 'u2', 'clear', ['1', '2', '3', '4', '5'], true)

  it('marks their tiles, holds them while the answer shows, then lets them go', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<PlayAreaLoader {...makeCtx({ tiles: stacked, players: TWO })} />)
      expect(tileFor('C')!.className).not.toMatch(/attentionFlash/)

      // moth's word lands: the row arrives and its tiles are gone server-side.
      act(() => rerender(<PlayAreaLoader {...makeCtx({ tiles: stacked, players: TWO, events: [peerWord] })} />))

      // Beat one: the tiles are still on the board, wearing the attention flash.
      expect(tileFor('C')!.className).toMatch(/attentionFlash/)

      // Beat three: the hold ends and the five leave.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + WORD_ANSWER_MS + 10))
      expect(tileFor('C')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stackdown PlayArea — a teammate’s refused word', () => {
  const row = makeRow('CLEAR', 1)

  it('marks their tiles on the board: attention first, then the answer', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<PlayAreaLoader {...makeCtx({ tiles: row, players: TWO })} />)

      // moth tried a word and was refused: the row lands, nothing was cleared.
      const refused = ZTest_word(1, 'u2', 'clear', ['1', '2', '3', '4', '5'], false)
      act(() => rerender(<PlayAreaLoader {...makeCtx({ tiles: row, players: TWO, events: [refused] })} />))
      expect(tileFor('C')!.className).toMatch(/attentionFlash/)

      // Once the flash has faded, the answer: the tiles keep their place (nothing
      // was cleared) and wear the refusal — which shakes.
      act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS + 10))
      const tile = tileFor('C')!
      expect(tile.className).toMatch(/verdictShake/)
      expect(tile.getAttribute('style')).toMatch(/outcomes-lost-fill-color/)
    } finally {
      vi.useRealTimers()
    }
  })
})
