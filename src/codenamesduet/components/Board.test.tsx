// cs-blessed-codenamesduet

/**
 * The board's per-tile marks and gates: the per-seat bystander lock (a word I
 * hit as a bystander is closed to me, and one my partner hit stays open — it
 * may be my agent), the two key-card squares and the two bystander triangles,
 * and the shared board marks — the in-flight dim, the turn dim and flash, the
 * game-over frame, the attention flash and the shake.
 * The marks are found by their CSS-module class, read off the stylesheet.
 */
import { act, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board } from './Board'
import styles from './Board.module.css'
import shared from '@/common/game-page/playArea.module.css'
import { ATTENTION_FADE_MS } from '@/common/board-marks/feedbackTiming'
import type { Seat } from '../lib/phase'

// Position 0 was hit as a bystander by seat A, position 1 by seat B.
const words = Array.from({ length: 25 }, (_, i) => ({
  position: i,
  word: i === 0 ? 'apple' : i === 1 ? 'berry' : `word${i}`,
  revealed_as: null,
  neutral_a: i === 0,
  neutral_b: i === 1,
}))

function draw(mySeat: Seat) {
  render(
    <Board
      words={words}
      myKey={Array.from({ length: 25 }, () => 'N' as const)}
      peerKey={null}
      mySeat={mySeat}
      isTerminal={false}
      isBoardInteractive
      inFlightPos={null}
      onGuess={vi.fn()}
      cursor={null}
      picked={null}
      isWaitingForTurn={false}
      myTurnJustStarted={false}
      moveCount={0}
      terminalOutcome={null}
    />,
  )
}

/** The board with every prop settable; seat A, mid-game, my guess turn. */
function drawWith(over: Partial<ComponentProps<typeof Board>> = {}) {
  return render(
    <Board
      words={words}
      myKey={Array.from({ length: 25 }, () => 'N' as const)}
      peerKey={null}
      mySeat="A"
      isTerminal={false}
      isBoardInteractive
      inFlightPos={null}
      onGuess={vi.fn()}
      cursor={null}
      picked={null}
      isWaitingForTurn={false}
      myTurnJustStarted={false}
      moveCount={0}
      terminalOutcome={null}
      {...over}
    />,
  ).container
}

const tile = (container: HTMLElement, word: RegExp) =>
  [...container.querySelectorAll('button')].find((b) => word.test(b.textContent ?? ''))!

describe('codenamesduet Board — the per-seat bystander lock', () => {
  it('as seat A: my bystander is closed, my partner’s is open', () => {
    draw('A')
    expect(screen.getByRole('button', { name: /apple/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /berry/i })).toBeEnabled()
  })

  it('as seat B: the same, the other way round', () => {
    draw('B')
    expect(screen.getByRole('button', { name: /berry/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /apple/i })).toBeEnabled()
  })
})

