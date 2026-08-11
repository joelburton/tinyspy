/**
 * serverError — the one place a failed server call becomes something a player
 * reads.
 *
 * The contract these pin, in order of how badly a regression would hurt:
 *
 *   1. **Copy lives in TypeScript.** A key with an ERROR_COPY entry gets that
 *      entry's words; the server's raw text never reaches a player.
 *   2. **Membership is the classification.** No copy → fault, no exceptions —
 *      that's what makes an unconverted or forgotten key visibly wrong instead
 *      of quietly ugly.
 *   3. **Prose never parses as a key.** During the migration most messages are
 *      still sentences, and one of them being half-read as a key would produce
 *      a confident, wrong caption.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERROR_COPY } from './errorCopy'
import { classifyFailure, failureMessage, parseServerKey } from './serverError'

/** ERROR_COPY is a module-level table; tests that add to it clean up after. */
const added: string[] = []
function withCopy(key: string, entry: (typeof ERROR_COPY)[string]) {
  ERROR_COPY[key] = entry
  added.push(key)
}
afterEach(() => {
  for (const k of added.splice(0)) delete ERROR_COPY[k]
})

describe('parseServerKey', () => {
  it('reads a key and its details', () => {
    expect(parseServerKey('unplayable-board|BITCH|')).toEqual({
      key: 'unplayable-board',
      details: ['BITCH'],
    })
  })

  it('reads a key with no details', () => {
    expect(parseServerKey('already-ended|')).toEqual({ key: 'already-ended', details: [] })
  })

  it('reads several details in order', () => {
    expect(parseServerKey('chain-full|5|joel|')?.details).toEqual(['5', 'joel'])
  })

  it('rejects a message with no trailing delimiter', () => {
    // The trailing `|` is how a player can tell a truncated message from a whole
    // one on a phone — so a message without it is not a key, by definition.
    expect(parseServerKey('unplayable-board|BITCH')).toBeNull()
  })

  it('rejects prose, including prose containing a pipe', () => {
    // Every unconverted message in the app is still prose; none may parse.
    expect(parseServerKey('the chain is full at 5 words — undo to try another route')).toBeNull()
    expect(parseServerKey('BITCH cannot be played on this board')).toBeNull()
    expect(parseServerKey('a | b |')).toBeNull()
    expect(parseServerKey('')).toBeNull()
    expect(parseServerKey(undefined)).toBeNull()
  })
})

describe('classifyFailure', () => {
  it('calls a keyed error with copy EXPECTED', () => {
    withCopy('chain-full', { text: () => 'Chain is full' })
    expect(classifyFailure({ message: 'chain-full|5|', code: 'P0001' })).toEqual({
      kind: 'expected', key: 'chain-full', details: ['5'],
    })
  })

  it('calls a keyed error WITHOUT copy a fault — membership is the whole test', () => {
    expect(classifyFailure({ message: 'unplayable-board|BITCH|', code: 'P0001' }))
      .toEqual({ kind: 'fault', raw: 'unplayable-board|BITCH|' })
  })

  it('calls an error we never wrote a fault — permission denied, PGRST, anything', () => {
    expect(classifyFailure({ message: 'permission denied for schema letterboxed', code: '42501' }))
      .toEqual({ kind: 'fault', raw: 'permission denied for schema letterboxed' })
  })

  it('calls a codeless error TRANSPORT — a rejected fetch has no SQLSTATE', () => {
    expect(classifyFailure({ message: 'TypeError: Load failed', code: '' }))
      .toEqual({ kind: 'transport', cause: 'Server' })
  })
})

describe('failureMessage', () => {
  it('shows the TypeScript copy, never the server text', () => {
    withCopy('chain-full', { text: (d) => `Chain is full at ${d[0]}` })
    const msg = failureMessage({ message: 'chain-full|5|', code: 'P0001' }, 'word')
    expect(msg.text).toBe('Chain is full at 5')
    expect(msg.fault).toBeUndefined()
  })

  it('honours a copy entry that is news rather than a failure', () => {
    withCopy('already-ended', { text: () => 'Game over', tone: 'info' })
    expect(failureMessage({ message: 'already-ended|', code: 'P0001' }, 'word').tone).toBe('info')
  })

  it('renders an unknown key as a FAULT carrying the raw text', () => {
    // Raw and unedited: it isn't written for them, but a friend reading it back
    // down the phone is the entire diagnosis.
    const msg = failureMessage({ message: 'unplayable-board|BITCH|', code: 'P0001' }, 'word')
    expect(msg.fault).toBe(true)
    expect(msg.text).toBe('word|unplayable-board|BITCH|')
  })

  it('a fault is MANUAL — it must survive the next keystroke to be read out', () => {
    const msg = failureMessage({ message: 'boom', code: '42501' }, 'word')
    expect(msg.mode).toEqual({ kind: 'manual' })
  })

  it('composes the transport line, and says Offline only when it is a fact', () => {
    const online = failureMessage({ message: 'TypeError: Load failed', code: '' }, 'reveal')
    expect(online.text).toBe('reveal: Server; try refresh')
    expect(online.fault).toBe(true)

    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(failureMessage({ message: 'TypeError: Load failed', code: '' }, 'reveal').text)
      .toBe('reveal: Offline; try again')
    spy.mockRestore()
  })
})

/**
 * The EDGE-FUNCTION path, found while converting spellingbee: a key raised by
 * SQL inside a build-board function arrives at the frontend with its SQLSTATE
 * stripped. functions-js reports its own generic error and the real one is dug
 * out of the response body by `unwrapEdgeFnError`, which recovers the message
 * and nothing else.
 *
 * Every "New game" failure takes that path, so getting it wrong would file all
 * of them as transport failures — "new game: Server; try refresh" on a board
 * the server refused for a reason it had stated precisely.
 */
describe('classifyFailure — a key that lost its SQLSTATE', () => {
  it('is still EXPECTED when the key has copy, code or no code', () => {
    withCopy('no-required-words', { text: () => 'No words for those letters' })
    expect(classifyFailure({ message: 'no-required-words|' })).toEqual({
      kind: 'expected', key: 'no-required-words', details: [],
    })
    expect(classifyFailure({ message: 'no-required-words|', code: '' })).toEqual({
      kind: 'expected', key: 'no-required-words', details: [],
    })
  })

  it('is a FAULT, not transport, when the key has no copy', () => {
    // The distinction that matters: the server DID answer. Calling it transport
    // would tell the player to check their connection over a rule decision.
    expect(classifyFailure({ message: 'bad-outer-letters|7|', code: '' }))
      .toEqual({ kind: 'fault', raw: 'bad-outer-letters|7|' })
  })

  it('still calls a genuinely codeless NON-key transport', () => {
    expect(classifyFailure({ message: 'TypeError: Load failed', code: '' }).kind).toBe('transport')
  })
})
