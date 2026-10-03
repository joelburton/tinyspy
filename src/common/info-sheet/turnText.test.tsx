// cs-blessed-feedback

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { waitingForText } from './turnText'

describe('waitingForText', () => {
  it('names the player mid-sentence, with an ellipsis for the wait', () => {
    render(<p>{waitingForText({ id: 'u2', username: 'moth', color: 'green' })}</p>)
    expect(screen.getByText(/Waiting for/)).toHaveTextContent('Waiting for moth…')
  })
})