describe('codenamesduet Board — my key card', () => {
  // While I guess, my own card says nothing about my partner's clue.
  it('is hidden while I am the one guessing', () => {
    expect(drawWith({ isBoardInteractive: true }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(0)
  })

  it('is shown the rest of the time — cluing, waiting, game over', () => {
    expect(drawWith({ isBoardInteractive: false }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(25)
  })
})

describe('codenamesduet Board — my partner’s key card', () => {
  const theirs = Array.from({ length: 25 }, () => 'G' as const)

  it('is shown once the game is over and I have asked to see it', () => {
    expect(drawWith({ isTerminal: true, peerKey: theirs }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(25)
  })

  it('is not shown mid-game, even when handed one', () => {
    expect(drawWith({ isTerminal: false, peerKey: theirs }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(0)
  })

  it('is not shown at the end until I ask', () => {
    expect(drawWith({ isTerminal: true, peerKey: null }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(0)
  })
})

describe('codenamesduet Board — the bystander triangles', () => {
  // As seat A: apple is my bystander (neutral_a), berry my partner's (neutral_b).
  it('draws my partner’s above the word and mine below', () => {
    const container = drawWith()
    const berry = tile(container, /berry/)
    const apple = tile(container, /apple/)
    const peerTri = berry.querySelector(`.${styles.triPeer}`)!
    const myTri = apple.querySelector(`.${styles.triMine}`)!
    expect(peerTri).not.toBeNull()
    expect(myTri).not.toBeNull()
    // Above = before the word in the tile; below = after it.
    const berryWord = [...berry.querySelectorAll('span')].find((s) => s.textContent === 'berry')!
    const appleWord = [...apple.querySelectorAll('span')].find((s) => s.textContent === 'apple')!
    expect(peerTri.compareDocumentPosition(berryWord) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(myTri.compareDocumentPosition(appleWord) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // Each tile carries only its own triangle.
    expect(berry.querySelector(`.${styles.triMine}`)).toBeNull()
    expect(apple.querySelector(`.${styles.triPeer}`)).toBeNull()
  })

  it('drops both once the word is turned over', () => {
    const turned = words.map((w) => (w.position < 2 ? { ...w, revealed_as: 'G' as const } : w))
    const container = drawWith({ words: turned })
    expect(container.querySelectorAll(`.${styles.triPeer}, .${styles.triMine}`)).toHaveLength(0)
  })
})

describe('codenamesduet Board — the board marks', () => {
  const grid = (c: HTMLElement) => c.querySelector('[data-board] > div') as HTMLElement

  it('dims the tile whose guess is in flight, and no other', () => {
    const c = drawWith({ inFlightPos: 3 })
    const dimmed = [...c.querySelectorAll('button')].filter((b) => b.classList.contains(shared.dimInFlight))
    expect(dimmed.map((b) => b.textContent)).toEqual(['word3'])
  })

  it('dims the board while my partner holds the move, and flashes its frame as it becomes mine', () => {
    expect(grid(drawWith({ isWaitingForTurn: true, isBoardInteractive: false })).className).toMatch(shared.dimNotYourTurn)
    expect(grid(drawWith({ myTurnJustStarted: true })).className).toMatch(shared.yourTurnFlash)
    const live = grid(drawWith()).className
    expect(live).not.toMatch(shared.dimNotYourTurn)
    expect(live).not.toMatch(shared.yourTurnFlash)
  })

  it('frames a finished board in its outcome, and gives the frame up to the history viewer', () => {
    const won = grid(drawWith({ terminalOutcome: 'won' })).className
    expect(won).toMatch(shared.gameOverFrame)
    expect(won).toMatch(shared.gameOverWon)
    expect(grid(drawWith({ terminalOutcome: 'lost' })).className).toMatch(shared.gameOverLost)
    const ended = grid(drawWith({ terminalOutcome: 'neutral' })).className
    expect(ended).toMatch(shared.gameOverFrame)
    expect(ended).not.toMatch(shared.gameOverWon)
    expect(grid(drawWith({ terminalOutcome: 'won', isViewingHistory: true })).className).not.toMatch(shared.gameOverFrame)
    expect(grid(drawWith()).className).not.toMatch(shared.gameOverFrame)
  })
})

describe('codenamesduet Board — attention and the shake', () => {
  const props = (over: Partial<ComponentProps<typeof Board>> = {}) => ({
    words, myKey: Array.from({ length: 25 }, () => 'N' as const), peerKey: null,
    mySeat: 'A' as const, isTerminal: false, isBoardInteractive: true, inFlightPos: null,
    onGuess: vi.fn(), cursor: null, picked: null, isWaitingForTurn: false, myTurnJustStarted: false, moveCount: 2,
    terminalOutcome: null, ...over,
  })
  const turned = (p: number, as: 'G' | 'A') => words.map((w) => (w.position === p ? { ...w, revealed_as: as } : w))
  const flashingWords = (c: HTMLElement) =>
    [...c.querySelectorAll('button')].filter((b) => b.classList.contains(shared.attentionFlash)).map((b) => b.textContent)

  afterEach(() => vi.useRealTimers())

  it('flashes the tile a guess turned over, on the move and not otherwise', () => {
    const { container, rerender } = render(<Board {...props()} />)
    rerender(<Board {...props({ words: turned(5, 'G'), moveCount: 3 })} />)
    expect(flashingWords(container)).toEqual(['word5'])
  })

  it('does not flash a board that changed with no guess behind it', () => {
    const { container, rerender } = render(<Board {...props()} />)
    rerender(<Board {...props({ words: turned(5, 'G') })} />)
    expect(flashingWords(container)).toEqual([])
  })

  it('stays quiet while a past turn is open', () => {
    const { container, rerender } = render(<Board {...props({ isViewingHistory: true })} />)
    rerender(<Board {...props({ isViewingHistory: true, words: turned(5, 'G'), moveCount: 3 })} />)
    expect(flashingWords(container)).toEqual([])
  })

  it('shakes an assassin or a bystander once the flash is done, never an agent', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<Board {...props()} />)
    const both = turned(5, 'G').map((w) => (w.position === 6 ? { ...w, revealed_as: 'A' as const } : w))
    rerender(<Board {...props({ words: both, moveCount: 4 })} />)
    const shaking = () =>
      [...container.querySelectorAll('button')].filter((b) => b.classList.contains(shared.verdictShake)).map((b) => b.textContent)
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect(shaking()).toEqual([]) // still under the flash
    act(() => vi.advanceTimersByTime(1))
    expect(shaking()).toEqual(['word6'])
  })
})
