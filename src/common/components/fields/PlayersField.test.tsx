// cs-unmet

/**
 * WHO IS PLAYING (see PlayersField.tsx) — that it reports the new set, and that
 * the creator cannot be dropped from it.
 *
 * That second rule is stated twice in the component: the creator's checkbox is
 * `disabled`, and `toggle` refuses their id. Both are wanted — the attribute
 * stops a click, and the guard stops anything else that reaches the handler —
 * and a test is what keeps them agreeing, since either one alone still looks
 * correct on screen.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayersField } from './PlayersField'
import { expectFieldContract } from './fieldContract'
import type { Member } from '../../lib/games'

const MEMBERS = [
  { user_id: 'self', username: 'joel', color: 'red' },
  { user_id: 'moth', username: 'moth', color: 'blue' },
] as Member[]

function draw(value: Set<string>, onChange = vi.fn()) {
  render(
    <PlayersField
      name="player_user_ids"
      members={MEMBERS}
      selfId="self"
      value={value}
      onChange={onChange}
    />,
  )
  return onChange
}


expectFieldContract((props) => (
  render(<PlayersField members={MEMBERS} selfId="self" value={new Set(['self'])} onChange={() => {}} {...props} />)
))

describe('PlayersField', () => {
  it('reports the new set, not the row that was clicked', async () => {
    // The field holds the current value and knows who is pinned, so it is the
    // one place that can compute this — a caller handed a bare id would have to
    // re-derive what the field already had.
    const user = userEvent.setup()
    const onChange = draw(new Set(['self', 'moth']))

    await user.click(screen.getByRole('checkbox', { name: /moth/ }))

    expect(onChange).toHaveBeenCalledWith(new Set(['self']))
  })

  it('adds someone back', async () => {
    const user = userEvent.setup()
    const onChange = draw(new Set(['self']))

    await user.click(screen.getByRole('checkbox', { name: /moth/ }))

    expect(onChange).toHaveBeenCalledWith(new Set(['self', 'moth']))
  })

  it('will not drop the creator, however the handler is reached', () => {
    const onChange = draw(new Set(['self', 'moth']))
    const selfBox = screen.getByRole('checkbox', { name: /joel/ })

    expect(selfBox).toBeDisabled()
    // Past the disabled attribute, straight at the handler: the guard has to
    // hold on its own, because the attribute is a UI affordance and this is the
    // rule.
    selfBox.removeAttribute('disabled')
    selfBox.click()

    expect(onChange).not.toHaveBeenCalled()
  })
})
