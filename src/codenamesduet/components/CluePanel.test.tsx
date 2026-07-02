/**
 * Regression guard for the two-kinds-of-text-input contract (docs/common.md →
 * keyboard shortcuts): codenamesduet's clue inputs must be tagged
 * `data-game-input` so the global `/ ? ~` shortcuts still fire while you're
 * typing a clue (you can hit `/` to chat without clicking away). This is the
 * counterpart to the chat box being `data-chat-input` (NOT a game input), so
 * `/` types a literal slash there. `isNonGameField`'s LOGIC is covered in
 * useAppShortcuts.test.ts; this pins that the actual clue inputs carry the tag.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CluePanel } from './CluePanel'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))

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
        onError={vi.fn()}
        onSuggestionChange={vi.fn()}
      />,
    )
    const inputs = container.querySelectorAll('input')
    // The clue-giver's clue phase shows exactly the count + word fields.
    expect(inputs).toHaveLength(2)
    inputs.forEach((input) => expect(input).toHaveAttribute('data-game-input'))
  })
})
