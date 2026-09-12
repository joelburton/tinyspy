// cs-blessed-feedback

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { waitingForText } from './turnText'

describe('waitingForText', () => {
  it('names the player mid-sentence, with an ellipsis for the wait', () => {
    render(<p>{waitingForText({ username: 'moth', color: 'green' })}</p>)
    expect(screen.getByText(/Waiting for/)).toHaveTextContent('Waiting for moth…')
  })

  it('falls back to "a player" for a lookup that missed', () => {
    render(<p>{waitingForText(undefined)}</p>)
    expect(screen.getByText(/Waiting for/)).toHaveTextContent('Waiting for a player…')
  })
})
