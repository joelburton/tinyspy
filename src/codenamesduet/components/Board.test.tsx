// cs-met-codenamesduet

/**
 * The board's per-tile marks and gates: the per-seat bystander lock (a word I
 * hit as a bystander is closed to me, and one my partner hit stays open — it
 * may be my agent), the two key-card squares and the two bystander triangles.
 * The marks are found by their CSS-module class, read off the stylesheet.
 */
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Board } from './Board'
import styles from './Board.module.css'
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
      gameOver={false}
      cellsClickable
      pendingPos={null}
      onGuess={vi.fn()}
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
      gameOver={false}
      cellsClickable
      pendingPos={null}
      onGuess={vi.fn()}
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
    expect(drawWith({ cellsClickable: true }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(0)
  })

  it('is shown the rest of the time — cluing, waiting, game over', () => {
    expect(drawWith({ cellsClickable: false }).querySelectorAll(`.${styles.keyMine}`)).toHaveLength(25)
  })
})

describe('codenamesduet Board — my partner’s key card', () => {
  const theirs = Array.from({ length: 25 }, () => 'G' as const)

  it('is shown once the game is over and I have asked to see it', () => {
    expect(drawWith({ gameOver: true, peerKey: theirs }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(25)
  })

  it('is not shown mid-game, even when handed one', () => {
    expect(drawWith({ gameOver: false, peerKey: theirs }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(0)
  })

  it('is not shown at the end until I ask', () => {
    expect(drawWith({ gameOver: true, peerKey: null }).querySelectorAll(`.${styles.keyPeer}`)).toHaveLength(0)
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
