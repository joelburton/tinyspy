// cs-unmet

/**
 * The key-group table: a group's keys are what `pressed` matches.
 */
import { describe, expect, it } from 'vitest'
import { pressed } from './componentKeyGroups'

const press = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key, code: '', metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, ...mods }) as KeyboardEvent

describe('pressed', () => {
  it('matches every key of the group, and nothing else', () => {
    expect(pressed('keys-list-move', press('ArrowUp'))).toBe(true)
    expect(pressed('keys-list-move', press('ArrowDown'))).toBe(true)
    expect(pressed('keys-list-move', press('ArrowLeft'))).toBe(false)
  })

  it('reads ⇧ where the group says so: Tab and ⇧Tab both go round a ring', () => {
    expect(pressed('keys-tab-ring', press('Tab'))).toBe(true)
    expect(pressed('keys-tab-ring', press('Tab', { shiftKey: true }))).toBe(true)
    // …while stepping out of a panel's field is Tab alone.
    expect(pressed('keys-leave-field', press('Tab', { shiftKey: true }))).toBe(false)
  })

  it('never matches a Cmd or Ctrl chord — Ctrl-Tab is the browser’s', () => {
    expect(pressed('keys-tab-ring', press('Tab', { ctrlKey: true }))).toBe(false)
    expect(pressed('keys-list-open', press('Enter', { metaKey: true }))).toBe(false)
  })
})
