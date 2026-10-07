// cs-blessed-codenamesduet

/**
 * The board's per-tile marks and gates: the bystander lock (a word I hit as a
 * bystander is closed to me, and one my partner hit stays open — it may be my
 * agent; the builder's `guessableBy`), the two key-card squares and the two
 * bystander arrows,
 * and the shared board marks — the in-flight dim, the turn dim and flash, the
 * game-over frame, the attention flash and the shake.
 * The marks are found by their CSS-module class, read off the stylesheet.
 */
import { act, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board } from './Board'
import styles from './Tile.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { ATTENTION_FADE_MS } from '@/common/board-marks/feedbackTiming'
import { makeGameData } from '../hooks/useGame'
import { ZTest_clue, ZTest_guess, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from '../lib/gameData.fixture'
import type { EndOutcome } from '@/common/ending/gameEnding'
import type { GEventRaw, GKey, GPlayer, GTile } from '../types'

const WORDS = Array.from({ length: 25 }, (_, i) => (i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`))
// Tiles 0 and 1 are bystanders on both keys, so each guess there is one.
const KEY: GKey[] = [...'NNGGGGGGGGGAANNNNNNNNNNNN'] as GKey[]
// I (u1) turned apple over as a bystander; my partner (u2) turned berry over.
const BYSTANDERS: GEventRaw[] = [
  ZTest_clue(1, 'u2', 1, 'x', 1),
  ZTest_guess(2, 'u1', 1, 0, 'N'),
  ZTest_clue(3, 'u1', 2, 'y', 1),
  ZTest_guess(4, 'u2', 2, 1, 'N'),
]

/** `gd` for a game on these facts, the bystanders above played, seen by `viewer`. */
function gdOf(viewer = 'u1', over: ZTest_GameDataFacts = {}) {
  return makeGameData(
    ZTest_makeGameDataRaw({ words: WORDS, keyA: KEY, keyB: KEY, turnNum: 3, events: BYSTANDERS, ...over }),
    viewer,
  )
}

/** What a test sets on the board, flat; `props` groups it as `Board` takes it. */
type Over = Partial<{
  tiles: GTile[]
  moveCount: number
  isInteractive: boolean
  showsPartnerKey: boolean
  isViewingHistory: boolean
  pickedTile: GTile | null
  inFlightTile: GTile | null
  endingOutcome: EndOutcome | null
  isWaitingForTurn: boolean
  myTurnJustStarted: boolean
}>

/** Board props for a game seen by `viewer`; my guess turn, mid-game. */
function props(over: Over = {}, viewer = 'u1', facts: ZTest_GameDataFacts = {}): ComponentProps<typeof Board> {
  const gd = gdOf(viewer, facts)
  const o = { isViewingHistory: false, ...over }
  return {
    tiles: o.tiles ?? gd.me.board.tiles,
    moveCount: o.moveCount ?? 2,
    marks: {
      pickedTile: o.pickedTile ?? null,
      inFlightTile: o.inFlightTile ?? null,
      endingOutcome: o.endingOutcome ?? null,
      isWaitingForTurn: o.isWaitingForTurn ?? false,
      myTurnJustStarted: o.myTurnJustStarted ?? false,
    },
    historyView: {
      isViewing: o.isViewingHistory,
      viewedEventId: null,
      show: vi.fn(),
      exit: vi.fn(),
      tiles: null,
      litTileIds: new Set<string>(),
      label: null,
    },
    me: gd.me,
    partner: gd.partner,
    showsPartnerKey: o.showsPartnerKey ?? false,
    isInteractive: o.isInteractive ?? true,
    onPick: vi.fn(),
    onGuess: vi.fn(),
  }
}

function draw(viewer: string) {
  render(<Board {...props({}, viewer)} />)
}

/** The board with every prop settable; me, mid-game, my guess turn. */
function drawWith(over: Over = {}) {
  return render(<Board {...props(over)} />).container
}

const tile = (container: HTMLElement, word: RegExp) =>
  [...container.querySelectorAll('button')].find((b) => word.test(b.textContent ?? ''))!

describe('codenamesduet Board — the per-seat bystander lock', () => {
  it('my bystander is closed to me, my partner’s is open', () => {
    draw('u1')
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /berry/i })).toBeEnabled()
  })

  it('the same, the other way round, for my partner', () => {
    draw('u2')
    expect(screen.getByRole('button', { name: /berry/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })
})

describe('codenamesduet Board — my key card', () => {
  // While I guess, my own card says nothing about my partner's clue.
  it('is hidden while I am the one guessing', () => {
    expect(drawWith({ isInteractive: true }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(0)
  })

  it('is shown the rest of the time — cluing, waiting, game over', () => {
    expect(drawWith({ isInteractive: false }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(25)
  })
})

describe('codenamesduet Board — my partner’s key card', () => {
  const ENDED: ZTest_GameDataFacts = {
    ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
    outcome: 'neutral',
  }
  const keySquares = (over: Over, facts: ZTest_GameDataFacts) =>
    render(<Board {...props(over, 'u1', facts)} />).container.querySelectorAll(`.${styles.keyPartner}`)

  it('is shown once the game is over and I have asked to see it', () => {
    expect(keySquares({ showsPartnerKey: true }, ENDED)).toHaveLength(25)
  })

  it('is not shown mid-game, even when asked for — gd does not hold it', () => {
    expect(keySquares({ showsPartnerKey: true }, {})).toHaveLength(0)
  })

  it('is not shown at the end until I ask', () => {
    expect(keySquares({ showsPartnerKey: false }, ENDED)).toHaveLength(0)
  })
})

describe('codenamesduet Board — the bystander triangles', () => {
  // Apple is my bystander, berry my partner's.
  it('draws my partner’s above the word and mine below', () => {
    const container = drawWith()
    const berry = tile(container, /berry/)
    const apple = tile(container, /apple/)
    const partnerTri = berry.querySelector(`.${styles.triPartner}`)!
    const myTri = apple.querySelector(`.${styles.triMine}`)!
    expect(partnerTri).not.toBeNull()
    expect(myTri).not.toBeNull()
    // Above = before the word in the tile; below = after it.
    const berryWord = [...berry.querySelectorAll('span')].find((s) => s.textContent === 'berry')!
    const appleWord = [...apple.querySelectorAll('span')].find((s) => s.textContent === 'apple')!
    expect(partnerTri.compareDocumentPosition(berryWord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(myTri.compareDocumentPosition(appleWord) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // Each tile carries only its own triangle.
    expect(berry.querySelector(`.${styles.triMine}`)).toBeNull()
    expect(apple.querySelector(`.${styles.triPartner}`)).toBeNull()
  })

  it('drops both once the word is contacted — the builder points it at nobody', () => {
    const agentKey: GKey[] = [...'GGNNNNNNNNNAANNNNNNNNNNNN'] as GKey[]
    const events = [
      ...BYSTANDERS,
      ZTest_clue(5, 'u2', 3, 'z', 2),
      ZTest_guess(6, 'u1', 3, 0, 'G'),
      ZTest_guess(7, 'u1', 3, 1, 'G'),
    ]
    const gd = makeGameData(ZTest_makeGameDataRaw({ words: WORDS, keyA: KEY, keyB: agentKey, turnNum: 3, events }), 'u1')
    const container = drawWith({ tiles: gd.me.board.tiles })
    expect(container.querySelectorAll(`.${styles.triPartner}, .${styles.triMine}`)).toHaveLength(0)
  })
})

describe('codenamesduet Board — the board marks', () => {
  const grid = (c: HTMLElement) => c.querySelector('[data-board] > div') as HTMLElement

  it('dims the tile whose guess is in flight, and no other', () => {
    const c = drawWith({ inFlightTile: gdOf().me.board.tiles[3]! })
    const dimmed = [...c.querySelectorAll('button')].filter((b) => b.classList.contains(shared.dimInFlight))
    expect(dimmed.map((b) => b.textContent)).toEqual(['word3'])
  })

  it('dims the board while my partner holds the move, and flashes its frame as it becomes mine', () => {
    expect(grid(drawWith({ isWaitingForTurn: true, isInteractive: false })).className).toMatch(shared.dimNotYourTurn)
    expect(grid(drawWith({ myTurnJustStarted: true })).className).toMatch(shared.yourTurnFlash)
    const live = grid(drawWith()).className
    expect(live).not.toMatch(shared.dimNotYourTurn)
    expect(live).not.toMatch(shared.yourTurnFlash)
  })

  it('frames a finished board in its outcome, and gives the frame up to the history viewer', () => {
    const won = grid(drawWith({ endingOutcome: 'won' })).className
    expect(won).toMatch(shared.endingFrame)
    expect(won).toMatch(shared.endingFrame_won)
    expect(grid(drawWith({ endingOutcome: 'lost' })).className).toMatch(shared.endingFrame_lost)
    const ended = grid(drawWith({ endingOutcome: 'neutral' })).className
    expect(ended).toMatch(shared.endingFrame)
    expect(ended).not.toMatch(shared.endingFrame_won)
    expect(grid(drawWith({ endingOutcome: 'won', isViewingHistory: true })).className).not.toMatch(shared.endingFrame)
    expect(grid(drawWith()).className).not.toMatch(shared.endingFrame)
  })
})

describe('codenamesduet Board — attention and the shake', () => {
  const live = gdOf()
  // The board with tile `p` showing `as` — a reveal landing.
  const turned = (tiles: GTile[], p: number, as: GKey) =>
    tiles.map((t) => (Number(t.id) === p ? { ...t, revealed: { as, arrows: new Set<GPlayer>() } } : t))
  const at = (over: Over) => <Board {...props({ tiles: live.me.board.tiles, ...over })} />
  const flashingWords = (c: HTMLElement) =>
    [...c.querySelectorAll('button')].filter((b) => b.classList.contains(shared.attentionFlash)).map((b) => b.textContent)

  afterEach(() => vi.useRealTimers())

  it('flashes the tile a guess turned over, on the move and not otherwise', () => {
    const { container, rerender } = render(at({}))
    rerender(at({ tiles: turned(live.me.board.tiles, 5, 'G'), moveCount: 3 }))
    expect(flashingWords(container)).toEqual(['word5'])
  })

  it('does not flash a board that changed with no guess behind it', () => {
    const { container, rerender } = render(at({}))
    rerender(at({ tiles: turned(live.me.board.tiles, 5, 'G') }))
    expect(flashingWords(container)).toEqual([])
  })

  it('stays quiet while a past turn is open', () => {
    const { container, rerender } = render(at({ isViewingHistory: true }))
    rerender(at({ isViewingHistory: true, tiles: turned(live.me.board.tiles, 5, 'G'), moveCount: 3 }))
    expect(flashingWords(container)).toEqual([])
  })

  it('shakes an assassin or a bystander once the flash is done, never an agent', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(at({}))
    rerender(at({ tiles: turned(turned(live.me.board.tiles, 5, 'G'), 6, 'A'), moveCount: 4 }))
    const shaking = () =>
      [...container.querySelectorAll('button')].filter((b) => b.classList.contains(shared.verdictShake)).map((b) => b.textContent)
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect(shaking()).toEqual([]) // still under the flash
    act(() => vi.advanceTimersByTime(1))
    expect(shaking()).toEqual(['word6'])
  })
})
